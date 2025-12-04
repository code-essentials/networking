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
    // live = true when parser is reading from piped stdin (streaming mode).
    this.live = !!(process.stdin && !process.stdin.isTTY)
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

    // Try to find explicit ack id patterns (various log formats)
    const idMatch = line.match(/\b(?:id|ack id)\s*[:=]?\s*(\d+)/i)
      || line.match(/calling ack\s*(\d+)/i)
      || line.match(/\back\s*(\d+)\b/i)
      || (packet && packet.id ? [null, packet.id] : null)
    const ackId = idMatch ? Number(idMatch[1]) : (packet && typeof packet.id === 'number' ? packet.id : null)

    // Determine type: prefer packet.type when present. Also detect 'calling ack' or 'sending ack' text.
    let packetType = null
    if (packet && packet.type !== undefined) packetType = packet.type
    else if (/\b(?:sending ack|calling ack)\b/i.test(line) || /"type"\s*:\s*3/.test(line)) packetType = 3
    else if (/\b(?:writing packet)\b/i.test(line) && /"type"\s*:\s*2/.test(line)) packetType = 2

    // If outbound event with ack id -> create request
    if (packetType === 2 && ackId != null && this._isOutbound(line)) {
      const entry = this._createLogEntry({ timestamp, event: this._extractEventName(line, packet), node: source, ackId, payload: packet.data || null, status: 'pending' })
      const map = source === 'Client' ? this.pendingClientRequests : this.pendingServerRequests
      // Only set a timeout when running in live (streaming) mode. When
      // parsing a static file we should not artificially time out pending
      // requests because their ACKs may appear later in the file.
      const timer = this.live ? setTimeout(() => this._onTimeout(entry, map), this.timeoutMs) : null
      map.set(ackId, { entry, timer })
      this.emit('entry', entry)
      return
    }

    // If inbound ACK (type 3) -> correlate
    if ((packetType === 3 || (/got packet/.test(line) && /"type":3/.test(line)) || /calling ack/.test(line)) && ackId != null && this._isInbound(line)) {
      // ACK received by this node; find in the same-side pending map where
      // the original request was stored (e.g., client-side pending map when
      // client processes the ACK).
      const targetMap = source === 'Client' ? this.pendingClientRequests : this.pendingServerRequests
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
    // Prefer explicit client marker first
    if (/socket\.io-client\b/.test(line)) return 'Client'
    // Generic socket.io logs (server-side) commonly use 'socket.io:' or 'socket.io' prefixes
    // Also consider 'engine' which is part of engine.io/server logs
    if (/\bsocket\.io\b|socket\.io:|\bengine\b/.test(line)) return 'Server'
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
