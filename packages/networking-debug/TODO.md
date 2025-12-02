## PROJECT: Socket.IO Event Debugger (networking-debug)

**GOAL:** Create a cross-platform desktop application using **Electron** to read piped `socket.io:debug` output from a Node.js process, parse the log lines, and visualize the event flow in a time-aligned, columnar format. The primary function is to track and display the success or failure of Socket.IO event acknowledgements (ACKs).

### 1. Technology Stack

* **Platform:** Electron (with Node.js backend for parsing).
* **Frontend:** React/Vue/Svelte (Agent's choice, but simple UI components are preferred).

### 2. Core Logic (Node.js/Electron Main Process)

The application must handle the standard input stream (`process.stdin`) when launched via a pipe: `... | networking-debug`.

**A. Input Processing:**
1.  Read the raw debug output line-by-line from `process.stdin`.
2.  For each line, the goal is to extract the **Timestamp**, the **Source Node Type** (Client or Server), and the **Socket.IO Packet JSON**.

**B. Log Parsing (Regular Expression Logic):**
Assume two primary nodes: "Client" (`socket.io-client:*`) and "Server" (`socket.io:server`, `socket.io:socket`).

* **Timestamp Extraction:** `(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)`
* **Source Extraction:** Identify the source based on the debug prefix:
    * **Server:** Any line starting with `socket.io:server`, `socket.io:socket`, or `engine` that is handling an inbound packet.
    * **Client:** Any line starting with `socket.io-client:*`.
* **Packet Data/ACK ID Extraction:**
    * **Outbound EVENT (Send):** Look for lines like `...writing packet {"type":2,"data":["event_name", ...],"id":X,...}` or `...emitting packet with ack id X`.
    * **Inbound EVENT (Receive):** Look for lines like `...got packet {"type":2,"data":["event_name", ...],"id":X,...}` or `...dispatching an event ["event_name", ...]`.
    * **Outbound ACK (Send ACK):** Look for lines like `...writing packet {"type":3,"id":X,"data":[[...]]...}` or `...sending ack [[...]]`.
    * **Inbound ACK (Receive ACK):** Look for lines like `...got packet {"type":3,"id":X,"data":[[...]]...}` or `...calling ack X with [[...]]`.

**C. Event Correlation & State Management:**

1.  Maintain a central log array for display.
2.  Maintain two separate maps for tracking pending requests:
    * `pendingClientRequests: Map<ACK_ID, LogEntry>` (For events Client sent expecting Server ACK).
    * `pendingServerRequests: Map<ACK_ID, LogEntry>` (For events Server sent expecting Client ACK).
3.  **On Outbound EVENT with ACK ID (Request):**
    * Create a new log entry.
    * Store the entry in the corresponding `pendingRequests` map.
    * Set a **timeout timer** (e.g., 100ms) associated with the event.
    * The initial log entry will be added to the display log, showing the payload and a pending status.
4.  **On Inbound ACK:**
    * Look up the corresponding original request in the correct `pendingRequests` map using the ACK ID.
    * **Correlate:** Update the original request's log entry to show the **ACK Payload** (the return value) and a **Success** status.
    * Clear the timeout timer.
    * Remove the entry from the `pendingRequests` map.
5.  **On Timeout:**
    * If a timer expires, update the original request's log entry to show **"TIMEOUT (No ACK Received)"** as the status.

### 3. User Interface (UI/Renderer Process)

The UI must present the log data structure clearly:

| Column Header | Description |
| :--- | :--- |
| **Timestamp** | The time of the initial send event (precise to milliseconds). |
| **Event Name** | The name of the Socket.IO event (e.g., `computer_ID.generate0`). |
| **Client Node** | **If Client Sent:** Shows the outgoing message payload and ACK ID. **If Client Received ACK:** Shows the ACK payload/status. |
| **Server Node** | **If Server Sent:** Shows the outgoing message payload and ACK ID. **If Server Received ACK:** Shows the ACK payload/status. |
| **Status** | Shows the overall status for the request: **Success**, **Pending**, or **Timeout**. |

**Visual Requirements:**
* Use **color-coding** to highlight status:
    * **Green:** Success (ACK received).
    * **Yellow/Orange:** Pending (No ACK yet).
    * **Red:** Timeout (ACK timer expired).
* The UI must auto-scroll to the newest entry.

### 4. Deliverables

The agent should provide:
1.  The necessary **Electron structure** (`main.js`, `preload.js`, `index.html`, and a sample frontend component).
2.  The core **Node.js parsing module** (`parser.js` or similar) that handles `process.stdin` and the correlation logic.
3.  A clear explanation of how to **build and run** the Electron application to test the piping functionality.

