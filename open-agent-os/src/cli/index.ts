/**
 * index — build or refresh the memory index from your vault.
 * Usage: npm run index
 */
import "dotenv/config";
import { loadConfig } from "../config.js";
import { Embedder } from "../memory/embeddings.js";
import { MemoryStore } from "../memory/store.js";
import { Indexer } from "../memory/indexer.js";

async function main() {
  const cfg = loadConfig();
  console.log(`Vault:  ${cfg.vaultPath}`);
  console.log(`Index:  ${cfg.dbPath}`);
  const embedder = new Embedder({ ollamaUrl: cfg.ollamaUrl, model: cfg.embedModel });
  const store = new MemoryStore(cfg.dbPath);
  const indexer = new Indexer(cfg.vaultPath, store, embedder);
  const result = await indexer.indexAll((m) => console.log("  " + m));
  console.log(`\nDone: ${result.notes} notes, ${result.chunks} chunks indexed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
