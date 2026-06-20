/**
 * Skills & Tools — type contracts
 * -------------------------------
 * A *tool* is a typed function the system (or a model) can call.
 * A *skill* is a folder that packages instructions + optional tools + assets.
 *
 * Both are designed to be added by dropping a folder in — no core code changes.
 * Built-in skills live in `skills/`; user skills live in a configured directory
 * (default `~/.open-agent-os/skills`). Everything in both locations is
 * auto-discovered at startup, and the user directory can be reloaded on demand.
 */

import type { ModelRouter, Message } from "../models/router.js";

/** JSON-schema-ish parameter description for a tool. */
export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  /** For arrays/objects, optionally describe the items/fields. */
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

/** What a tool handler receives: validated args + shared services. */
export interface ToolContext {
  router: ModelRouter;
  /** Absolute path to the active vault, for tools that read/write notes. */
  vaultPath: string;
  /** Free-form services injected by the host (memory search, connectors, ...). */
  services: Record<string, unknown>;
  /** Side-effectful tools must call this and respect the result. */
  requireApproval: (summary: string) => Promise<boolean>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  /** True if the tool sends/posts/publishes/deletes — forces an approval gate. */
  sideEffect?: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/** Parsed from each skill's skill.yaml. */
export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  /** One or two sentences telling the orchestrator when to reach for this skill. */
  when_to_use: string;
  version?: string;
  author?: string;
  /** Optional preferred router model id for this skill's work. */
  model?: string;
  /** Tool files (relative to the skill dir) this skill contributes. */
  tools?: string[];
}

/** A fully loaded skill: manifest + instructions + resolved tools + location. */
export interface Skill {
  manifest: SkillManifest;
  /** Contents of SKILL.md — the instructions handed to the model. */
  instructions: string;
  tools: Tool[];
  dir: string;
  source: "builtin" | "user";
}

/** A tool module file exports a default Tool (or an array of Tools). */
export type ToolModule = { default: Tool | Tool[] };

/** Build a system message that exposes a skill's instructions to a model. */
export function skillSystemMessage(skill: Skill): Message {
  return { role: "system", content: skill.instructions };
}
