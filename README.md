# Agent OS

Agent OS is the local-first orchestrator for a personal agent operating system. It provides the dashboard, model router, skill execution, connector integration, and cross-machine coordination.

This repository contains the primary Agent OS package in `open-agent-os/` and is the entry point for the broader solution composed of the following repos:

- `Agent-OS` - dashboard, mission control, model router, skill catalog, connector integration, and remote command orchestration.
- `Agent-Memory` - shared memory brain built on Obsidian + LanceDB, with remote memory ingestion and search.
- `paperclip-mesh-runner` - remote capability node runner for executing work on other machines over a secure mesh.

## What this repo does

- Hosts the Agent OS dashboard and mission control UI.
- Routes model calls through OpenRouter, local Ollama models, and Anthropic.
- Provides a skills and tools framework for reusable capabilities.
- Integrates memory, connectors, and agent workflows.
- Supports cross-machine operation so remote Windows work nodes can contribute source data and remote commands.

## Capabilities

- Local web dashboard for agents, jobs, and connectors.
- Model routing with fallback and optional fusion ensembles.
- Shared memory integration with external memory services.
- Skills and tools for reusable actions.
- Remote node health and source ingestion support.

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
- `open-agent-os/docs/` - architecture, roadmap, memory, and skills documentation.
- `open-agent-os/src/` - source code for the dashboard, router, skills, and connectors.

## Next steps

- Configure the shared memory service from `Agent-Memory`.
- Configure remote nodes using `paperclip-mesh-runner` for source-aware execution.
- Use the dashboard to monitor agent jobs and remote ingestion status.
