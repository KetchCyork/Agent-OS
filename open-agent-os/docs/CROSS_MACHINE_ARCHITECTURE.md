# Cross-machine Architecture

This document defines the cross-machine Agent OS architecture and how the repo ecosystem works together.

## Goal

Enable a secure, hybrid agent environment where a home HQ host runs the dashboard, local models, and shared memory, while one or more remote work machines contribute source data, Office 365 connectors, proposal ingestion, and remote command execution.

## Key components

- **Agent OS** (`Agent OS`) — local dashboard, mission control, model router, skills framework, connectors, and remote orchestration.
- **Agent Memory** (`Agent-Memory`) — shared memory brain built on Obsidian + LanceDB and exposed via HTTP/MCP.
- **Paperclip Mesh Runner** (`paperclip-mesh-runner`) — remote capability node runtime for executing tasks on other machines over a secure mesh.
- **O365 Browser plugin** (`O365 Browser plugin`) — browser-based connector support for secure Office 365 access from remote nodes.
- **o365 plugin** (`o365 plugin`) — Microsoft 365 Graph connector for Outlook, OneDrive, Teams, and calendar awareness.
- **Paperclip Proposal Skill** (`Paperclip proposal skill`) — proposal ingestion and drafting skill that leverages firm templates and memory.

## Topology

1. **HQ host**
   - Runs the Agent OS dashboard and mission control UI.
   - Hosts the model router and local model runtimes (Ollama, OpenRouter, Anthropic).
   - Connects to `Agent-Memory` for shared memory retrieval and context assembly.
   - Tracks agent jobs, remote node health, and cross-machine status.

2. **Shared memory brain**
   - Lives in `Agent-Memory`.
   - Uses an Obsidian vault as the store of record and LanceDB for retrieval.
   - Serves memory over HTTP and MCP so any machine or agent can query it.
   - Accepts remote ingestion events from work machines.

3. **Work machine / remote node**
   - Runs remote connectors and source ingestion (Office 365, browser plugin, proposals).
   - Keeps raw workplace data local to the node.
   - Indexes documents and sends metadata or embeddings to the shared memory brain.
   - Hosts the `paperclip-mesh-runner` runtime if it accepts remote execution requests.

4. **Secure mesh / gateway**
   - Uses Tailscale to connect HQ and remote nodes via a secure private network.
   - The remote command gateway is the secure path for control and data exchange.
   - Agent OS orchestrates commands, ingestion, and remote workflows over the mesh.

## Data flows

- **Memory sync**
  - Work nodes ingest source data locally.
  - Processed memory content is indexed and exposed to `Agent-Memory`.
  - HQ can query that memory in real time via the same shared brain.

- **Connector awareness**
  - The `o365 plugin` provides Graph access to mail, calendar, OneDrive, and Teams.
  - The `O365 Browser plugin` offers a browser-friendly connector path on remote nodes.

- **Proposal ingestion**
  - The `Paperclip proposal skill` consumes firm proposal templates and builds profile metadata.
  - Drafting uses the shared memory brain to stay consistent with style, past proposals, and opportunity context.

- **Remote execution**
  - `paperclip-mesh-runner` receives remote task requests and can execute skills or connectors on the remote machine.
  - The HQ dashboard can dispatch jobs and monitor status.

## Requirements

- Node.js 18+ and npm.
- `Agent-Memory` with Obsidian vault and LanceDB support.
- `paperclip-mesh-runner` for remote node runtime.
- Tailscale configured on HQ and remote nodes.
- Local or cloud model providers: Ollama, OpenRouter, Anthropic.
- Optional connectors:
  - `o365 plugin` for Microsoft 365 access.
  - `O365 Browser plugin` for browser-based remote access.
  - `Paperclip proposal skill` for proposal ingestion and drafting.

## Implementation notes

- Design the Agent OS dashboard as the central command plane.
- Treat the memory brain as a separate service, not embedded in the dashboard.
- Keep remote raw data on the node and only share indexed or metadata artifacts.
- Make the mesh layer pluggable; Tailscale is the current secure transport.
- Document the full setup in `Agent OS/README.md` and companion repo docs.

## Next steps

- Add UI status panels for remote node health and mesh connectivity.
- Expose `Agent-Memory` as a configurable backend in `open-agent-os`.
- Add remote ingestion workflows that register remote sources with the shared brain.
- Add task dispatch logic for `paperclip-mesh-runner`.
