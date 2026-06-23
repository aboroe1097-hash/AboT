# Architecture

AboT should start as a local router for AI development tasks. OpenCode and the CLI should call the same routing core. A web UI can come later.

## Boundaries

```txt
Client adapters
  - web UI
  - CLI
  - OpenCode hook

Core orchestration
  - route task
  - estimate context budget
  - estimate cost
  - execute agent call
  - record routing decision

Local storage
  - SQLite
  - project config
  - routing logs
  - task replay metadata
  - structured project history
```

## Main Components

### Router

The router receives raw task text plus project signals. It has three phases:

1. Deterministic scoring from file paths, keywords, diff size, and session affinity.
2. LLM fallback only when deterministic signals are ambiguous.
3. Cost and session guardrails before final agent selection.

It returns a structured verdict:

- intent
- complexity
- scope
- deterministic score
- suggested agent
- context budget
- short reason

A cheap model can classify ambiguous tasks, but final routing should go through deterministic TypeScript rules.

### Context Budget Reporter

V1 should not automatically trim context. That sounds simple but gets hard quickly across languages, import graphs, and model-specific tokenizers.

Instead, V1 reports the estimated context size and warns when a simple task is about to send too much context to an expensive agent. Initial signals:

- files explicitly mentioned in the task
- open files
- changed files from git diff
- file extensions
- import graph proximity
- keyword overlap
- project memory hits

### Agent Executor

The executor maps an agent to a model/provider call. It should preserve existing fallback chains where possible.

### Structured History

V1 memory should be structural, not LLM-generated. Store facts AboT already knows:

- files changed
- raw task
- selected agent
- intent and complexity
- cost estimate
- actual token usage
- latency
- outcome
- git diff file list

LLM memory summaries can be added later if structured history is not enough.

### Replay

Replay means sending the same task and context to a different agent. Branching is not part of v1 because true branching implies filesystem snapshots or git state management.

## OpenCode Integration

OpenCode should call AboT as an adapter:

```txt
OpenCode beforeAgentCall hook
  -> POST /route
  -> AboT returns selected agent/model/context budget
  -> OpenCode executes with patched selection
```

This keeps the routing engine reusable outside OpenCode.
