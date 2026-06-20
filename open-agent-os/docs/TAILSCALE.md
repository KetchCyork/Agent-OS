# Tailscale Mesh Setup

Three machines form the private mesh. All cross-machine traffic goes through Tailscale — no ports are exposed to the public internet.

## Machines

| Role | Hostname (MagicDNS) | Capabilities |
|---|---|---|
| MacBook Pro 2026 (HQ) | `mbp-hq` | `local-model`, `memory` — Agent OS host, dashboard, Paperclip |
| Windows laptop | `win-node` | `m365`, `motion`, `memory` — M365 connector + proposal ingestion |
| MacBook 2017 / Linux | `linux-worker` | `shell`, `render`, `memory` — research + rendering worker |

---

## 1. Install Tailscale

On each machine:

```bash
# macOS
brew install tailscale
sudo tailscaled &
tailscale up

# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Windows — download installer from tailscale.com/download
```

All three machines must authenticate to the same Tailscale account (personal plan — free, up to 100 devices).

---

## 2. Enable MagicDNS

In the Tailscale admin console (admin.tailscale.com → DNS):

- Enable **MagicDNS** — each machine gets a stable `<hostname>.<tailnet>.ts.net` name.
- Optionally set a short tailnet name (e.g. `cyork`) so hostnames resolve as `mbp-hq.cyork.ts.net`.

Note the Tailscale IPs for each machine (`tailscale ip -4`) — you can use either the IP or MagicDNS name in config.

---

## 3. ACL Policy

In the Tailscale admin console → Access Controls, replace the default policy with:

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

Tag each machine `agent-node` in the Tailscale admin console (Machines → Edit tags). This restricts mesh traffic to:
- Port `3737` — Agent OS / mesh-runner HTTP server
- Port `4000` — Agent-Memory service

---

## 4. Configure Each Machine

### MacBook HQ — `.env`

```env
PORT=3737

# Keys — generate each with: openssl rand -hex 32
REMOTE_NODE_REGISTRATION_KEY=<strong-random-secret>
GATEWAY_INBOUND_KEY=<strong-random-secret>

# Memory service (Agent-Memory running locally on HQ)
MEMORY_SERVICE_URL=http://localhost:4000

# Model providers
OPENROUTER_API_KEY=<your-key>
OLLAMA_URL=http://localhost:11434
VAULT_PATH=/Users/<you>/vault
```

### Windows Node — `.env`

```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.cyork.ts.net:3737
```

### Linux Worker — `.env`

```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.cyork.ts.net:3737
```

---

## 5. Register Remote Nodes with HQ

Run once per remote machine after Agent OS is running on HQ:

```bash
# Windows node
curl -X POST http://mbp-hq.cyork.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"win-node","url":"http://win-node.cyork.ts.net:3737","type":"runner","description":"Windows M365 node"}'

# Linux worker
curl -X POST http://mbp-hq.cyork.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"linux-worker","url":"http://linux-worker.cyork.ts.net:3737","type":"runner","description":"Linux render/research node"}'
```

To register a memory node (Agent-Memory running on a dedicated machine):

```bash
curl -X POST http://mbp-hq.cyork.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"memory-node","url":"http://memory-host.cyork.ts.net:4000","type":"memory","description":"Shared memory brain"}'
```

---

## 6. Verify the Mesh

From the HQ machine:

```bash
# Terminal status table — all nodes, live health check
npm run status

# List registered nodes (stored records only, no live ping)
npm run nodes -- list

# Ping a specific node
npm run nodes -- health --name win-node
npm run nodes -- health --name linux-worker

# Via the HTTP API
curl http://localhost:3737/nodes/win-node/health
curl http://localhost:3737/nodes/linux-worker/health
```

Expected response when a node is reachable:

```json
{ "ok": true, "health": { "ok": true, "status": "200 OK", "details": { "ok": true } } }
```

Full mesh probe (all nodes in parallel):

```bash
curl http://localhost:3737/mesh/status
```

---

## 7. Dashboard Access

Open the live status panel in any browser on HQ:

```
http://localhost:3737/dashboard
```

