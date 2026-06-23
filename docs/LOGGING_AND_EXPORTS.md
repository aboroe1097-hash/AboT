# Logging and Exports

AboT logs every route in a shape designed for later comparison.

The main experiment is:

```txt
orchestrated mode  vs  fixed_agent mode
```

Use the same task, file list, and diff size in both modes. Orchestrated mode lets AboT choose the agent. Fixed-agent mode bypasses agent selection and forces one agent, while still collecting the same timing and token estimates.

## Run Modes

### orchestrated

AboT runs the full routing path:

```txt
task -> deterministic classifier -> optional LLM fallback -> resolver -> guardrails -> selected agent
```

### fixed_agent

AboT skips agent selection:

```txt
task -> fixed selected agent -> same logging/export shape
```

This is the baseline for comparing one model against orchestration.

## Logged Fields

Each route stores:

- task text
- run mode
- fixed agent, when used
- selected agent
- router phase
- intent and complexity
- open files
- changed files
- diff lines
- context estimate
- context budget warning
- cost units
- task token estimate
- estimated input tokens
- estimated output tokens
- warnings
- full verdict JSON
- full decision JSON
- per-step timings
- metrics JSON

## Timings

Timings are in milliseconds.

```txt
projectMs       project lookup/create time
normalizeMs     request normalization and file list prep
budgetMs        session budget lookup
planningMs      full planning call from server perspective
classifyMs      deterministic classification time
llmFallbackMs   LLM router fallback time, if enabled
contextMs       context scoring and token estimate time
resolveMs       agent resolution and guardrail time
affinityMs      session affinity check
dbLogMs         SQLite route write/update time
totalPlanMs     core planning total
totalRequestMs  full /api/route server handling time
```

In `fixed_agent` mode, `classifyMs`, `llmFallbackMs`, and `resolveMs` are `0` because route selection is bypassed.

## Token Estimates

AboT v0.01 estimates tokens conservatively:

```txt
taskEstimateTokens      task text estimate
contextEstimateTokens   file path/content estimate
estimatedInputTokens    task + context estimate
estimatedOutputTokens   rough expected output by complexity
```

These are estimates, not provider-reported usage. The v0.01 estimator uses `Math.ceil(text.length / 3.5)`, which is a rough English/code heuristic. It is good enough for warnings and comparisons, but it will not match every language or provider tokenizer.

When real model execution is added, actual provider token usage should be appended as:

```txt
actualInputTokens
actualOutputTokens
actualCostUsd
```

## Export Endpoints

JSON:

```txt
GET /api/export/routes?format=json
```

CSV:

```txt
GET /api/export/routes?format=csv
```

Optional filters:

```txt
projectId=<project id>
limit=1000
```

Example:

```txt
http://127.0.0.1:3217/api/export/routes?format=csv&limit=1000
```

## API Examples

Orchestrated:

```bash
curl -X POST http://127.0.0.1:3217/api/route \
  -H "content-type: application/json" \
  -d "{\"task\":\"fix auth regression\",\"mode\":\"orchestrated\",\"openFiles\":[\"src/auth.ts\"]}"
```

Fixed agent:

```bash
curl -X POST http://127.0.0.1:3217/api/route \
  -H "content-type: application/json" \
  -d "{\"task\":\"fix auth regression\",\"mode\":\"fixed_agent\",\"fixedAgent\":\"atlas\",\"openFiles\":[\"src/auth.ts\"]}"
```

## Comparison Protocol

1. Pick a benchmark task.
2. Run once with `mode=orchestrated`.
3. Run once with `mode=fixed_agent` and a selected baseline agent.
4. Export CSV.
5. Compare:
   - `selectedAgent`
   - `costUnits`
   - `estimatedInputTokens`
   - `estimatedOutputTokens`
   - `totalRequestMs`
   - `planningMs`
   - route warnings

For real execution later, add provider-reported latency and actual token usage to the same row.
