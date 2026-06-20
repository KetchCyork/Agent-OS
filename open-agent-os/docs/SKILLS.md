# Skills & Tools

The system is meant to grow. A **skill** packages instructions (and optionally
tools) for a kind of work; a **tool** is a typed function the system can call.
You add either by dropping a folder in — no core code changes, no rebuild.

## Where skills live

- **Built-in:** `skills/` in this repo (ships with the app).
- **Yours / users':** `~/.open-agent-os/skills/` (a writable directory).

Both are scanned at startup, and the user directory can be reloaded at runtime.
If a user skill has the same `id` as a built-in one, the user's wins.

## Anatomy of a skill

```
skills/
  my-skill/
    skill.yaml        # manifest (required)
    SKILL.md          # instructions handed to the model (recommended)
    tools/            # optional tool implementations
      do-thing.ts
    assets/           # optional templates, images, etc.
```

### skill.yaml

```yaml
id: my-skill                 # unique id (required)
name: My Skill               # display name (required)
description: One-liner.
when_to_use: >               # tells the orchestrator when to pick this skill
  Use when the user wants to ...
version: 0.1.0
author: you
model: writer                # optional: preferred router model id
tools:                       # optional: tool files this skill contributes
  - tools/do-thing.ts
```

### SKILL.md

Plain instructions, in your own words, telling the model how to do the work and
what to output. It's injected as a system message when the skill is used. See
`skills/linkedin-post/SKILL.md` for a worked example.

## Anatomy of a tool

A tool file default-exports a `Tool` (or an array of them):

```ts
import type { Tool } from "../../../src/skills/types.js";

const myTool: Tool = {
  name: "do_thing",
  description: "What it does, plainly.",
  parameters: {
    topic: { type: "string", description: "...", required: true },
  },
  sideEffect: false,          // set true if it sends/posts/publishes/deletes
  async handler(args, ctx) {
    // ctx gives you: router (models), vaultPath, services, requireApproval
    const res = await ctx.router.call("writer", [{ role: "user", content: String(args.topic) }]);
    return { text: res.text };
  },
};

export default myTool;
```

### The approval rule

Any tool that sends, posts, publishes, or deletes must set `sideEffect: true`
and call `await ctx.requireApproval("plain summary of what will happen")`,
proceeding only if it returns `true`. The system never performs irreversible or
outbound actions without explicit human approval, and never enters credentials
on your behalf.

## Adding one (the whole workflow)

1. `mkdir ~/.open-agent-os/skills/my-skill`
2. Add `skill.yaml` and `SKILL.md` (and `tools/*.ts` if needed).
3. Reload (or restart). The skill and its tools are now available.

That's it. The same steps let any user of the open-source project extend it for
their own needs.
