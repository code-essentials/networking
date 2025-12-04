// Renderer: buffer entries and render according to visibility filters.
const tbody = document.getElementById('log-body')
const container = document.querySelector('.log-container')

// Master list of entries (preserve arrival order)
const entries = []

// Visibility map for different status keys
const visibility = {
  info: true,
  success: true,
  timeout: true,
  pending: true,
  other: true
}

// Helper: map entry.status to one of the visibility keys
function statusKey(entry) {
  if (!entry || !entry.status) return 'other'
  const s = (entry.status || '').toString().toLowerCase()
  if (s === 'success') return 'success'
  if (s === 'pending') return 'pending'
  if (s === 'timeout') return 'timeout'
  if (s === 'info') return 'info'
  return 'other'
}

// Create table row for an entry (with expand/collapse behavior)
function createRow(entry) {
  const tr = document.createElement('tr')
  tr.dataset.entryId = entry.id || entries.indexOf(entry)

  const tsTd = document.createElement('td')
  tsTd.textContent = entry.ts || entry.timestamp || ''
  const eventTd = document.createElement('td')
  eventTd.textContent = entry.event || entry.raw || ''
  const clientTd = document.createElement('td')
  const serverTd = document.createElement('td')

  const contentFor = (entry) => {
    if (entry.payload) return JSON.stringify(entry.payload)
    if (entry.ackPayload) return entry.ackPayload
    return entry.raw || ''
  }

  if (entry.node === 'Client') {
    clientTd.textContent = contentFor(entry)
  } else if (entry.node === 'Server') {
    serverTd.textContent = contentFor(entry)
  } else {
    clientTd.textContent = entry.raw || ''
  }

  const statusTd = document.createElement('td')
  statusTd.textContent = (entry.status || '').toUpperCase()

  tr.appendChild(tsTd)
  tr.appendChild(eventTd)
  tr.appendChild(clientTd)
  tr.appendChild(serverTd)
  tr.appendChild(statusTd)

  // apply status classes
  const sk = statusKey(entry)
  if (sk === 'success') tr.classList.add('status-success')
  if (sk === 'pending') tr.classList.add('status-pending')
  if (sk === 'timeout') tr.classList.add('status-timeout')

  // Click to expand/collapse row cells
  tr.addEventListener('click', (ev) => {
    // toggle expanded state on the row
    const expanded = tr.classList.toggle('expanded')
    // for accessibility, focus the clicked cell
    // If clicking a cell, prevent interfering with text selection
    if (expanded) tr.scrollIntoView({ block: 'nearest' })
  })

  return tr
}

// Render the visible entries (preserve order)
function render() {
  // clear existing
  tbody.innerHTML = ''
  for (const e of entries) {
    const key = statusKey(e)
    if (!visibility[key]) continue
    const row = createRow(e)
    tbody.appendChild(row)
  }
  // auto-scroll to bottom
  container.scrollTop = container.scrollHeight
}

// Handle incoming entries
window.electron.onLogEntry((entry) => {
  entries.push(entry)
  const key = statusKey(entry)
  if (visibility[key]) {
    // append row
    const row = createRow(entry)
    tbody.appendChild(row)
    container.scrollTop = container.scrollHeight
  }
})

// Visibility controls in header
document.querySelectorAll('#visibility-controls input[type=checkbox]').forEach((cb) => {
  const name = cb.dataset.vis
  cb.addEventListener('change', () => {
    visibility[name] = cb.checked
    // notify main so menu can sync
    if (window.electron.setVisibility) window.electron.setVisibility(name, cb.checked)
    render()
  })
})

// Listen for visibility changes from main (menu toggle)
if (window.electron.onVisibilityChange) {
  window.electron.onVisibilityChange(({ name, checked }) => {
    visibility[name] = checked
    const input = document.querySelector(`#visibility-controls input[data-vis="${name}"]`)
    if (input) input.checked = checked
    render()
  })
}

// Allow toggling expansion by double clicking cells too (use CSS class .expanded)
// Styles for expanded rows are inlined in CSS below via style tag in index.html
