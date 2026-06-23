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

## Testing

```txt
npm test
npm run test:watch
npm run test:coverage
```

Tests are colocated as `*.test.ts` and run with Vitest. See [TESTING.md](docs/TESTING.md).

## Logging and Exports

AboT logs orchestrated and fixed-agent runs in the same shape so you can compare routing overhead, cost units, token estimates, and timing.

See [LOGGING_AND_EXPORTS.md](docs/LOGGING_AND_EXPORTS.md).

## Local API Keys

The web Tools panel stores environment variable names only. Put real keys in `.env.local`, which is ignored by Git:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

macOS/Linux:

```bash
cp .env.example .env.local
${EDITOR:-nano} .env.local
npm run dev
```

Do not paste actual API keys into `configs/*.json`, `README.md`, or any tracked file. The server auto-loads `.env.local` on startup, and the Tools panel marks a tool as configured when the required env vars exist.

For Gemini as the router classifier:

```powershell
Copy-Item .env.gemini.example .env.local
notepad .env.local
npm run dev
```

macOS/Linux:

```bash
cp .env.gemini.example .env.local
${EDITOR:-nano} .env.local
npm run dev
```

This uses Gemini's OpenAI-compatible chat endpoint with `gemini-3.1-flash-lite` by default. You can also set `ABOT_ROUTER_MODEL=gemini-3.5-flash` if you want a stronger router classifier.

## Model Execution

`Send` is safe by default: it routes and logs a dry-run. Tick `Execute` in the composer when you want AboT to call the selected model.

Execution reads the selected agent's primary and fallback models from:

```txt
ABOT_OPENAGENT_CONFIG
```

If unset, AboT tries:

```txt
%USERPROFILE%\.config\opencode\oh-my-openagent.json
```

On macOS/Linux, the default is the same path under your home directory:

```txt
~/.config/opencode/oh-my-openagent.json
```

If the exact AboT agent name is not present in that file, AboT maps agents to common OpenAgent categories such as `coding`, `review`, `planning`, `research`, `quick`, `deep`, and `multimodal`.

Model strings map to environment keys at runtime:

```txt
openai/gpt-5.5                  -> OPENAI_API_KEY
google/gemini-3.1-pro-preview   -> GEMINI_API_KEY
openrouter/...                  -> OPENROUTER_API_KEY
opencode-go/...                 -> OPENCODE_GO_BASE_URL and optional OPENCODE_GO_API_KEY
```

`OPENCODE_GO_BASE_URL` is only needed when you select `opencode-go/...` models. Set it to the OpenAI-compatible `/v1` URL exposed by your local gateway.

Execution metrics are appended to route logs as `executionStatus`, `executionProvider`, `executionModel`, `actualInputTokens`, `actualOutputTokens`, and `executionLatencyMs`.

## OpenCode Hook

```txt
npm run opencode:hook
```

See [OPENCODE_HOOK.md](docs/OPENCODE_HOOK.md).

## Workspace Mode

Initialize any local folder:

```txt
npm run workspace:init -- D:\Project\your-project
```

Then use the Workspace tab to browse files, edit files, and run terminal commands from that project root.

See [WORKSPACE_MODE.md](docs/WORKSPACE_MODE.md).
