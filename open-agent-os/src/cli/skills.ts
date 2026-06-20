/** skills — list discovered skills and tools. Usage: npm run skills */
import "dotenv/config";
import { loadConfig } from "../config.js";
import { SkillRegistry } from "../skills/registry.js";

async function main() {
  const cfg = loadConfig();
  const reg = new SkillRegistry({ builtinDir: cfg.builtinSkillsDir, userDir: cfg.userSkillsDir });
  const { loaded, errors } = await reg.reload();
  console.log(`Loaded ${loaded} skill(s) from:\n  builtin: ${cfg.builtinSkillsDir}\n  user:    ${cfg.userSkillsDir}\n`);
  for (const s of reg.list()) {
    console.log(`- ${s.manifest.id} (${s.source})  ${s.manifest.name}`);
    for (const t of s.tools) console.log(`    tool: ${t.name}${t.sideEffect ? "  [needs approval]" : ""}`);
  }
  if (errors.length) { console.log("\nErrors:"); errors.forEach((e) => console.log("  " + e)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
