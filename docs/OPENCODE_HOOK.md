# OpenCode Hook

AboT v0.01 exposes a small stdin/stdout hook command:

```txt
npm run opencode:hook
```

It reads JSON from stdin:

```json
{
  "task": "fix the auth middleware returning 401",
  "files": ["src/middleware/auth.ts"],
  "changedFiles": [],
  "diffLines": 0,
  "mode": "orchestrated"
}
```

It writes JSON to stdout:

```json
{
  "agent": "prometheus",
  "contextBudgetTokens": 2000,
  "warnings": [],
  "phase": "deterministic",
  "source": "abot-server"
}
```

For a fixed-agent baseline:

```json
{
  "task": "fix the auth middleware returning 401",
  "files": ["src/middleware/auth.ts"],
  "mode": "fixed_agent",
  "fixedAgent": "atlas"
}
```

By default it calls:

```txt
http://127.0.0.1:3217/api/route
```

Override with:

```txt
ABOT_SERVER_URL=http://127.0.0.1:3217
```

If the server is not running, the hook falls back to local deterministic routing and marks the response with `server-unavailable-local-route`.

## Router LLM Fallback

Set these environment variables to enable the Phase 2 OpenAI-compatible router fallback:

```txt
ABOT_ROUTER_BASE_URL=https://your-provider.example/v1
ABOT_ROUTER_API_KEY=...
ABOT_ROUTER_MODEL=deepseek-v4-flash
```

Secrets should stay in environment variables, not in `data/api-tools.json`.
