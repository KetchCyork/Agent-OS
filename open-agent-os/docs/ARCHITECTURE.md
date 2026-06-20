# Architecture

Local web app (TypeScript/Node) at `http://localhost:3737`, talking to three back ends
(OpenRouter, Ollama, Anthropic), a memory layer, and a set of MCP connectors.

## Module map

Each module below corresponds to a feature from the reference video (gaming removed),
mapped to what we actually build.

| Module | What it does | Core pieces |
|---|---|---|
| **Mission Control** | Status of every agent, job, and a cost tracker | dashboard + run log + token accounting |
| **Model Router + Fusion** | One call site; automatic fallback; ensemble+judge | `src/models/router.ts` |
| **Memory** | Shared brain across all models | Obsidian + local index + assembler (`docs/MEMORY.md`) |
| **Pipeline** | Idea → classify → plan → **you approve** → build → filed | items live in `vault/50-Pipeline/` |
| **Kanban** | Multi-agent task board (triage→todo→running→done) | orchestrator decomposes + assigns to profiles |
| **Skills & Tools** | Reusable, shareable capabilities | skill = folder with instructions + optional code |
| **Voice (Jarvis)** | Talk instead of type; wake word | local Whisper (STT) + Piper (TTS); optional |
| **Connectors** | OneDrive, Outlook, Teams, Motion, LinkedIn | MCP servers + direct APIs |
| **LinkedIn pipeline** | Local video render → approve → publish | HTML→MP4 render + official Posts API |

## Profiles

A **profile** is a named agent persona = a system prompt + a bound model (by router
id) + an allowed tool/skill set + a working folder. The video's "Hermes" exposes
profiles like `content-judge`, `seo-lead`, `writer`. We store profiles as YAML in
`profiles/` (examples included) so they're easy to read, edit, and share.

## Agentic patterns (built on the router + profiles)

- **Pipeline**: an inbox-classifier routes each captured idea to project / action /
  idea / reference / escalate, drafts a plan, and waits at the human gate before any
  build runs.
- **Kanban orchestration**: a prompt is decomposed into subtasks, each assigned to a
  profile; cards move triage→todo→running→done with handoff summaries written to disk.
- **Judge loop** (content quality): a `judge` profile scores a draft against a rubric
  and returns PASS/REVISE; REVISE loops back. Used for the content/LinkedIn pipeline.
- **Fusion**: panel of models answer in parallel; a judge writes one verdict. Costly,
  reserved for high-stakes calls.

## Action safety

Side-effectful actions (send email, post to LinkedIn, write to a shared drive,
change settings) always require explicit approval in the UI and use your own
authenticated connector sessions. The system never enters your passwords, never
scrapes, and never uses automation that violates a platform's terms.

## Cross-machine setup

- **Home MacBook Pro (HQ):** always-on host. Runs Ollama (local models + embeddings), the dashboard, and background jobs.
- **Work machine:** runs remote source ingestion, the Microsoft 365 connector (OneDrive/Outlook/Teams), and browser access. Raw work data stays local to that node.
- **Shared memory brain:** `Agent-Memory` is the shared retrieval service built on Obsidian + LanceDB. It is accessible from both HQ and remote nodes.
- **Secure mesh:** Tailscale connects HQ and remote nodes over a private network. This provides the remote command gateway and secure transport for memory and job orchestration.
- **Proposal ingestion:** the `Paperclip proposal skill` runs on the memory-enabled side of the system, using template profiles and opportunity matching to draft business proposals.

- Vaults can be kept separate (personal vs work) or merged; the memory layer treats them as pluggable sources.
