# Agent OS

Local-first agentic operating system: one dashboard, shared memory across every model, extensible skills, and secure cross-machine coordination over a private Tailscale mesh.

This repository contains the primary Agent OS package in `open-agent-os/` and is the entry point for the broader multi-repo solution.

## Related repos

| Repo | Role |
|---|---|
| **Agent-OS** *(this repo)* | Dashboard, mission control, model router, skills framework, remote command gateway |
| **Agent-Memory** | Shared memory brain — Obsidian vault + LanceDB hybrid retrieval, HTTP + MCP API |
| **paperclip-mesh-runner** | Remote capability node runtime — executes skills and connectors on any machine |
| **o365 plugin** | Microsoft 365 Graph connector — mail, calendar, OneDrive, Teams |
| **O365 Browser plugin** | Browser-based OWA fallback for IT-restricted Graph access |
| **Paperclip proposal skill** | Proposal ingestion, template matching, and AI-assisted drafting |

---

## What this does

- Runs the Agent OS HTTP server and dashboard at `http://localhost:3737`
- Routes model calls through OpenRouter, local Ollama models, and Anthropic with automatic fallback
- Maintains a registry of remote mesh nodes and orchestrates cross-machine work
- Accepts inbound commands from remote nodes via a secure gateway API (`POST /command`)
- Serves a live mesh status panel at `GET /dashboard` — node health, memory availability, ingestion jobs
- Provides a drop-in skills and tools framework — add a folder, get a new capability
- Ships built-in skills (`/onboard` for Day-1 setup, `/update` for repo updates) with a clean pattern for user-authored skills in `~/.open-agent-os/skills/`

---

## Quick start (HQ machine)

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | ≥ 18 | `node --version` to check. Install from [nodejs.org](https://nodejs.org) or via `brew install node`. |
| **Ollama** | Any | Required for local model inference and local embeddings. `brew install ollama` then `ollama serve`. |
| **Obsidian** | Any | Recommended for browsing and editing your vault. Not required to run the server. |
| **Tailscale** | Any | Required only for cross-machine mesh. Not needed for single-machine use. |

### Install and run

```bash
cd open-agent-os

# 1. Copy the env template and fill in your keys (see "Environment variables" below)
cp .env.example .env

# 2. Install dependencies (see "What npm install installs" below)
npm install

# 3. Create ~/.open-agent-os/ directories (vault, memory index, skills, nodes registry)
npm run setup

# 4. Start the server
npm run dev                 # development mode — restarts on file changes
# or
npm run start               # production mode
```

Open `http://localhost:3737/dashboard` to see the live mesh status panel.

### What `npm install` installs

`npm install` fetches the packages listed in `open-agent-os/package.json`. There are no global installs — everything lands in `open-agent-os/node_modules/`.

**Runtime packages** (shipped with the app):

| Package | What it does |
|---|---|
| `@lancedb/lancedb` | Vector database — stores and queries the memory index for semantic + keyword search |
| `dotenv` | Loads your `.env` file into `process.env` at startup |
| `gray-matter` | Parses YAML frontmatter from Obsidian vault markdown files |
| `js-yaml` | Reads `skill.yaml` descriptor files from the skills registry |

**Dev packages** (needed to run TypeScript directly — no separate compile step):

| Package | What it does |
|---|---|
| `tsx` | Runs `.ts` files directly via Node.js — powers all `npm run *` scripts |
| `typescript` | TypeScript compiler, used only for `npm run typecheck` |
| `@types/node` | TypeScript types for Node.js built-ins (`fs`, `http`, `os`, etc.) |
| `@types/js-yaml` | TypeScript types for js-yaml |

No database server, no Docker, no native build tools required. LanceDB is a native Node addon — its binary is downloaded automatically by npm for your platform.

---

## Cross-machine setup

Three machines form a private mesh over Tailscale. No ports are exposed to the public internet.

| Machine | Hostname | Capabilities |
|---|---|---|
| MacBook Pro 2026 (HQ) | `mbp-hq` | Agent OS + dashboard, local models, memory |
| Windows laptop | `win-node` | M365 connector, proposal ingestion |
| MacBook 2017 / Linux | `linux-worker` | Shell, render, research |

Full step-by-step setup is in [`open-agent-os/docs/TAILSCALE.md`](open-agent-os/docs/TAILSCALE.md). Summary:

### 1. Install Tailscale on every machine

```bash
# macOS
brew install tailscale && sudo tailscaled & && tailscale up

# Linux
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up

# Windows — download from tailscale.com/download
```

All machines must authenticate to the same Tailscale account. Enable **MagicDNS** in the admin console so each machine gets a stable `<hostname>.<tailnet>.ts.net` name.

### 2. Apply the ACL policy

In the Tailscale admin console → Access Controls, restrict mesh traffic to Agent OS ports only:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:agent-node"],
      "dst": ["tag:agent-node:3737", "tag:agent-node:4000"]
    }
  ],
  "tagOwners": {
    "tag:agent-node": ["autogroup:owner"]
  }
}
```

Tag each machine `agent-node` in the Tailscale admin console (Machines → Edit tags).

### 3. Configure each machine

**MacBook HQ — `.env`**
```env
PORT=3737
GATEWAY_INBOUND_KEY=<openssl rand -hex 32>
REMOTE_NODE_REGISTRATION_KEY=<openssl rand -hex 32>
MEMORY_SERVICE_URL=http://localhost:4000
```

**Windows node — `.env`**
```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.<tailnet>.ts.net:3737
```

**Linux worker — `.env`**
```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.<tailnet>.ts.net:3737
```

### 4. Register each remote node with HQ

Run once per remote machine after starting Agent OS on HQ:

```bash
# Register Windows node
curl -X POST http://mbp-hq.<tailnet>.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"win-node","url":"http://win-node.<tailnet>.ts.net:3737","type":"runner","description":"Windows M365 node"}'

