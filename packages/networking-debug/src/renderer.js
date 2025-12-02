// Renderer: listens for 'log-entry' from preload and updates table
const tbody = document.getElementById('log-body')

window.electron.onLogEntry((entry) => {
  const tr = document.createElement('tr')
  const tsTd = document.createElement('td')
  tsTd.textContent = entry.ts || entry.timestamp || ''
  const eventTd = document.createElement('td')
  eventTd.textContent = entry.event || entry.raw || ''
  const clientTd = document.createElement('td')
  const serverTd = document.createElement('td')
  if (entry.node === 'Client') {
    clientTd.textContent = entry.payload ? JSON.stringify(entry.payload) : entry.ackPayload || entry.raw || ''
  } else if (entry.node === 'Server') {
    serverTd.textContent = entry.payload ? JSON.stringify(entry.payload) : entry.ackPayload || entry.raw || ''
  } else {
    clientTd.textContent = entry.raw || ''
  }
  const statusTd = document.createElement('td')
  statusTd.textContent = (entry.status || '').toUpperCase()

  if (entry.status === 'success') tr.className = 'status-success'
  if (entry.status === 'pending') tr.className = 'status-pending'
  if (entry.status === 'timeout') tr.className = 'status-timeout'

  tr.appendChild(tsTd)
  tr.appendChild(eventTd)
  tr.appendChild(clientTd)
  tr.appendChild(serverTd)
  tr.appendChild(statusTd)
  tbody.appendChild(tr)
  // auto-scroll
  const container = document.querySelector('.log-container')
  container.scrollTop = container.scrollHeight
})
