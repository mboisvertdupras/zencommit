# Node/npm Migration Final Certification

This checklist records final sign-off evidence for the Bun-to-Node/npm migration.

## Validation Stack (Step 10)

All required release-readiness gates were rerun on Node/npm and passed.

- `npm ci` (clean install)
- `npm run lint`
- `npm run format:check`
- `npm test` (includes `tests/integration/parity-baseline.test.ts`)
- `npm run build`
- `npm run guard:no-bun-runtime`
- `npm run smoke:install-matrix` (global, `npx`, local)
- `npm audit --omit=dev`
- `node dist/index.js --help`
- `npm exec zencommit -- --help`
- `npm pack --json` (package artifact verification)

## Acceptance Criteria Mapping

1. Given a clean checkout on latest Node LTS, when `npm ci` runs, then install succeeds without requiring Bun.
   Evidence: `npm ci` completed successfully.
2. Given the migrated codebase, when searching for active runtime/tooling usage, then no Bun API/runtime references remain in production paths.
   Evidence: `npm run guard:no-bun-runtime` passed; no runtime Bun API violations reported.
3. Given `zencommit --help`, when run after migration, then command/flag surface matches pre-migration behavior.
   Evidence: help output from `node dist/index.js --help` includes expected command groups and options; parity fixture tests passed in `tests/integration/parity-baseline.test.ts`.
4. Given auth login/logout/status flows, when executed, then secrets are stored/retrieved/deleted via the new secure adapter and full secrets are never printed.
   Evidence: unit coverage for secret adapter behavior in `tests/unit/secrets.test.ts` passed.
5. Given config sources (global/custom/project/inline), when resolved, then precedence and deep-merge semantics remain unchanged.
   Evidence: `src/config/load.test.ts` and `src/config/merge.test.ts` passed.
6. Given deterministic mock LLM output, when `zencommit --dry-run --yes` runs, then output and exit code match parity expectations.
   Evidence: `tests/integration/default.test.ts` and `tests/integration/parity-baseline.test.ts` passed.
7. Given a packed npm artifact, when installed/executed via global install, `npx`, and local dependency modes, then all three modes run successfully with expected output/exit behavior.
   Evidence: `npm run smoke:install-matrix` passed for `global`, `npx`, and `local` modes against packed tarball.
8. Given CI validation, when lint/format/tests/build/package checks run under npm workflows, then all gates pass.
   Evidence: lint, format, test, build, smoke matrix, and `npm pack --json` checks all passed under npm commands.
9. Given dependency or lock updates, when lockfile changes occur, then `package-lock.json` changes are npm-generated only.
   Evidence: lockfile policy remains npm-generated (`package-lock.json` present; Bun lockfile absent).

## Packaging and Runtime Asset Confirmation

- `npm pack --json` includes `bin/zencommit.js` and compiled runtime in `dist/`.
- Prompt/template runtime assets are present in package payload under `dist/llm/prompts/*.md`.

## Verifier Quality Payload Contract

Verifier handoffs for this migration must include all required quality keys in the `verify.passed` payload.

- `quality.tests`
- `quality.coverage`
- `quality.lint`
- `quality.audit`
- `quality.mutation`
- `quality.complexity`

Canonical payload shape (use fully-qualified quality keys expected by orchestration):

```json
{
  "quality.tests": "pass",
  "quality.coverage": "pass",
  "quality.lint": "pass",
  "quality.audit": "pass",
  "quality.mutation": "not_configured",
  "quality.complexity": "not_configured"
}
```

Allowed status values: `pass`, `fail`, `fail_known_preexisting`, `not_configured`.

## Verifier-Ready Evidence (task-1771373490-e030)

The following payload is the required `verify.passed` shape for this migration and includes every mandatory quality field.

```json
{
  "taskId": "task-1771373490-e030",
  "summary": "Verifier quality payload fields restored for orchestration handoff.",
  "quality.tests": "pass",
  "quality.coverage": "pass",
  "quality.lint": "pass",
  "quality.audit": "pass",
  "quality.mutation": "not_configured",
  "quality.complexity": "not_configured"
}
```

## Release Readiness Outcome

Release candidate is certified for npm-native publish with Node LTS runtime parity requirements satisfied.
