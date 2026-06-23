# Routing Design

Routing has three stages:

1. Deterministic scoring: infer task intent, complexity, scope, and candidate agents.
2. LLM fallback: only disambiguate when deterministic scoring is close or weak.
3. Resolution: apply cost, session, and project guardrails.

This split is important. Most tasks should never need an LLM call just to choose an LLM.

## Inputs

- raw user task
- open file paths
- changed file paths
- git diff line count
- structured project history
- optional structured payload
- project routing preferences

## Verdict Shape

```json
{
  "intent": "code_impl",
  "complexity": "medium",
  "scope": "execution",
  "phase": "deterministic",
  "deterministicScore": 0.82,
  "suggestedAgent": "atlas",
  "signals": ["task:implement", "files:ts"],
  "reason": "Implementation task touching TypeScript files"
}
```

## Intents

- `css_design`: visual UI, layout, CSS, animations, design polish
- `code_impl`: normal implementation or refactor
- `qa_review`: review, audit, tests, regressions, risk checks
- `planning`: architecture, sequencing, decomposition
- `research`: docs, lookup, summarize, compare
- `debugging`: errors, failing tests, traces, broken behavior
- `multimodal`: images, screenshots, visual inspection
- `writing`: docs, copy, release notes, long-form text

## Deterministic Gate

If the top deterministic score is high enough and clearly separated from the runner-up, skip the LLM classifier.

Default:

```txt
phase1Threshold = 0.75
ambiguityMargin = 0.15
expensiveAgentConfidence = 0.85
```

Fast-model confidence numbers are not well calibrated, so the LLM fallback should return a choice and a one-sentence reason, not a fake precise probability.

## Cost Guardrail

Do not route to expensive agents for small or ambiguous work.

Guarded agents:

- `sisyphus`
- `momus`
- `ultrabrain`

These should require high confidence and high or ultra complexity, depending on the task.

## Agent Table

```txt
intent          low                 medium              high          ultra
css_design      visual-engineering  visual-engineering  visual-eng    visual-eng
code_impl       atlas               sisyphus-junior     hephaestus    sisyphus
qa_review       atlas               atlas               momus         momus
planning        librarian           oracle              metis         oracle
research        explore             librarian           librarian     librarian
debugging       prometheus          prometheus          hephaestus    sisyphus
multimodal      multimodal-looker   multimodal-looker   multimodal    multimodal
writing         quick               quick               writing       writing
```

## Multi-Intent Tasks

V1 should not split tasks into subcalls. If a task has multiple strong intents, route to the highest-priority/highest-cost intent and log the secondary intents.

Example:

```txt
"review the CSS and fix the auth regression"
signals: qa_review + css_design + debugging
primary: debugging
agent: hephaestus or sisyphus depending on complexity
```

## Context Budgets

Initial defaults:

```txt
low:    2000 tokens
medium: 6000 tokens
high:   16000 tokens
ultra:  32000 tokens
```

Project overrides can later tune these numbers.

V1 should report and warn on budget mismatches. Automatic context trimming comes later.
