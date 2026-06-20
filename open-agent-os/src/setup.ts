import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { loadConfig } from "./config.js";

async function main() {
  const cfg = loadConfig();
  await mkdir(dirname(cfg.dbPath), { recursive: true });
  await mkdir(cfg.userSkillsDir, { recursive: true });
  await mkdir(dirname(cfg.remoteNodesPath), { recursive: true });

  console.log("Open Agent OS setup complete.");
  console.log(`  memory db: ${cfg.dbPath}`);
  console.log(`  user skills: ${cfg.userSkillsDir}`);
  console.log(`  remote node registry: ${cfg.remoteNodesPath}`);
  if (cfg.memoryServiceUrl) console.log(`  remote memory URL: ${cfg.memoryServiceUrl}`);
  if (cfg.remoteNodeRegistrationKey) console.log("  remote node registration key is configured");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
