/**
 * Config
 * ------
 * Single place that reads environment + defaults. Keys come from .env
 * (see .env.example). The model roster below is the default fallback wiring;
 * edit freely or override per-profile.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { RouterConfig, ModelSpec } from "./models/router.js";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export interface AppConfig {
  port: number;
  vaultPath: string;
  dbPath: string;            // LanceDB directory
  builtinSkillsDir: string;
  userSkillsDir: string;
  ollamaUrl: string;
  embedModel: string;
  memoryServiceUrl?: string;
  remoteNodesPath: string;
  remoteCommandGatewayUrl?: string;
  router: RouterConfig;
}

/** Default model roster. ids are referenced by profiles and the CLI. */
function defaultModels(): Record<string, ModelSpec> {
  return {
    // Cloud, via OpenRouter (one key). Fallbacks trigger if a model is unavailable.
    claude: { id: "claude", backend: "openrouter", model: "anthropic/claude-opus-4-8", fallback: ["sonnet", "glm"] },
    sonnet: { id: "sonnet", backend: "openrouter", model: "anthropic/claude-sonnet-4-6", fallback: ["glm"] },
    glm:    { id: "glm",    backend: "openrouter", model: "z-ai/glm-4.6", fallback: ["local-fast"] },
    // Local, via Ollama (free, private). Good for grunt work + offline.
    "local-fast": { id: "local-fast", backend: "ollama", model: "llama3.1" },
    // Light panel member for the content judge / cheap checks.
    "fusion-light": { id: "fusion-light", backend: "openrouter", model: "anthropic/claude-sonnet-4-6", fallback: ["glm", "local-fast"] },
  };
}

export function loadConfig(): AppConfig {
  const repoRoot = resolve(new URL("..", import.meta.url).pathname); // <repo>/
  const userBase = join(homedir(), ".open-agent-os");
  const vaultPath = env("VAULT_PATH") || join(userBase, "vault");

  return {
    port: Number(env("PORT", "3737")),
    vaultPath,
    dbPath: join(userBase, "memory.lancedb"),
    builtinSkillsDir: join(repoRoot, "skills"),
    userSkillsDir: join(userBase, "skills"),
    ollamaUrl: env("OLLAMA_URL", "http://localhost:11434"),
    embedModel: env("EMBED_MODEL", "nomic-embed-text"),
    memoryServiceUrl: env("MEMORY_SERVICE_URL") || undefined,
    remoteNodesPath: env("REMOTE_NODES_PATH", join(userBase, "remote-nodes.json")),
    remoteCommandGatewayUrl: env("REMOTE_COMMAND_GATEWAY_URL") || undefined,
    router: {
      models: defaultModels(),
      openrouterKey: env("OPENROUTER_API_KEY") || undefined,
      anthropicKey: env("ANTHROPIC_API_KEY") || undefined,
      ollamaUrl: env("OLLAMA_URL", "http://localhost:11434"),
    },
  };
}
