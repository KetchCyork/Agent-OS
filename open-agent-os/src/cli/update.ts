import "dotenv/config";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../config.js";
import { UpdateStateStore, type PendingCommit } from "../update/state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function safeRun(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getRepoRoot(): string {
  // Start from open-agent-os/ (two levels up from src/cli/)
  const pkgDir = resolve(__dirname, "..", "..");
  const top = safeRun("git rev-parse --show-toplevel", pkgDir);
  return top ?? pkgDir;
}

function usage() {
  console.log(`Usage:
  npm run update-check         Check for upstream updates (no code changed)
  npm run update               Check and apply updates with your approval
  npm run update -- --schedule Print cron / Task Scheduler setup instructions
`);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + " [y/N] ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function printScheduleHelp(cwd: string) {
  console.log(`
── Schedule Agent-OS update checks ─────────────────────────────────────────

The check is safe to schedule — it only fetches from GitHub and writes to
~/.open-agent-os/update-state.json. No code is applied without your approval.

Mac / Linux — add to crontab (crontab -e):
  # Check daily at 8 AM
  0 8 * * * cd ${cwd}/open-agent-os && npm run update-check >> ~/.agent-os-update.log 2>&1

Windows — Task Scheduler:
  1. Open Task Scheduler → Create Basic Task → Daily → 8:00 AM
  2. Action: Start a Program
       Program:   node
       Arguments: node_modules/.bin/tsx src/cli/update.ts check
       Start in:  ${cwd}\\open-agent-os

After a scheduled check, run \`npm run update\` (or \`/update\` in Claude Code)
to review the changelog and apply with your approval.
`);
}

async function checkUpstream(repoRoot: string, store: UpdateStateStore): Promise<{ upToDate: boolean; pending: PendingCommit[] }> {
  process.stdout.write("Fetching upstream... ");

  const fetchOk = safeRun("git fetch origin", repoRoot);
  if (fetchOk === null) {
    console.log("FAILED (no remote or not a git repo)");
    return { upToDate: true, pending: [] };
  }
  console.log("done");

  const localSha = safeRun("git rev-parse HEAD", repoRoot) ?? "";
  const upstreamSha = safeRun("git rev-parse @{u}", repoRoot) ?? "";

  if (!upstreamSha || localSha === upstreamSha) {
    const prev = store.read();
    store.write({ ...prev, lastCheckedAt: new Date().toISOString(), pendingCommits: [], upToDate: true });
    return { upToDate: true, pending: [] };
  }

  const logOutput = safeRun("git log HEAD..@{u} --oneline --no-decorate", repoRoot) ?? "";
  const pending: PendingCommit[] = logOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      return { hash: line.slice(0, spaceIdx), message: line.slice(spaceIdx + 1) };
    });

  const prev = store.read();
  store.write({ ...prev, lastCheckedAt: new Date().toISOString(), pendingCommits: pending, upToDate: false });
  return { upToDate: false, pending };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? "check";

  if (command === "--help" || command === "-h") { usage(); return; }

  const repoRoot = getRepoRoot();

  if (command === "--schedule") { printScheduleHelp(repoRoot); return; }

  const cfg = loadConfig();
  const store = new UpdateStateStore(cfg.updateStatePath);

  if (command === "check") {
    const { upToDate, pending } = await checkUpstream(repoRoot, store);
    if (upToDate) {
      console.log("✓ Agent-OS is up to date.");
    } else {
      console.log(`\n${pending.length} update(s) available:\n`);
      for (const c of pending) console.log(`  ${c.hash.slice(0, 8)}  ${c.message}`);
      console.log(`\nRun \`npm run update\` or \`/update\` in Claude Code to apply.\n`);
    }
    return;
  }

  if (command === "apply") {
    const { upToDate, pending } = await checkUpstream(repoRoot, store);
    if (upToDate) {
      console.log("✓ Agent-OS is up to date. Nothing to apply.");
      return;
    }

    console.log(`\n${pending.length} update(s) available:\n`);
    for (const c of pending) console.log(`  ${c.hash.slice(0, 8)}  ${c.message}`);
    console.log();
    console.log("Your skills in ~/.open-agent-os/skills/ are not touched by this update.");
    console.log("Built-in skills, src/, and vault-template/ will be updated.");
    console.log();

    const ok = await confirm("Apply these updates now?");
    if (!ok) {
      console.log("Update cancelled.");
      return;
    }

    process.stdout.write("Running git pull... ");
    const pullOut = safeRun("git pull", repoRoot);
    if (pullOut === null) {
      console.log("FAILED");
      console.error("git pull failed — resolve any local changes first, then retry.");
      process.exit(1);
    }
    console.log("done");

    const newSha = safeRun("git rev-parse HEAD", repoRoot) ?? "";
    const prev = store.read();
    store.write({ ...prev, lastAppliedCommit: newSha, pendingCommits: [], upToDate: true });

    console.log(`\n✓ Updated to ${newSha.slice(0, 8)}`);
    console.log("\nNext steps:");
    console.log("  npm run setup   — if new dirs or deps were added");
    console.log("  npm run index   — if new vault-template files were added\n");
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
