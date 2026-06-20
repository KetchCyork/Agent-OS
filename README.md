# Agent OS

Agent OS is the local-first orchestrator for a personal agent operating system. It provides the dashboard, model router, skill execution, connector integration, and cross-machine coordination.

This repository contains the primary Agent OS package in `open-agent-os/` and is the entry point for the broader solution composed of the following repos:

- `Agent-OS` - dashboard, mission control, model router, skill catalog, connector integration, and remote command orchestration.
- `Agent-Memory` - shared memory brain built on Obsidian + LanceDB, with remote memory ingestion and search.
- `paperclip-mesh-runner` - remote capability node runner for executing work on other machines over a secure mesh.
- `O365 Browser plugin` - browser-based integration for secure Office 365 access from remote nodes.
- `o365 plugin` - Microsoft 365 connector for Graph-based mail, calendar, OneDrive, and Teams access.
- `Paperclip proposal skill` - proposal ingestion and drafting skill for firm proposal templates and opportunity-based draft generation.

## What this repo does

- Hosts the Agent OS dashboard and mission control UI.
- Routes model calls through OpenRouter, local Ollama models, and Anthropic.
- Provides a skills and tools framework for reusable capabilities.
- Integrates memory, connectors, and agent workflows.
- Supports cross-machine operation so remote Windows work nodes can contribute source data and remote commands.

## Capabilities

- Local web dashboard for agents, jobs, connectors, and remote node orchestration.
- Model routing with fallback and optional fusion ensembles.
- Shared memory integration with Agent-Memory and external memory services.
- Support for connectors and plugins, including Office 365 and browser-based node integration.
- Proposal ingestion and drafting support via the Paperclip proposal skill.
- Cross-machine execution and secure mesh coordination with remote nodes.

## Requirements

Before installing this repo, make sure you have the following tools and services available:

- Node.js 18+ and npm (required for `open-agent-os` and agent runtime packages).
- `Agent-Memory` and a configured Obsidian vault if you want shared memory features.
  - Obsidian is used as the local vault format for knowledge storage.
  - LanceDB is used by the memory brain for embeddings and retrieval.
- `paperclip-mesh-runner` / Paperclip tooling if you want remote capability nodes and mesh execution.
- A model provider or local model runtime:
  - OpenRouter, Anthropic, or Ollama for model routing.
- Optional but recommended:
  - `O365 Browser plugin` and `o365 plugin` for Office 365 connector workflows.
  - `Paperclip proposal skill` for proposal template ingestion and draft generation.

This repo can run the dashboard independently, but full capability requires the companion repos above.

## Installation

```powershell
cd "Agent OS"
cd open-agent-os
cp .env.example .env
# Update .env with keys and paths, including OpenRouter, Ollama, Anthropic, and connector credentials.
npm install
npm run setup
npm run dev
```

The app should then be available at `http://localhost:3737`.

## Structure

- `open-agent-os/` - main dashboard and runtime package.
- `open-agent-os/docs/` - architecture, roadmap, memory, skills, and cross-machine documentation.
- `open-agent-os/src/` - source code for the dashboard, router, skills, and connectors.

## Cross-machine docs

- `open-agent-os/docs/CROSS_MACHINE_ARCHITECTURE.md` — full cross-machine architecture design for HQ, remote work nodes, mesh networking, and shared memory.

## Next steps

- Configure the shared memory service from `Agent-Memory`.
- Configure remote nodes using `paperclip-mesh-runner` for source-aware execution.
- Use the dashboard to monitor agent jobs and remote ingestion status.
