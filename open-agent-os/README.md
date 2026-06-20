# Open Agent OS

A local-first, open-source "agentic operating system": one dashboard where every
model you use (Claude, plus anything via OpenRouter, plus local models on your own
machine) shares **one memory** and a catalog of **skills and tools**, so it can
actually help with your real work instead of being a chat box you re-explain
yourself to every morning.

Runs on your machine. Your data stays yours.

> Status: early scaffold. See `docs/ROADMAP.md` for what's built and what's next.

## Why this exists

Most people use powerful models the hard way: many tabs, one model at a time, no
shared memory, re-pasting context constantly, and no record of what was produced.
This project gives the models a home — a shared brain, a task pipeline with a human
approval gate, and reusable skills — so work compounds instead of evaporating.

## Design principles

- **Local-first.** It runs on your Mac (or work machine). Local models and local
  embeddings via [Ollama](https://ollama.com) mean private work never leaves the device.
- **Memory lives outside the models.** Obsidian is the durable store of record;
  a local retrieval index makes that memory usable by *any* model. See `docs/MEMORY.md`.
- **Model-agnostic.** One router, with automatic fallback and an optional
  multi-model "Fusion" ensemble for high-stakes calls. See `src/models/router.ts`.
- **Human-in-the-loop.** Anything that sends, posts, or publishes pauses for your
  approval. No scraping, no ToS-violating automation.
- **Easy to install.** One stack (TypeScript/Node), one config file, one command.

## Architecture at a glance

```
            ┌──────────────────────────────────────────────┐
            │                Local Web App                  │
            │  Mission Control · Pipeline · Kanban · Memory  │
            │  Fusion · Skills · Voice · Connectors          │
            └───────────────┬──────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────────┐
        │                   │                        │
   Model Router        Memory Layer              Connectors (MCP)
   - OpenRouter        - Obsidian vault          - Microsoft 365
   - Ollama (local)    - Local vector index        (OneDrive/Outlook/Teams)
   - Anthropic         - Context assembler       - Motion (tasks)
   - Fallback + Fusion - Style profiles          - LinkedIn (publish)
```

## Quickstart (target experience)

```bash
git clone <your-repo> open-agent-os
cd open-agent-os
cp .env.example .env        # add your keys
npm install
npm run setup               # creates/links your Obsidian vault, pulls local models
npm run dev                 # opens the dashboard at http://localhost:3737
```

## What you provide

- An Obsidian vault path (a starter layout is in `vault-template/`).
- An OpenRouter API key (optional but recommended for model variety + fallback).
- Ollama installed locally (optional, for free/private local models + embeddings).
- A Claude subscription or Anthropic API key (optional).
- Connector logins you opt into (Microsoft 365, Motion, LinkedIn).

See `docs/SUBSCRIPTIONS.md` for the full, costed list.

## License

Intended to be released under a permissive open-source license (MIT/Apache-2.0,
to be confirmed by the maintainer).
