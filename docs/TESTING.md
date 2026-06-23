# Testing

AboT uses Vitest for unit and integration tests.

## Commands

Run the full test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run coverage:

```bash
npm run test:coverage
```

Run one test file:

```bash
npm test -- packages/router/src/router.test.ts
```

Run tests by name:

```bash
npm test -- -t "router examples"
```

Run full local QA:

```bash
npm run qa
```

`qa` runs TypeScript, Vitest, and the legacy smoke scripts.

## Test Layout

Tests are colocated with the code they cover:

```txt
packages/router/src/router.test.ts
packages/context/src/context.test.ts
packages/core/src/core.test.ts
apps/cli/src/check-api.test.ts
```

Prefer unit tests for pure packages first:

- `@abot/router`
- `@abot/context`
- `@abot/agents`
- `@abot/core`

Use integration tests for server/API behavior. The API integration test starts a throwaway server on an ephemeral port and writes to `.tmp-test-vitest/`, which is ignored by Git.

## Coverage

Coverage reports are written to:

```txt
coverage/
```

The folder is ignored by Git. Use coverage to find untested code, not as a hard quality score yet.

## Legacy Smoke Scripts

These still exist for quick CLI checks:

```bash
npm run test:router
npm run test:api
```

New behavior should generally be added to Vitest tests first.
