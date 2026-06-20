# Roadmap

A build order designed so each phase is useful on its own, and so the foundations
(memory + router) are solid before the modules that sit on top of them.

## Phase 0 — Foundations (done)
- [x] Repo structure, docs, config template
- [x] Model router: OpenRouter + Ollama + Anthropic, with fallback chains
- [x] Fusion (panel + judge)
- [x] Memory design spec + vault template
- [x] Stack locked: **TypeScript**

## Phase 1 — Memory that works across models (in progress)
- [x] Vault loader (read notes + frontmatter, chunking)
- [x] Local embeddings (Ollama `nomic-embed-text`)
- [x] LanceDB store + **hybrid retrieval** (vector + keyword via RRF)
- [x] CLI: `index` (build memory) and `ask` (answer on any model, using memory)
- [ ] Context assembler v2 (profiles + retrieval + recent logs, token-budgeted)
- [ ] Style learning from a OneDrive proposal directory
- [ ] Optional graph/temporal layer (Graphiti/mem0) once multi-hop is needed

## Phase 1.5 — Skills & Tools (done)
- [x] Skill manifest + tool contracts (`src/skills/types.ts`)
- [x] Auto-discovery registry: builtin + user dirs, drop-in folders
- [x] Example skill `linkedin-post` with a packaged tool
- [x] `skills` CLI + `docs/SKILLS.md` authoring guide

## Phase 2 — Dashboard + Mission Control
- [ ] Local web app shell at :3737, left-nav modules
- [ ] Mission Control: run log, model-used, token/cost tracking
- [ ] Per-agent chat with workspace (saved outputs)

## Phase 3 — Pipeline + Kanban + Skills
- [ ] Capture → classify → plan → human gate → build → filed
- [ ] Multi-agent kanban with orchestrator + judge loop
- [ ] Skills/tools catalog (shareable skill folders)

## Phase 4 — Connectors (work productivity)
- [ ] Microsoft 365: OneDrive (proposals), Outlook + Teams (awareness/briefings)
- [ ] Motion: pull/update tasks via API
- [ ] Daily briefing: "what needs my attention" across email/Teams/tasks

## Phase 5 — LinkedIn content pipeline
- [ ] Topic → draft post (your writing style) → judge → you approve
- [ ] HTML→MP4 local video render for branded clips
- [ ] Publish via official LinkedIn Posts API at scheduled time (human-approved)

## Phase 6 — Voice (optional)
- [ ] Local Whisper (STT) + Piper (TTS) + wake word
- [ ] "Jarvis" hands-free command of the agents

## Phase 7 — Open-source polish
- [ ] One-command installer, sample vault, docs site
- [ ] License, contribution guide, profile/skill marketplace format