# Register Linux worker
curl -X POST http://mbp-hq.<tailnet>.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"linux-worker","url":"http://linux-worker.<tailnet>.ts.net:3737","type":"runner","description":"Linux render/research node"}'
```

### 5. Verify the mesh

```bash
npm run status                              # terminal table — all nodes, live health
npm run nodes -- list                       # list registered nodes
npm run nodes -- health --name win-node     # ping a specific node
```

---

## Dashboard

Open `http://localhost:3737/dashboard` in any browser on the HQ machine. The page auto-refreshes every 5 seconds and shows four panels:

| Panel | What it shows |
|---|---|
| **Mesh Connectivity** | Every registered node with UP/DOWN badge, type, latency, last-seen time |
| **Memory Service** | Availability of `Agent-Memory` and any `type=memory` nodes |
| **Connector & Ingestion** | Connector node status + live progress bars for active `ingest` jobs |
| **Recent Jobs** | Last 10 dispatched jobs with status badges and timestamps |

No build step — the dashboard is served directly from the Agent OS HTTP server.

---

## API reference

All endpoints return JSON unless noted. Server runs on `PORT` (default `3737`).

### Health and status

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Service health; advertises `capabilities` and `gatewayAuthRequired` |
| `GET` | `/status` | None | Node list, job count, cross-machine config URLs |
| `GET` | `/dashboard` | None | Live HTML status panel |
| `GET` | `/mesh/status` | None | Parallel health probe of all registered nodes |

### Node registry

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/nodes` | None | List all registered nodes |
| `GET` | `/nodes/:name` | None | Get a single node record |
| `DELETE` | `/nodes/:name` | None | Remove a node |
| `GET` | `/nodes/:name/health` | None | Live ping; updates `lastSeen` on success |
| `POST` | `/remote/register` | `REMOTE_NODE_REGISTRATION_KEY` | Register or update a remote node |

### Outbound gateway (HQ → remote node)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/gateway/command` | None | Synchronous command dispatch to a named node |
| `POST` | `/gateway/dispatch` | None | Async dispatch — returns `jobId` immediately |

Body: `{ "nodeName": "win-node", "command": "ingest", "args": { ... } }`

### Inbound gateway (remote node → HQ)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/command` | `GATEWAY_INBOUND_KEY` | Remote node sends a command intent to HQ |

Supported commands: `status`, `node.list`, `node.health`, `memory.retrieve`, `model.call`, `dispatch`.

```bash
# Example: remote node queries HQ memory
curl -X POST http://mbp-hq.<tailnet>.ts.net:3737/command \
  -H "Authorization: Bearer <GATEWAY_INBOUND_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"command":"memory.retrieve","args":{"query":"Q4 proposal template","topK":5},"requestId":"r1"}'

# Example: remote node calls a HQ model
curl -X POST http://mbp-hq.<tailnet>.ts.net:3737/command \
  -H "Authorization: Bearer <GATEWAY_INBOUND_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"command":"model.call","args":{"model":"sonnet","messages":[{"role":"user","content":"Summarise this."}]}}'
```

