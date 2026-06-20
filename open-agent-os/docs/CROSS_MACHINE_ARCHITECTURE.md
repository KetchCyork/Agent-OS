# Cross-machine Architecture

This document describes the implemented cross-machine Agent OS architecture — how the repo ecosystem fits together, what data flows where, and the security model in production.

---

## Goal

A secure, hybrid agent environment where a home HQ host runs the dashboard, local models, and shared memory, while one or more remote machines contribute source data, Office 365 connectors, proposal ingestion, and remote command execution — all over a private Tailscale mesh.

---

## Topology

```
                    ┌──────────────────────────────────┐
                    │   MacBook Pro HQ (:3737)          │
                    │                                   │
                    │  Agent OS dashboard               │
                    │  GET  /dashboard  (HTML panel)    │
                    │  GET  /mesh/status                │
                    │  POST /gateway/command   (→ node) │
                    │  POST /gateway/dispatch  (→ node) │
                    │  POST /command           (← node) │  ← GATEWAY_INBOUND_KEY
                    │  POST /remote/register   (← node) │  ← REMOTE_NODE_REGISTRATION_KEY
                    │                                   │
                    │  RemoteNodeRegistry               │
                    │  JobStore + MeshStatusChecker     │
                    │  ModelRouter (Ollama/OpenRouter)  │
                    └────────────┬─────────────────────┘
                                 │  Tailscale WireGuard mesh
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   ┌──────────────────┐ ┌────────────────┐ ┌────────────────────┐
   │ Agent-Memory     │ │ Windows node   │ │ Linux worker       │
   │ (:4000)          │ │ (:3737)        │ │ (:3737)            │
   │                  │ │                │ │                    │
   │ Obsidian vault   │ │ m365 connector │ │ shell / render     │
   │ LanceDB index    │ │ proposal ingest│ │ research tasks     │
   │ HTTP + MCP API   │ │ motion tasks   │ │                    │
   └──────────────────┘ └────────────────┘ └────────────────────┘
```

---

## Machine roles

### HQ (MacBook Pro 2026)

- Runs `open-agent-os` — the HTTP server, dashboard, model router, skills framework
- Hosts local Ollama models and embeddings (no cloud required for memory indexing)
- Maintains the remote node registry (`RemoteNodeRegistry` — persisted JSON file)
- Tracks all async jobs (`JobStore` — in-memory, resets on restart)
- Runs on-demand mesh health probes (`MeshStatusChecker`)
- Accepts inbound commands from remote nodes via `POST /command`
- Dispatches commands to remote nodes via `POST /gateway/command` or `POST /gateway/dispatch`

### Agent-Memory service

- Runs in the `Agent-Memory` repo — separate process, usually also on HQ
- Exposes `POST /memory/retrieve` for hybrid vector + keyword retrieval
- Exposes MCP stdio for direct Claude Code integration
- Sources: Obsidian vault (always), OneDrive proposals (opt-in), Outlook (opt-in)
- Configured on HQ via `MEMORY_SERVICE_URL=http://localhost:4000`

### Windows node

- Runs `paperclip-mesh-runner` as the local capability executor
- Hosts the `o365 plugin` (Microsoft Graph API) for mail, calendar, OneDrive, Teams
- Hosts the `O365 Browser plugin` as a fallback when Graph API is IT-blocked
- Runs `Mesh runner proposal ingestion` — watches OneDrive folder, indexes new proposals, learns firm writing style
- All raw workplace data stays on this machine; only indexed metadata reaches Agent-Memory

### Linux worker (optional)

- Runs `paperclip-mesh-runner` for shell, render, and research capabilities
- Can run additional memory indexing or document processing jobs
- Registered with HQ and dispatched to on demand

---

## Implemented API surface

### HQ endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness; advertises `capabilities` and `gatewayAuthRequired` |
| `GET` | `/status` | None | Node list, job count, config URLs |
| `GET` | `/dashboard` | None | Self-contained HTML status panel (5 s auto-refresh) |
| `GET` | `/mesh/status` | None | Parallel health probe of all nodes — latency, reachability, type |
| `GET` | `/nodes` | None | List registered nodes |
| `GET` | `/nodes/:name` | None | Single node record |
| `DELETE` | `/nodes/:name` | None | Deregister a node |
| `GET` | `/nodes/:name/health` | None | Live ping; updates `lastSeen` |
| `POST` | `/remote/register` | `REMOTE_NODE_REGISTRATION_KEY` | Self-register or update a remote node |
| `POST` | `/gateway/command` | None | Synchronous outbound command dispatch |
| `POST` | `/gateway/dispatch` | None | Async outbound dispatch — returns `jobId` |
| `POST` | `/command` | `GATEWAY_INBOUND_KEY` | Inbound command from a remote node |
| `GET` | `/jobs` | None | List all jobs |
| `GET` | `/jobs/:id` | None | Job status and result |
| `POST` | `/jobs/:id/progress` | None | Connector node reports ingestion progress (0–100) |

