/*
  Parser module: reads process.stdin line-by-line, parses timestamps, source, packet JSON,
  correlates ACKs, emits 'entry' events for renderer.
*/
const EventEmitter = require('events')
const readline = require('readline')

class Parser extends EventEmitter {
  constructor(config) {
    super()
    this.pendingClientRequests = new Map()
    this.pendingServerRequests = new Map()
    this.LOG = []
    this.timeoutMs = config?.timeoutMs ?? 10_000
    // Only set up stdin reading when there is piped input. This avoids
    // consuming a terminal stdin when the app is started normally.
    if (process.stdin && !process.stdin.isTTY) {
      this._setupStdin()
    }
  }

  _setupStdin() {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
    rl.on('line', (line) => this._handleLine(line))
    rl.on('close', () => {
      // EOF: emit an explicit end entry so the UI can react if desired
      this.emit('end')
    })
  }

  _handleLine(line) {
    // Quick regex-based parsing following TODO.md
    const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)
    const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString()

    const source = this._detectSource(line)

    // Attempt to find a JSON packet
    const jsonMatch = line.match(/(\{\s*"type"[\s\S]*\})/)
    let packet = null
    if (jsonMatch) {
      try { packet = JSON.parse(jsonMatch[1]) } catch (e) { packet = null }
    }

    // Try to find explicit ack id patterns
    const idMatch = line.match(/\b(?:id|ack id)\s*[:=]?\s*(\d+)/i) || (packet && packet.id ? [null, packet.id] : null)
    const ackId = idMatch ? Number(idMatch[1]) : (packet && typeof packet.id === 'number' ? packet.id : null)

    // Determine type based on 'type' field or keywords: 2 = EVENT, 3 = ACK
    const packetType = packet && packet.type !== undefined ? packet.type : (line.includes('writing packet') && line.includes('"type":2') ? 2 : (line.includes('"type":3') ? 3 : null))

    // If outbound event with ack id -> create request
    if (packetType === 2 && ackId != null && this._isOutbound(line)) {
      const entry = this._createLogEntry({ timestamp, event: this._extractEventName(line, packet), node: source, ackId, payload: packet.data || null, status: 'pending' })
      const map = source === 'Client' ? this.pendingClientRequests : this.pendingServerRequests
      const timer = setTimeout(() => this._onTimeout(entry, map), this.timeoutMs)
      map.set(ackId, { entry, timer })
      this.emit('entry', entry)
      return
    }

    // If inbound ACK (type 3) -> correlate
    if ((packetType === 3 || /got packet/.test(line) && /"type":3/.test(line)) && ackId != null && this._isInbound(line)) {
      // ACK received by destination; find in opposite pending map
      const targetMap = source === 'Client' ? this.pendingServerRequests : this.pendingClientRequests
      const record = targetMap.get(ackId)
      if (record) {
        clearTimeout(record.timer)
        record.entry.status = 'success'
        record.entry.ackPayload = packet && packet.data ? packet.data : this._extractAckPayload(line)
        this.emit('entry', record.entry)
        targetMap.delete(ackId)
        return
      }
    }

    // No special handling: emit a generic log line
    const entry = this._createLogEntry({ timestamp, raw: line, node: source, status: 'info' })
    this.emit('entry', entry)
  }

  _isOutbound(line) {
    // heuristic: 'writing packet' or 'sending' or 'emitting'
    return /writing packet|emitting packet|sending ack|sending packet|emitting/.test(line)
  }

  _isInbound(line) {
    return /got packet|received packet|calling ack|dispatching an event/.test(line)
  }

  _detectSource(line) {
    if (/socket.io-client:/.test(line)) return 'Client'
    if (/socket.io:server|socket.io:socket|engine/.test(line)) return 'Server'
    return 'Unknown'
  }

  _extractEventName(line, packet) {
    if (packet && Array.isArray(packet.data) && typeof packet.data[0] === 'string') return packet.data[0]
    const m = line.match(/\["([^"\]]+)"/) || line.match(/event:\s*([\w._-]+)/i)
    return m ? m[1] : '<unknown>'
  }

  _extractAckPayload(line) {
    const m = line.match(/calling ack \d+ with \[\[?([^\]]+)\]?\]/i)
    return m ? m[1] : null
  }

  _createLogEntry(obj) {
    const entry = Object.assign({ id: this.LOG.length + 1, ts: obj.timestamp || new Date().toISOString() }, obj)
    this.LOG.push(entry)
    return entry
  }

  _onTimeout(entry, map) {
    entry.status = 'timeout'
    entry.timeoutMessage = 'TIMEOUT (No ACK Received)'
    // find and remove
    for (const [k, v] of map.entries()) {
      if (v.entry === entry) {
        map.delete(k)
        break
      }
    }
    this.emit('entry', entry)
  }

  // Public method to feed a single line into the parser (useful when
  // opening a file via File > Open or programmatic feeding).
  feed(line) {
    this._handleLine(line)
  }
}

// If required as module
const parser = new Parser({ })
module.exports = parser

// If run directly, allow feeding sample lines from stdin (script supports test-parser)
if (require.main === module) {
  // For test run, print entries to stdout
  parser.on('entry', (e) => console.log(JSON.stringify(e)))
}
