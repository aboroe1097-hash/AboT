# Data Model

SQLite should be the default local store. The schema should stay simple until the router proves itself.

## Tables

### projects

- id
- name
- root_path
- created_at
- updated_at
- default_context_budget
- preferences_json
- session_budget_units

### sessions

- id
- project_id
- title
- parent_session_id
- created_at
- updated_at
- status

### task_nodes

- id
- project_id
- session_id
- parent_task_id
- raw_task
- normalized_task_hash
- status
- created_at
- completed_at

### routing_decisions

- id
- task_id
- phase
- intent
- complexity
- scope
- deterministic_score
- selected_agent
- selected_model
- context_budget_tokens
- context_estimate_tokens
- context_budget_warning
- cost_units
- session_budget_remaining
- estimated_input_tokens
- estimated_output_tokens
- estimated_cost_usd
- actual_input_tokens
- actual_output_tokens
- actual_cost_usd
- latency_ms
- reason
- signals_json

### task_replays

- id
- source_task_id
- replay_task_id
- original_agent
- replay_agent
- reason
- created_at

### file_contexts

- id
- task_id
- path
- role
- relevance_score
- included
- token_estimate

### memory_items

- id
- project_id
- source_task_id
- kind
- summary
- tags_json
- confidence
- created_at
- last_used_at

### agent_runs

- id
- task_id
- agent
- model
- provider
- status
- started_at
- completed_at
- error_code
- error_message

## Memory Rule

Do not add an LLM extraction call after every task in v1. First, store structured data that already exists: task text, files changed, selected agent, token cost, latency, and outcome. Add LLM-generated summaries only if structured history proves insufficient.
