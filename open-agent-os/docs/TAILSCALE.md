# Tailscale Mesh Setup

Three machines form the private mesh. All cross-machine traffic goes through Tailscale — no ports exposed to the public internet.

## Machines

| Role | Hostname (MagicDNS) | Capabilities |
|---|---|---|
| MacBook Pro 2026 (HQ) | `mbp-hq` | `local-model`, `memory` — Paperclip + Agent OS host |
| Windows laptop | `win-node` | `m365`, `motion`, `memory` — M365 connector + proposal ingestion |
| MacBook 2017 / Linux | `linux-worker` | `shell`, `render`, `memory` — research + rendering |

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

All three machines must authenticate to the same Tailscale account (personal plan covers up to 100 devices, free).

## 2. Enable MagicDNS

In the Tailscale admin console (admin.tailscale.com → DNS):

- Enable **MagicDNS** — each machine gets a stable `<hostname>.<tailnet>.ts.net` name.
- Optionally set a short tailnet name (e.g., `cyork`) so hostnames resolve as `mbp-hq.cyork.ts.net`.

Note the Tailscale IPs for each machine (`tailscale ip -4`) — use either the IP or MagicDNS name in config.

## 3. ACL Policy

In the Tailscale admin console → Access Controls, replace the default with:

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

Tag each machine `agent-node` via the Tailscale admin console (Machines → Edit tags). This restricts mesh traffic to ports 3737 (Agent OS / mesh-runner) and 4000 (memory service) only.

## 4. Configure Each Machine

### MacBook HQ — `.env`

```env
PORT=3737
REMOTE_NODE_REGISTRATION_KEY=<strong-random-secret>
MEMORY_SERVICE_URL=http://localhost:4000
RUNNER_CAPABILITIES=local-model,memory
```

### Windows Node — `.env`

```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.cyork.ts.net:3737
RUNNER_CAPABILITIES=m365,motion,memory
```

Register with HQ once on first boot:

```bash
curl -X POST http://mbp-hq.cyork.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"win-node","url":"http://win-node.cyork.ts.net:3737","type":"runner","description":"Windows M365 node"}'
```

### Linux Worker — `.env`

```env
PORT=3737
REMOTE_COMMAND_GATEWAY_URL=http://mbp-hq.cyork.ts.net:3737
RUNNER_CAPABILITIES=shell,render,memory
```

Register with HQ:

```bash
curl -X POST http://mbp-hq.cyork.ts.net:3737/remote/register \
  -H "Authorization: Bearer <REMOTE_NODE_REGISTRATION_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"linux-worker","url":"http://linux-worker.cyork.ts.net:3737","type":"runner","description":"Linux render/research node"}'
```

## 5. Verify the Mesh

From the HQ machine:

```bash
# Check all registered nodes
npm run nodes list

# Ping each node
npm run nodes ping win-node
npm run nodes ping linux-worker

# Or via the HTTP API
curl http://localhost:3737/nodes/win-node/health
curl http://localhost:3737/nodes/linux-worker/health
```

Expected response when a node is reachable:

```json
{ "ok": true, "health": { "ok": true, "status": "200 OK", "details": { "ok": true } } }
```

## 6. Dispatch a Remote Command

Synchronous (waits for result):

```bash
curl -X POST http://localhost:3737/gateway/command \
  -H "Content-Type: application/json" \
  -d '{"nodeName":"linux-worker","command":"shell","args":{"cmd":"uname -a"}}'
```

Asynchronous (returns job ID immediately):

```bash
curl -X POST http://localhost:3737/gateway/dispatch \
  -H "Content-Type: application/json" \
  -d '{"nodeName":"linux-worker","command":"shell","args":{"cmd":"uname -a"}}'
# → {"ok":true,"jobId":"<uuid>","status":"pending"}

# Poll job status
curl http://localhost:3737/jobs/<uuid>
```

## Security Notes

- `REMOTE_NODE_REGISTRATION_KEY` is the only credential required to register a node. Use a long random value (`openssl rand -hex 32`).
- Individual node `apiKey` fields in the registry are passed as `Authorization: Bearer` on forwarded commands. Set these per-node if the remote runner requires auth.
- Tailscale itself encrypts all traffic with WireGuard — no additional TLS needed on the mesh runner HTTP server for private use. For extra hardening, run nginx with a self-signed cert on each node and point `url` to `https://`.
- Never expose port 3737 or 4000 on the public network interface. Bind to the Tailscale interface IP only by setting `HOST=100.x.x.x` in `.env`.