### Inbound gateway commands (`POST /command`)

Remote nodes send these command strings to HQ:

| Command | What HQ does |
|---|---|
| `status` | Service info, capability flags, node/job counts |
| `node.list` | Returns all registered nodes |
| `node.health` | Live pings a named node (`args.name` required) |
| `memory.retrieve` | Queries the HQ local memory store (`args.query`, `args.topK`) |
| `model.call` | Invokes any configured model (`args.model`, `args.messages`) |
| `dispatch` | Relays a command to another registered node (`args.nodeName`, `args.command`) |

---

## Data flows

### Outbound (HQ → node)

1. HQ calls `POST /gateway/command` or `POST /gateway/dispatch` with `{ nodeName, command, args }`.
2. `RemoteNodeRegistry.forwardCommand()` looks up the node URL, adds `Authorization: Bearer <node.apiKey>` if set, POSTs to `{nodeUrl}/command`.
3. Sync: waits for response, returns result directly.
4. Async: creates a `Job`, returns `{ jobId }`, executes in background, updates status to `success` or `error`.

### Inbound (node → HQ)

1. Remote node POSTs to `{hqUrl}/command` with `Authorization: Bearer <GATEWAY_INBOUND_KEY>`.
2. `InboundGatewayHandler` routes the `command` to the appropriate handler.
3. Response: `{ ok, command, requestId, result }` on success, `{ ok: false, error }` on failure.

### Memory sync

1. Windows node ingestion runner watches OneDrive folder.
2. New documents indexed locally; metadata and embeddings sent to Agent-Memory.
3. HQ queries Agent-Memory via `RemoteMemoryClient.retrieve()` → `POST /memory/retrieve`.
4. Alternatively, remote node sends `{ command: "memory.retrieve", args: { query, topK } }` to `POST {hqUrl}/command` to query HQ's local memory.

### Ingestion progress reporting

1. Connector node dispatched an ingest job via `POST /gateway/dispatch` → receives `{ jobId }`.
2. While indexing, connector POSTs `POST {hqUrl}/jobs/{jobId}/progress` with `{ progress: 0–100, message }`.
3. Dashboard polls `/jobs` and renders live progress bars for `command=ingest` jobs.

---

## Security model

| Secret | Env var | Protects | Scope |
|---|---|---|---|
| Node registration key | `REMOTE_NODE_REGISTRATION_KEY` | `POST /remote/register` | Machines that should self-register with HQ |
| Gateway inbound key | `GATEWAY_INBOUND_KEY` | `POST /command` | Remote nodes that send intents to HQ |
| Per-node API key | `apiKey` in node record | All outbound requests HQ sends to that node | Forwarded as `Authorization: Bearer` |

### Principles

- **Tailscale encrypts all traffic** with WireGuard — no additional TLS required on the mesh HTTP servers for private use.
- **Raw workplace data stays on the work node.** Only indexed metadata and embeddings cross the mesh.
- **All write actions require human approval** — the skill tool framework enforces `ctx.requireApproval()` before any send, post, or publish.
- **`GATEWAY_INBOUND_KEY` and `REMOTE_NODE_REGISTRATION_KEY` should be different values** — each scoped to its own attack surface.
- Bind Agent OS to the Tailscale interface IP (`HOST=<tailscale-ip>`) to avoid exposure on other interfaces.

---

## Requirements

- Node.js 18+ and npm on all machines.
- Tailscale installed and authenticated on all machines.
- `Agent-Memory` repo with Obsidian vault and LanceDB for shared memory.
- `paperclip-mesh-runner` on each remote capability node.
- Model providers: Ollama (local), OpenRouter and/or Anthropic (cloud).
- Optional: `o365 plugin`, `O365 Browser plugin`, `Paperclip proposal skill`.

---

## Setup summary

See [`TAILSCALE.md`](TAILSCALE.md) for the full step-by-step guide:

1. Install Tailscale on all machines and enable MagicDNS.
2. Apply the ACL policy (ports 3737 and 4000 between `tag:agent-node` machines).
3. Configure `.env` on each machine with the appropriate keys.
4. Start Agent OS on HQ (`npm run dev`).
5. Register each remote node with HQ via `POST /remote/register`.
6. Verify the mesh with `npm run status` on HQ.
7. Open the dashboard at `http://localhost:3737/dashboard`.
