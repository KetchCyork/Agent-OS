# Skill: Onboard

Single combined wizard. Reads or writes `aios-intake.md` (in the vault root),
conducts the 7-question interview if the file isn't filled, then scaffolds the
Day-1 file set at the end. No confirmation loops — one shot from interview to
files. The user iterates by editing `aios-intake.md` and re-running `/onboard`.

**The wow moment:** close with — *"Try this: ask me 'what should I focus on this
week?'"* When the user runs it, respond using only the new context files you just
wrote.

---

## When NOT to run this

- User wants to add one new connection only → point them at `connections.md`.
- User wants a capability or skill gap review → that's `/audit`, not onboarding.
- Already onboarded and questions are filled → skip interview, jump straight to
  Step 3 (re-scaffold from updated intake).

---

## Step 1: Read the intake

Locate `aios-intake.md` — check the vault root and the repo root. If it doesn't
exist, it ships in `open-agent-os/vault-template/aios-intake.md`; copy it to the
vault root before starting.

Check which Q1-Q7 sections have real content vs. `[Your answer here]` placeholders.

- **All filled** → skip Step 2, jump to Step 3.
- **Some filled** → tell the user which questions are already answered and ask
  whether to fill the rest now or scaffold from what's there. Their call.
- **None filled (fresh install)** → run Step 2 conversationally.

---

## Step 2: The interview (7 questions, hard cap)

Ask one at a time. After each answer, **immediately write it into `aios-intake.md`**
so the user can resume if interrupted. Never ask Q8.

### Q1 — Who are you, what do you do, and who do you do it for?

Identity, role/firm, offer, clients or team served. One paragraph each. If they
give a vague corporate bio, push back once: *"What does a client actually hire you
for, in one sentence?"*

### Q2 — Paste 1-2 things you've written recently. Don't edit them.

**This is the only question with a hard rule.** Voice samples MUST be pasted raw,
not typed mid-conversation. If the user starts typing fresh prose, refuse:

> *"Stop — paste it raw. If you type it here while we're talking, the sample is
> already shaped by our conversation. Open your last email or LinkedIn post in
> another tab and paste the unedited text. This is the one rule I can't bend."*

Ask for two samples. An email and a post, or two of either. One from a proposal
intro is ideal for Agent-OS users given the proposal drafting pipeline.

### Q3 — What are your 2-3 biggest priorities for the next 90 days?

Quarterly priorities, not yearly aspirations. If they say "grow my business" or
"be more efficient", push back once: *"Name a number, a deadline, or a
deliverable. What specifically would make Q3 a success?"*

### Q4 — Where does revenue actually land, and where is it tracked?

Multiple answers OK. Stripe, QuickBooks, a CRM (HubSpot/Salesforce/Dynamics),
a spreadsheet. Note whether it's Microsoft Dynamics/Power BI → that's Graph API
territory.

### Q5 — Where do you talk to customers, your team, and the outside world?

Email provider (Gmail or **Outlook**), messaging (Teams, Slack, Discord), phone
(iMessage, WhatsApp). **This determines the primary connector path.**

- **Outlook/Teams** → M365 ecosystem → flag that the `o365 plugin` covers email,
  calendar, OneDrive, and Teams via Microsoft Graph API. Note this in connections.
- **Gmail/Google Workspace** → Google ecosystem → flag that Graph API won't cover
  calendar; they'll need a Google MCP or script.
- Both → note both, recommend wiring M365 first if they use Outlook heavily.

Domain 3 (Calendar) is auto-inferred: Outlook → Outlook Calendar; Gmail → Google
Calendar. Confirm verbally; don't ask a separate question.

### Q6 — Where do meeting recordings, notes, and important documents live?

Granola, Otter, Fireflies, OneNote, SharePoint/OneDrive, Google Drive, Notion,
Obsidian (this vault), a folder on the desktop. If **SharePoint or OneDrive** →
covered by the `o365 plugin`'s OneDrive connector.

### Q7 — What is the one task that eats your week, and where do you track work?

The single biggest time-sink or recurring drudgery — proposals, morning triage,
weekly reporting, status updates. This is the `top_pain` field used by future
skills. Plus task/project tracking tool (ClickUp, Asana, Linear, Notion, a
notebook).

---

## Step 3: Scaffold the Day-1 file set

Once the intake is complete, write or update all files below in a single batch.
Before writing, check whether any exist:
- If they exist and have real content → back them up first:
  create `archives/intake-{YYYY-MM-DD-HHMM}/` and copy originals there.
