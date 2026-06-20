import "dotenv/config";
import { loadConfig } from "../config.js";
import { RemoteNodeRegistry, type RemoteNodeConfig } from "../cross-machine/nodes.js";
import { MeshStatusChecker } from "../cross-machine/mesh.js";

function usage() {
  console.log(`Usage:
  npm run nodes -- list
  npm run nodes -- status
  npm run nodes -- add --name NAME --url URL --type memory|runner|connector|generic [--apiKey KEY] [--desc "text"]
  npm run nodes -- remove --name NAME
  npm run nodes -- health --name NAME
  npm run nodes -- show --name NAME
`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function printNode(node: RemoteNodeConfig) {
  console.log(`- ${node.name}
    type: ${node.type}
    url:  ${node.url}
    description: ${node.description ?? "(none)"}
    apiKey: ${node.apiKey ? "set" : "none"}
    lastSeen: ${node.lastSeen ?? "unknown"}
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command) {
    usage();
    process.exit(1);
  }

  const cfg = loadConfig();
  const registry = new RemoteNodeRegistry(cfg.remoteNodesPath);
  const params = parseArgs(argv.slice(1));

  switch (command) {
    case "status": {
      const checker = new MeshStatusChecker(registry, cfg.memoryServiceUrl);
      const mesh = await checker.check();
      console.log(`\nMesh Status — ${new Date(mesh.checkedAt).toLocaleString()}`);
      console.log(`─────────────────────────────────────────`);
      console.log(`Nodes: ${mesh.summary.reachable}/${mesh.summary.total} reachable\n`);

      if (mesh.nodes.length === 0) {
        console.log("  No remote nodes registered.");
      } else {
        const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
        console.log(`  ${col("Name", 16)} ${col("Type", 10)} ${col("Status", 10)} ${"Latency".padEnd(10)} Last seen`);
        console.log(`  ${"─".repeat(62)}`);
        for (const n of mesh.nodes) {
          const status = n.reachable ? "UP" : "DOWN";
          const lat = n.latencyMs != null ? `${n.latencyMs}ms` : "—";
          const seen = n.lastSeen ? new Date(n.lastSeen).toLocaleTimeString() : "unknown";
          console.log(`  ${col(n.name, 16)} ${col(n.type, 10)} ${col(status, 10)} ${lat.padEnd(10)} ${seen}`);
        }
      }

      console.log(`\nMemory service: ${mesh.memoryServiceUrl ?? "(not configured)"} — ${mesh.memoryServiceReachable ? "REACHABLE" : "UNREACHABLE"}\n`);
      return;
    }
    case "list": {
      const nodes = await registry.list();
      if (!nodes.length) {
        console.log("No remote nodes registered.");
        return;
      }
      for (const node of nodes) printNode(node);
      return;
    }
    case "show": {
      const name = params.name;
      if (!name) { console.error("--name is required"); process.exit(1); }
      const node = await registry.get(name);
      if (!node) { console.error(`Node not found: ${name}`); process.exit(1); }
      printNode(node);
      return;
    }
    case "add": {
      const name = params.name;
      const url = params.url;
      const type = (params.type as RemoteNodeConfig["type"]) || "generic";
      if (!name || !url) { console.error("--name and --url are required"); process.exit(1); }
      await registry.set({ name, url, type, apiKey: params.apiKey, description: params.desc });
      console.log(`Registered node ${name} at ${url}`);
      return;
    }
    case "remove": {
      const name = params.name;
      if (!name) { console.error("--name is required"); process.exit(1); }
      const removed = await registry.remove(name);
      if (!removed) { console.error(`Node not found: ${name}`); process.exit(1); }
      console.log(`Removed node ${name}`);
      return;
    }
    case "health": {
      const name = params.name;
      if (!name) { console.error("--name is required"); process.exit(1); }
      const node = await registry.get(name);
      if (!node) { console.error(`Node not found: ${name}`); process.exit(1); }
      const result = await registry.ping(node);
      console.log(`Node ${name}: ${result.ok ? "reachable" : "unreachable"}`);
      console.log(`status: ${result.status}`);
      if (result.details) console.log(`details: ${typeof result.details === "string" ? result.details : JSON.stringify(result.details, null, 2)}`);
      return;
    }
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
