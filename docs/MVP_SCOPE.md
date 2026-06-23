# MVP Scope

The feedback is clear: AboT v1 should ship as a router, not a full personal IDE.

## V1 Goal

Automatically select the right agent for a task, keep costs visible, and log enough structured data to improve routing over time.

## Build Now

- Deterministic-first router.
- LLM fallback only for ambiguous routing decisions.
- Cost units and session budget guardrails.
- Conservative context budget reporting.
- Structured SQLite log of tasks, selected agents, files, tokens, latency, and outcomes.
- Replay or re-route a task with a different agent.
- Per-project routing overrides.
- OpenCode hook adapter.
- Simple local web UI for routing, chat dry-runs, route history, and API tool config.

## Do Not Build Yet

- Automatic repo-wide context trimming.
- LLM-based memory extraction after every task.
- Session branching with filesystem state.
- Full Codex-style web workspace.
- Multi-provider streaming UI.

These can come later, after real usage shows which ones matter.

## Replacements

| Earlier Idea | V1 Replacement |
| --- | --- |
| Context trimmer | Context budget reporter and warning |
| LLM memory extraction | Structured git-aware task log |
| Session branching | Replay or re-route command |
| Full web app | CLI and OpenCode hook first |
| Every task uses classifier LLM | Deterministic classifier first |

## Success Criteria

- Phase 1 deterministic routing handles at least 60% of tasks.
- Fewer than 15% of tasks fall to `unspecified-high`.
- Expensive agents never run when session budget is exhausted.
- Every route is logged with enough detail to explain why it happened.
- The router can be used from the CLI and from OpenCode.
