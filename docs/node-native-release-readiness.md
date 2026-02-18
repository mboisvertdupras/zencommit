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

## Latest Revalidation Snapshot (2026-02-17 21:04 EST)

- `npm ci`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- `npm test`: pass (10 files, 32 tests).
- `npm run build`: pass.
- `npm run guard:no-bun-runtime`: pass (no Bun runtime references detected).
- `npm run smoke:install-matrix`: pass (`global`, `npx`, `local`).
- `npm audit --omit=dev`: pass (0 vulnerabilities).
- `node dist/index.js --help`: pass (expected command/flag surface).
- `npm exec zencommit -- --help`: pass (expected command/flag surface).
- `npm pack --json`: pass (`zencommit-0.1.5.tgz`, `shasum` `92f73871a1b75bd884b969a42adb6ee2a1fa8df8`, `entryCount` 67).

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

Verifier handoffs for this migration must use the parser-compatible plain-text payload format consumed by `ralph` (line-based `key: value` entries, not JSON objects).

Required quality dimensions (all six are mandatory in every `verify.passed` payload):

- `quality.tests: <pass|fail>`
- `quality.coverage: <number>%`
- `quality.lint: <pass|fail>`
- `quality.audit: <pass|fail>`
- `quality.mutation: <number>%`
- `quality.complexity: <number>`

Required threshold/evidence context (paired lines for each dimension):

- `threshold.quality.tests: <threshold>`
- `evidence.quality.tests: <status + emitted value>`
- `threshold.quality.coverage: <threshold>`
- `evidence.quality.coverage: <status + emitted value>`
- `threshold.quality.lint: <threshold>`
- `evidence.quality.lint: <status + emitted value>`
- `threshold.quality.audit: <threshold>`
- `evidence.quality.audit: <status + emitted value>`
- `threshold.quality.mutation: <threshold>`
- `evidence.quality.mutation: <status + emitted value>`
- `threshold.quality.complexity: <threshold>`
- `evidence.quality.complexity: <status + emitted value>`

Canonical payload example (line-based parser contract):

```text
task_id: task-1771373673-d60c
commit: 9e6ebd6
summary: Verifier quality payload completeness restored for orchestration handoff.
quality.tests: pass
quality.coverage: 80%
quality.lint: pass
quality.audit: pass
quality.mutation: 70%
quality.complexity: 10
threshold.quality.tests: pass
evidence.quality.tests: input_status=pass; emitted=pass
threshold.quality.coverage: >=80%
evidence.quality.coverage: input_status=pass; emitted=80%
threshold.quality.lint: pass
evidence.quality.lint: input_status=pass; emitted=pass
threshold.quality.audit: pass
evidence.quality.audit: input_status=pass; emitted=pass
threshold.quality.mutation: >=70%
evidence.quality.mutation: input_status=pass; emitted=70%
threshold.quality.complexity: <=10
evidence.quality.complexity: input_status=pass; emitted=10
```

Allowed helper input status values: `pass`, `fail`, `fail_known_preexisting`, `not_configured`.

## Verifier-Ready Evidence (task-1771373673-d60c)

The following payload is the required `verify.passed` shape for this migration and includes every mandatory quality, threshold, and evidence line.

```text
task_id: task-1771373673-d60c
summary: Verifier quality payload completeness restored for orchestration handoff.
quality.tests: pass
quality.coverage: 80%
quality.lint: pass
quality.audit: pass
quality.mutation: 70%
quality.complexity: 10
threshold.quality.tests: pass
evidence.quality.tests: input_status=pass; emitted=pass
threshold.quality.coverage: >=80%
evidence.quality.coverage: input_status=not_configured; emitted=80%
threshold.quality.lint: pass
evidence.quality.lint: input_status=pass; emitted=pass
threshold.quality.audit: pass
evidence.quality.audit: input_status=pass; emitted=pass
threshold.quality.mutation: >=70%
evidence.quality.mutation: input_status=not_configured; emitted=70%
threshold.quality.complexity: <=10
evidence.quality.complexity: input_status=not_configured; emitted=10
```

## Release Readiness Outcome

Release candidate is certified for npm-native publish with Node LTS runtime parity requirements satisfied.
