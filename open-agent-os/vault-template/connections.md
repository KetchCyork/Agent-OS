---
type: registry
title: Connections
tags: [system, connections]
---

# Connections

Registry of every system your Agent-OS can reach. Filled by `/onboard` from Q4-Q7 answers; expanded as you wire new tools. `/audit` checks this file for domain coverage and freshness.

| # | Domain | Tool | Mechanism | Auth | Last checked |
|---|---|---|---|---|---|
| 1 | Revenue / Financials | _filled by /onboard_ | not yet connected | — | — |
| 2 | Customer interactions | _filled by /onboard_ | not yet connected | — | — |
| 3 | Calendar | _filled by /onboard_ | not yet connected | — | — |
| 4 | Communication | _filled by /onboard_ | not yet connected | — | — |
| 5 | Project / task tracking | _filled by /onboard_ | not yet connected | — | — |
| 6 | Meeting intelligence | _filled by /onboard_ | not yet connected | — | — |
| 7 | Knowledge / files | _filled by /onboard_ | not yet connected | — | — |
| 8 | Memory mesh | agent-memory-mesh | http — :8377 | MEMORY_API_KEY | — |

**Mechanism options:** `mcp` (MCP server), `http` (REST API), `graph-api` (Microsoft Graph via o365 plugin), `script` (standalone script in `scripts/`), `export` (CSV/JSON pipeline), `key+ref` (`.env` key + `references/{tool}-api.md`), `not yet connected`.

**M365 note:** If your answers to Q5-Q6 mention Outlook, Teams, SharePoint, or OneDrive, use `graph-api` via the `o365 plugin` — that's the preferred connector over browser automation.

**Memory mesh:** Row 8 is always present. The agent-memory-mesh service runs on the HQ machine (see `CROSS-MACHINE-ARCHITECTURE.md`) and is always reachable over the Tailscale mesh.

When you wire a new tool, save `references/{tool}-api.md` capturing auth flow, key endpoints, and common queries — researched-once, saved-forever.
