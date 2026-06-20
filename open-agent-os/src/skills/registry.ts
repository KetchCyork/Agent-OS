/**
 * Skill & Tool Registry
 * ---------------------
 * Discovers skills from two places and merges them:
 *   - builtin: the repo's `skills/` directory (ships with the app)
 *   - user:    a writable directory (default ~/.open-agent-os/skills)
 *
 * A skill is any subfolder containing a `skill.yaml`. Drop a folder in, call
 * reload(), and it's available — no code change, no rebuild. That's the whole
 * point: you and your users extend the system by adding folders.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import type { Skill, SkillManifest, Tool, ToolModule } from "./types.js";

export interface RegistryOptions {
  builtinDir: string;            // e.g. <repo>/skills
  userDir: string;               // e.g. ~/.open-agent-os/skills
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private tools = new Map<string, Tool>();

  constructor(private opts: RegistryOptions) {}

  /** (Re)scan both directories. Safe to call at runtime to pick up new skills. */
  async reload(): Promise<{ loaded: number; errors: string[] }> {
    this.skills.clear();
    this.tools.clear();
    const errors: string[] = [];

    for (const [dir, source] of [
      [this.opts.builtinDir, "builtin"],
      [this.opts.userDir, "user"],
    ] as const) {
      const entries = await this.listSkillDirs(dir);
      for (const skillDir of entries) {
        try {
          const skill = await this.loadSkill(skillDir, source);
          this.skills.set(skill.manifest.id, skill); // user overrides builtin by id
          for (const t of skill.tools) this.tools.set(t.name, t);
        } catch (err) {
          errors.push(`${skillDir}: ${String(err)}`);
        }
      }
    }
    return { loaded: this.skills.size, errors };
  }

  list(): Skill[] { return [...this.skills.values()]; }
  get(id: string): Skill | undefined { return this.skills.get(id); }
  listTools(): Tool[] { return [...this.tools.values()]; }
  getTool(name: string): Tool | undefined { return this.tools.get(name); }

  /** Find subfolders that contain a skill.yaml. Missing dir = no skills. */
  private async listSkillDirs(dir: string): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return []; // directory may not exist yet; that's fine
    }
    const out: string[] = [];
    for (const name of names) {
      const full = join(dir, name);
      try {
        if (!(await stat(full)).isDirectory()) continue;
        await stat(join(full, "skill.yaml")); // throws if absent
        out.push(full);
      } catch {
        // not a skill folder; skip
      }
    }
    return out;
  }

  private async loadSkill(dir: string, source: "builtin" | "user"): Promise<Skill> {
    const manifest = yaml.load(await readFile(join(dir, "skill.yaml"), "utf8")) as SkillManifest;
    if (!manifest?.id || !manifest?.name) {
      throw new Error("skill.yaml must include at least `id` and `name`.");
    }

    let instructions = "";
    try {
      instructions = await readFile(join(dir, "SKILL.md"), "utf8");
    } catch {
      instructions = manifest.description ?? "";
    }

    const tools: Tool[] = [];
    for (const rel of manifest.tools ?? []) {
      const toolPath = isAbsolute(rel) ? rel : resolve(dir, rel);
      const mod = (await import(pathToFileURL(toolPath).href)) as ToolModule;
      const exported = mod.default;
      const arr = Array.isArray(exported) ? exported : [exported];
      for (const t of arr) {
        if (!t?.name || typeof t.handler !== "function") {
          throw new Error(`Tool in ${rel} must export { name, handler, ... }.`);
        }
        tools.push(t);
      }
    }

    return { manifest, instructions, tools, dir, source };
  }
}
