/**
 * ask — the end-to-end proof
 * ---------------------------
 * Usage:
 *   npm run ask -- "what's our standard proposal structure?"        (uses memory + default model)
 *   npm run ask -- --model glm "draft a LinkedIn hook about clean core"
 *
 * Flow: embed the question -> hybrid-retrieve from memory -> assemble a small
 * context bundle (always-on profiles + retrieved passages) -> call the model.
 * This is the cross-model memory working: the same memory feeds any model.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { ModelRouter, type Message } from "../models/router.js";
import { Embedder } from "../memory/embeddings.js";
import { MemoryStore } from "../memory/store.js";

async function main() {
  const argv = process.argv.slice(2);
  let model = "claude";
  const mi = argv.indexOf("--model");
  if (mi !== -1) { model = argv[mi + 1]; argv.splice(mi, 2); }
  const question = argv.join(" ").trim();
  if (!question) { console.error('Ask something: npm run ask -- "your question"'); process.exit(1); }

  const cfg = loadConfig();
  const router = new ModelRouter(cfg.router);
  const embedder = new Embedder({ ollamaUrl: cfg.ollamaUrl, model: cfg.embedModel });
  const store = new MemoryStore(cfg.dbPath);

  // Retrieve relevant memory (skip gracefully if nothing is indexed yet).
  let retrieved = "";
  try {
    const qvec = await embedder.embed(question);
    await store.open(qvec.length);
    const hits = await store.retrieve(question, qvec, 6);
    retrieved = hits.map((h) => `- (${h.chunk.notePath}) ${h.chunk.text}`).join("\n");
  } catch (err) {
    console.warn(`[memory] skipped: ${String(err)}`);
  }

  // Always-on profile context (your styles), if present.
  const profile = await safeRead(join(cfg.vaultPath, "10-Profiles", "writing-style.md"));

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are the user's assistant. Use the provided context when relevant; " +
        "never invent facts or numbers. If the context is empty, answer normally.\n\n" +
        (profile ? `# User writing style\n${profile}\n\n` : "") +
        (retrieved ? `# Retrieved from memory\n${retrieved}\n` : ""),
    },
    { role: "user", content: question },
  ];

  const res = await router.call(model, messages, { maxTokens: 1000 });
  console.log(`\n--- ${res.modelUsed}${res.triedFallback ? " (fallback)" : ""} ---\n`);
  console.log(res.text);
}

async function safeRead(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}

main().catch((e) => { console.error(e); process.exit(1); });
