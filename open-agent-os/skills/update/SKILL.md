# Skill: Update

Checks the upstream KetchCyork/Agent-OS repo for new commits, shows a
changelog, and applies updates with the user's explicit approval. User skills
in `~/.open-agent-os/skills/` are never modified — they live outside the repo
and survive every update automatically.

---

## When NOT to run this

- User wants to add a new skill → guide them to write a `skill.yaml` + `SKILL.md`
  in `~/.open-agent-os/skills/` instead.
- User has local uncommitted changes in the repo → warn them first.

---

## Step 1: Check for updates

Run the update check script:

```
npm run update-check
```

Read the output:

- **"✓ Agent-OS is up to date."** → Report this and stop. No further steps needed.
- **"N update(s) available:"** followed by a commit list → continue to Step 2.

If the command fails (no remote, no git), report the error and suggest they
verify the repo origin with `git remote -v`.

---

## Step 2: Show the changelog

Present the list of pending commits to the user in a readable format:
- Group by rough category if obvious (fix, feat, docs, chore).
- Highlight any commits that touch `skills/` (new built-in skills) or `src/`
  (core changes) — those are the high-impact ones.
- Mention explicitly: *"Your skills in `~/.open-agent-os/skills/` are untouched
  by this update."*

Ask the user: **"Apply these updates now?"**

This is the approval gate. Do not proceed to Step 3 until the user says yes.

---

## Step 3: Apply

Run:

```
npm run update
```

This runs `git fetch` + shows the changelog + prompts for `[y/N]` confirmation
again in the terminal, then runs `git pull`.

After it completes, report:

- The new commit SHA
- Whether `npm run setup` should be run (if package.json changed)
- Whether `npm run index` should be run (if vault-template/ changed)

---

## Step 4: Post-update

If `package.json` changed in the applied commits, tell the user:

> "Dependencies may have changed — run `cd open-agent-os && npm install`."

If any `vault-template/` files changed, tell the user:

> "New vault templates were added — run `npm run index` to make them searchable."

Close with: *"Your user skills in `~/.open-agent-os/skills/` are unchanged.
To see what new built-in skills shipped, run `/skills`."*

---

## Background scheduling

If the user asks how to get automatic update notifications, run:

```
npm run update -- --schedule
```

This prints platform-specific cron / Task Scheduler instructions. The scheduled
job only runs `update-check` (read-only — writes only to `update-state.json`).
No code is ever applied automatically. The next `/update` session reads the
cached state and shows the changelog without re-fetching.

---

## Critical rules

1. **Never apply without explicit approval.** The user must say "yes" or "y"
   before `git pull` runs. This is a write action under the hard rules.
2. **Never touch `~/.open-agent-os/skills/`.** User skill overrides survive
   updates automatically — they are outside the repo.
3. **No auto-schedule.** If the user asks to "automatically apply" updates on a
   schedule, explain that background checks are fine but application always
   requires human approval — this is by design, not a limitation.
4. **Graph API first reminder.** If any updated skill mentions M365, remind the
   user to use the `o365 plugin` (Graph API), not browser automation.