- If they are blank templates (`[Your answer here]`) → overwrite without backup.

### Files to write

**`10-Profiles/about-me.md`**
From Q1 (identity, name, role) and Q7 (top_pain). Two short paragraphs: who they
are, and the one thing that eats their week. Use the vault YAML frontmatter:
```yaml
---
type: profile
title: About Me
tags: [profile, identity]
---
```

**`10-Profiles/about-business.md`**
From Q1 (offer, ICP) and Q4 (revenue model). Two paragraphs: what the business
does and sells, and where money lands. Same frontmatter pattern with `title: About My Business`.

**`10-Profiles/priorities.md`**
From Q3. Numbered list, one line per priority, with a brief "why it matters" note
inferred from context. Frontmatter: `title: 90-Day Priorities`.

**`10-Profiles/writing-style.md`**
From Q2. Paste the voice samples verbatim under a "## Samples" section. Above the
samples, write a short analysis (3-5 bullets) of their register: sentence length,
formality level, structural habits, words they lean on, what to avoid. This file
already exists as a template — fill it, don't replace the structure.

```yaml
---
type: profile
title: Writing Style
tags: [profile, style]
source: onboard
---
```

**`connections.md`**
Populate the 7-row table from Q4-Q7 answers. Every row gets `not yet connected`
as the mechanism and `—` for auth and last-checked. Row 8 (memory mesh) is always
present. If the user is on M365 (Outlook/Teams/SharePoint/OneDrive), add a note
below the table:

> **M365 note:** Wire these via the `o365 plugin` (Microsoft Graph API). Run
> `npm run login` from `o365 plugin/` to authenticate. No browser automation —
> Graph API only.

**`CLAUDE.md`** (root or vault root — wherever it exists)
Fill all `{{...}}` placeholders:
- `{{Your Name}}` → from Q1
- `{{stated priority}}` → the top priority from Q3, one line
- Knowledge base block → a compact summary of Q1 (offer + ICP) + Q3 (priorities)
- Connections block → one line per Q4-Q7 tool, mechanism `not yet connected`, note
  that M365 tools wire via `o365 plugin`
- Voice register summary → 1-2 sentences distilled from Q2 samples (informal/formal
  level, sentence length, key habits)

If `CLAUDE.md` doesn't exist yet, create it using the template from
`open-agent-os/vault-template/` if available.

---

## Step 4: The closing screen

Print exactly three lines. No menu, no checklist, no upsell:

```
✓ Day 1 done. Your Agent-OS knows who you are, what you sell, what matters this quarter, and how you sound.

Today: ask me — "what should I focus on this week?"
Tomorrow: pick one tool from connections.md and wire it up (run `npm run login` for M365, or save a references/{tool}-api.md for anything else).
```

When the user runs the closing prompt ("what should I focus on this week?"):
- Respond using only the new context files you just wrote.
- Lead with a 3-bullet priority list in their voice register from Q2.
- Each bullet ties back to a Q3 priority.
- Close with: *"If I had to pick one thing for Monday, it'd be [X] — because [reason from Q3 + Q7]. Want me to draft the first email? And — where could AI take something off your plate here?"*

That final question seeds the Default Shift mindset: treating AI leverage as the
default question, not an afterthought.

---

## Critical rules

1. **7-question cap is non-negotiable.** Do not ask Q8 in conversation.
2. **Voice paste cannot be skipped.** If the user types Q2 samples mid-chat, refuse
   and ask them to paste from real writing.
3. **Write intake answers as you go.** After each answer, update `aios-intake.md`
   immediately so progress isn't lost.
4. **One-shot scaffold.** After the interview ends, write Step 3 files in a single
   batch. No multi-turn confirmation between files.
5. **Idempotent.** Re-running refreshes context files from the updated intake; backs
   up originals if they have real content. Skip questions that already have answers
   unless the user explicitly wants to revise.
6. **Three-line closing screen.** Not a menu. Not a checklist. Three lines.
7. **Never write to `.env`.** Don't ask for API keys on Day 1. Connections come Day 2.
8. **Graph API first for M365.** Never suggest browser automation for Outlook,
   Teams, SharePoint, or OneDrive. Always point to the `o365 plugin`.
9. **Memory mesh is always row 8 in connections.md.** It ships with the system and
   is always reachable over the Tailscale mesh.
10. **Don't generate extra skills.** The kit ships with `onboard`, `linkedin-post`,
    and whatever the user already has. Let them author more via the SKILLS.md guide.
