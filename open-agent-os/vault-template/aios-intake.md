---
type: intake
title: Agent-OS Intake
tags: [system, onboarding]
---

# Agent-OS Intake

This is the source-of-truth file for your Agent-OS. Fill it by typing, voice-pasting (Wispr Flow / OS dictation), or running `/onboard` for a guided conversation. This file is what `/onboard` reads to scaffold your Day-1 setup.

**Hard cap: 7 questions.** Each answerable in under 60 seconds. You can edit and re-run `/onboard` any time — it's idempotent.

---

## Q1 — Who are you, what do you do, and who do you do it for?

Your name, your role or firm, your offer, and the clients or team you serve. One paragraph each is fine.

```
[Your answer here]
```

---

## Q2 — Paste 1-2 things you've written recently. Don't edit them.

An email, a proposal intro, a LinkedIn post, a Slack message — anything that sounds like you when you're not performing. **Paste verbatim.** Do not type these mid-conversation — chat-shaped samples pick up my voice, not yours.

```
[Sample 1 — paste raw]
```

```
[Sample 2 — paste raw]
```

---

## Q3 — What are your 2-3 biggest priorities for the next 90 days?

Quarterly priorities. Not yearly aspirations. Things that, if not done by the end of Q3, would make you say "I wasted the quarter."

```
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]
```

---

## Q4 — Where does revenue actually land, and where is it tracked?

Multiple answers OK. Stripe? QuickBooks? A spreadsheet? A CRM? Name the specific tool.

```
[Your answer here]
```

---

## Q5 — Where do you talk to customers, your team, and the outside world day-to-day?

Email (Gmail or Outlook)? Microsoft Teams? Slack? Discord? iMessage? Name each channel and whether it's M365 or Google Workspace — this determines which connectors to wire first.

```
[Your answer here]
```

---

## Q6 — Where do meeting recordings, notes, and important documents live?

Granola? Otter? Fireflies? SharePoint? OneDrive? Google Drive? Notion? A folder you keep meaning to organize?

```
[Your answer here]
```

---

## Q7 — What is the one task that eats your week, and where do you currently track work?

The single biggest time-sink or recurring drudgery. Plus where tasks and projects live (ClickUp / Asana / Linear / Notion / a notebook / nothing formal).

```
[Your answer here]
```

---

*When this file is filled, run `/onboard` (or re-run it) and the wizard will scaffold your Day-1 file set: vault context files, `10-Profiles/writing-style.md`, `connections.md`, and a populated `CLAUDE.md`.*