The dashboard auto-refreshes every 5 seconds and shows:

- **Mesh Connectivity** — every node with UP/DOWN badge, type, latency, last-seen time
- **Memory Service** — reachability of the Agent-Memory service and any `type=memory` nodes
- **Connector & Ingestion Jobs** — connector node status and live ingestion progress bars
- **Recent Jobs** — last 10 dispatched jobs with status badges

To access the dashboard from a remote node over Tailscale:

```
http://mbp-hq.cyork.ts.net:3737/dashboard
```

---

## 8. Outbound Commands (HQ → Remote Node)

Synchronous — waits for the result:

```bash
curl -X POST http://localhost:3737/gateway/command \
  -H "Content-Type: application/json" \
  -d '{"nodeName":"linux-worker","command":"shell","args":{"cmd":"uname -a"}}'
```

Asynchronous — returns a job ID immediately; poll for result:

```bash
# Dispatch
curl -X POST http://localhost:3737/gateway/dispatch \
  -H "Content-Type: application/json" \
  -d '{"nodeName":"linux-worker","command":"shell","args":{"cmd":"uname -a"}}'
# → {"ok":true,"jobId":"<uuid>","status":"pending"}

# Poll result
curl http://localhost:3737/jobs/<uuid>
```

---

## 9. Inbound Commands (Remote Node → HQ)

Remote nodes use `POST /command` to send intents to HQ. This requires the `GATEWAY_INBOUND_KEY`.

Supported commands:

| Command | What HQ does |
|---|---|
| `status` | Returns service info, node/job counts, capability flags |
| `node.list` | Returns all registered nodes |
| `node.health` | Live pings a named node |
| `memory.retrieve` | Queries the HQ local memory store |
| `model.call` | Invokes a HQ model (OpenRouter, Ollama, Anthropic) |
| `dispatch` | Relays a command to another registered node |

```bash
# Query HQ memory from a remote node
curl -X POST http://mbp-hq.cyork.ts.net:3737/command \
  -H "Authorization: Bearer <GATEWAY_INBOUND_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"command":"memory.retrieve","args":{"query":"Q4 proposal templates","topK":5},"requestId":"r1"}'

# Call a HQ model from a remote node
curl -X POST http://mbp-hq.cyork.ts.net:3737/command \
  -H "Authorization: Bearer <GATEWAY_INBOUND_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"command":"model.call","args":{"model":"sonnet","messages":[{"role":"user","content":"Draft a proposal intro."}]}}'

# Check which nodes HQ knows about
curl -X POST http://mbp-hq.cyork.ts.net:3737/command \
  -H "Authorization: Bearer <GATEWAY_INBOUND_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"command":"node.list"}'
```

All responses follow the shape: `{ "ok": true, "command": "...", "requestId": "...", "result": ... }`.

---

## 10. Connector Ingestion Progress

Connector nodes (type `connector`) can report ingestion progress to HQ so it appears on the dashboard:

```bash
# Report 42% progress on an active ingestion job
curl -X POST http://mbp-hq.cyork.ts.net:3737/jobs/<jobId>/progress \
  -H "Content-Type: application/json" \
  -d '{"progress":42,"message":"Indexing proposal documents..."}'
```

---

## Security Notes

- `REMOTE_NODE_REGISTRATION_KEY` is required to add or update a node in the HQ registry. Generate with `openssl rand -hex 32`.
- `GATEWAY_INBOUND_KEY` is required for remote nodes calling `POST /command` on HQ. Use a separate value from the registration key.
- Individual node `apiKey` fields are forwarded as `Authorization: Bearer` on all outbound requests to that node. Set per-node if the remote runner requires auth.
- Tailscale encrypts all traffic with WireGuard — no additional TLS is needed on the mesh HTTP servers for private use. For extra hardening, run nginx with a self-signed cert on each node and point the node's `url` to `https://`.
- Bind Agent OS to the Tailscale interface IP only by setting `HOST=<tailscale-ip>` in `.env` to prevent exposure on other network interfaces.
- Never expose port `3737` or `4000` on the public network interface.
