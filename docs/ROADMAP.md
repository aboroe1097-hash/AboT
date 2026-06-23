# Roadmap

## Phase 1: Router CLI

Goal: type a task, receive a selected agent, context budget, and explanation.

Deliverables:

- router verdict type
- deterministic weighted classifier
- ambiguity detection
- LLM fallback contract
- deterministic resolver
- cost unit guardrails
- CLI command
- config examples

## Phase 2: Routing Log and Cost

Goal: make every routing decision explainable and bounded.

Deliverables:

- SQLite routing log
- session budget tracking
- conservative token estimate
- context budget warning
- per-project routing overrides

## Phase 3: OpenCode Adapter

Goal: route OpenCode tasks through AboT.

Deliverables:

- beforeAgentCall hook
- local API contract
- active agent patching
- routing log correlation

## Phase 3.5: v0.01 Local Web

Goal: make the router easy to try.

Deliverables:

- project picker
- chat dry-run
- route history
- API tool config editor
- health/status display

## Phase 4: Replay and Structured History

Goal: make failed or weak routes easy to retry.

Deliverables:

- replay task with different agent
- recent project changes from git diff file lists
- task outcome annotations
- project preference storage

## Phase 5: Local Web UI

Goal: add a local workspace only after the router is useful.

Deliverables:

- project sidebar
- task composer
- session tree
- cost meter
- context preview
- streaming response panel
- agent badge and routing explanation