### Jobs

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/jobs` | None | List all jobs |
| `GET` | `/jobs/:id` | None | Get job status and result |
| `POST` | `/jobs/:id/progress` | None | Push ingestion progress (0–100) from a connector node |

---

## CLI reference

```bash
npm run dev                                 # start server with file-watch reload
npm run start                               # start server (production)
npm run setup                               # create ~/.open-agent-os directories
npm run index                               # build/rebuild memory index from vault
npm run ask -- "question"                   # query memory + model router
npm run status                              # print live mesh status table
npm run nodes -- list                       # list all registered nodes
npm run nodes -- status                     # full mesh status (same as npm run status)
npm run nodes -- add --name NAME --url URL --type runner|memory|connector|generic
npm run nodes -- remove --name NAME
npm run nodes -- health --name NAME         # ping one node
npm run nodes -- show --name NAME           # show stored node record
npm run skills                              # list available skills
npm run update-check                        # check for upstream updates (no code changed)
npm run update                              # check + apply updates with approval
npm run update -- --schedule               # print cron / Task Scheduler setup instructions
npm run test                                # run all test suites
npm run typecheck                           # TypeScript type check (no emit)
```

---

## Environment variables

See [`.env.example`](open-agent-os/.env.example) for the full annotated list.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP server port (default `3737`) |
| `OPENROUTER_API_KEY` | For cloud models | OpenRouter key (Claude, GLM, and 300+ others) |
| `ANTHROPIC_API_KEY` | No | Direct Anthropic key (bypasses OpenRouter) |
| `OLLAMA_URL` | For local models | Ollama base URL (default `http://localhost:11434`) |
| `VAULT_PATH` | For memory | Absolute path to your Obsidian vault |
| `MEMORY_SERVICE_URL` | For remote memory | Agent-Memory service URL |
| `GATEWAY_INBOUND_KEY` | Recommended | Bearer key for `POST /command` on HQ |
| `REMOTE_NODE_REGISTRATION_KEY` | Recommended | Bearer key for `POST /remote/register` |
| `REMOTE_COMMAND_GATEWAY_URL` | On remote nodes | HQ URL as seen from this machine |
| `UPDATE_STATE_PATH` | No | Where to store update check state (default `~/.open-agent-os/update-state.json`) |

---

## Built-in skills

Skills live in `open-agent-os/skills/` (built-in) or `~/.open-agent-os/skills/` (user overrides — these are never touched by updates). Each skill is a folder with a `skill.yaml` descriptor and a `SKILL.md` that instructs Claude Code how to run it.

| Skill | Trigger | What it does |
|---|---|---|
| `/onboard` | "set me up", "onboard me" | 7-question intake interview → scaffolds Day-1 vault files, writing-style profile, connections registry, and a populated `CLAUDE.md`. Idempotent — re-run after editing `aios-intake.md`. |
| `/update` | "check for updates", "update agent-os" | Fetches upstream commits, shows a changelog, and applies via `git pull` only after explicit approval. User skills in `~/.open-agent-os/skills/` are never modified. |

Run `npm run skills` to see all available skills including any user-authored ones.

To add your own skill: drop a folder in `~/.open-agent-os/skills/<skill-name>/` with a `skill.yaml` (id, description, when\_to\_use) and a `SKILL.md`. User skills override built-ins by id. See [`docs/SKILLS.md`](open-agent-os/docs/SKILLS.md) for the full authoring guide.

---

## Project structure

```
open-agent-os/
├── src/
│   ├── server.ts              # HTTP server — all endpoints
│   ├── config.ts              # env loading and AppConfig type
│   ├── cli/                   # ask, index, nodes, skills, update CLIs
│   ├── update/
│   │   └── state.ts           # UpdateStateStore — persists check timestamps and pending commits
│   ├── cross-machine/
│   │   ├── nodes.ts           # RemoteNodeRegistry — CRUD, ping, forwardCommand
│   │   ├── jobs.ts            # JobStore — async job tracking with progress
│   │   ├── mesh.ts            # MeshStatusChecker — parallel node health probing
│   │   └── gateway.ts         # InboundGatewayHandler — POST /command routing
│   ├── memory/                # vault loader, embeddings, LanceDB store, remote client
│   ├── models/router.ts       # ModelRouter — fallback chains, fusion
│   └── skills/                # registry and type contracts
├── docs/
│   ├── TAILSCALE.md           # step-by-step mesh setup with ACL config
│   ├── CROSS_MACHINE_ARCHITECTURE.md  # topology, data flows, security model
│   ├── ARCHITECTURE.md        # module map and agentic patterns
│   ├── MEMORY.md              # 3-layer memory design
│   ├── SKILLS.md              # skill and tool authoring guide
│   └── ROADMAP.md             # phased build plan
├── test/                      # test suites (no external services required)
├── skills/
│   ├── onboard/               # /onboard — Day-1 setup wizard
│   └── update/                # /update — upstream update check and apply
└── profiles/                  # agent persona YAML files
```

---

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/TAILSCALE.md`](open-agent-os/docs/TAILSCALE.md) | Full Tailscale mesh setup — install, ACL, per-machine config, verify, dispatch examples |
| [`docs/CROSS_MACHINE_ARCHITECTURE.md`](open-agent-os/docs/CROSS_MACHINE_ARCHITECTURE.md) | Topology, data flows, implemented API surface, security model |
| [`docs/ARCHITECTURE.md`](open-agent-os/docs/ARCHITECTURE.md) | Module map, profiles, agentic patterns (pipeline, kanban, fusion, judge loop) |
| [`docs/MEMORY.md`](open-agent-os/docs/MEMORY.md) | 3-layer memory design: Obsidian → LanceDB → context assembler |
| [`docs/SKILLS.md`](open-agent-os/docs/SKILLS.md) | Skill and tool authoring guide — drop a folder, get a capability |
| [`docs/ROADMAP.md`](open-agent-os/docs/ROADMAP.md) | Phased build plan with completion status |
