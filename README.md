# AboT

AboT is a local-first AI orchestration workspace. Its first job is simple: route each task to the best available agent, keep costs visible, and log enough structured data to improve routing over time.

The long-term goal is a personal execution layer above tools like OpenCode, Codex, CLIs, and future adapters. The v1 goal is narrower: ship the router first and let real usage shape the rest.

## Product Principles

- Route obvious tasks without an LLM classifier.
- Use an LLM fallback only when deterministic signals are ambiguous.
- Prefer deterministic routing rules so behavior is tunable and debuggable.
- Warn about context and cost before expensive calls.
- Store every routing decision, cost estimate, output, and outcome locally.
- Let projects have routing preferences and overrides.
- Keep OpenCode as an adapter, not the center of the system.

## High-Level Flow

```txt
client task
  -> deterministic router
  -> LLM router only if ambiguous
  -> cost and session guardrails
  -> selected agent/model
  -> execution adapter
  -> structured routing log
```

## Planned Interfaces

- CLI for fast testing and scripting.
- OpenCode hook adapter for automatic routing inside OpenCode.
- Local web v0.01 for project management, routing, chat dry-runs, route history, and API tool config.

## Repo Layout

```txt
apps/
  cli/                  Command line interface
  web/                  Future local web workspace
packages/
  agents/               Agent and model config loading
  adapters-opencode/    OpenCode integration
  context/              File relevance and token budgeting
  core/                 Main orchestration pipeline
  memory/               SQLite storage and memory summaries
  router/               Classifier verdicts and resolver rules
configs/
  agents.example.json
  pricing.example.json
  routing-rules.example.json
docs/
  ARCHITECTURE.md
  DATA_MODEL.md
  ROADMAP.md
  ROUTING.md
```

## Current Status

v0.01 includes the router CLI, local API server, SQLite route/chat log, API tool config management, OpenCode hook command, and a simple local web UI.

## Run

```txt
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:3217
```

## QA

```txt
npm run qa
```

## Logging and Exports

AboT logs orchestrated and fixed-agent runs in the same shape so you can compare routing overhead, cost units, token estimates, and timing.

See [LOGGING_AND_EXPORTS.md](D:/Project/AboT/docs/LOGGING_AND_EXPORTS.md).

## OpenCode Hook

```txt
npm run opencode:hook
```

See [OPENCODE_HOOK.md](D:/Project/AboT/docs/OPENCODE_HOOK.md).

## Workspace Mode

Initialize any local folder:

```txt
npm run workspace:init -- D:\Project\your-project
```

Then use the Workspace tab to browse files, edit files, and run terminal commands from that project root.

See [WORKSPACE_MODE.md](D:/Project/AboT/docs/WORKSPACE_MODE.md).
