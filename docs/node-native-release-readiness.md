# Node/npm Release Readiness Notes

This note records the current M002 readiness posture for the Node/npm-native `zencommit` package. It replaces the old 0.1.5 migration snapshot with a living checklist for maintainers and records the fresh S07 all-gates certification for package version `0.2.5`.

## Current Runtime and Package Contract

- Package version: `0.2.5`.
- Runtime floor: Node.js `>=22.14.0`.
- Package entrypoints: `bin/zencommit.js` launches compiled ESM from `dist/index.js`.
- Install modes expected to work: global install, `npx`, and local dependency execution through the packed install smoke matrix.
- Secrets remain outside configuration: provider credentials are loaded from the secure-store adapter or environment variables and must never be committed to `zencommit.json`, docs fixtures, or tests.

## Current CLI Surface to Keep in Parity

The built CLI help is the source of truth for user-facing docs. Release notes and README examples should stay aligned with these command groups and options:

- Top-level: `zencommit --help`, `zencommit --version`, `zencommit --verbose`, `zencommit --yes`, `zencommit --dry-run`, `zencommit --all`, `zencommit --unstaged`, `zencommit --commit`, `zencommit --push`, `zencommit --model`, `zencommit --format`, `zencommit --lang`, and `zencommit --no-body`.
- Auth: `zencommit auth`, `zencommit auth login --env-key OPENAI_API_KEY --token <token>`, `zencommit auth logout --env-key OPENAI_API_KEY`, and `zencommit auth status`.
- Config: `zencommit config`, `zencommit config init`, `zencommit config print`, and `zencommit config validate`.
- Models: `zencommit models`, `zencommit models search [query] --max-items 10`, and `zencommit models info <modelId>`.

## S07 Final Certification Stack

S07 reran these gates from the package checkout for version `0.2.5`; every command below exited 0 in the final matrix:

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm audit --audit-level=low`
- `npm outdated --json`
- `node scripts/audit-baseline.mjs --check`
- `npm run smoke:install-matrix` (global, `npx`, and local dependency modes)

Additional release-maintainer probes remain useful before publishing from a fresh clone, but they are not separate open S07 blockers once the command matrix above is green:

- `npm ci`
- `npm test -- tests/integration/docs-parity.test.ts`
- `node dist/index.js --help`
- `node dist/index.js auth --help`
- `node dist/index.js config --help`
- `node dist/index.js models --help`
- `npm pack --json`

## M002 Evidence Covered

- S05 behavior coverage restored parity-sensitive CLI behavior, including exit codes `0`, `2`, `3`, and `4`, configuration precedence, auth fallback behavior, and dry-run outputs.
- S06 docs parity coverage verifies the built help surface and documentation claims for the command groups and options above.
- S07 final-gate coverage passed `npm run typecheck`, `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `npm audit --audit-level=low`, `npm outdated --json`, `node scripts/audit-baseline.mjs --check`, and `npm run smoke:install-matrix` after refreshing direct dependency drift.
- Dependency/security posture uses the low-threshold `npm audit --audit-level=low` command so low-severity advisories are visible rather than hidden by `--omit=dev`; the S07 run reported 0 vulnerabilities.
- Direct dependency drift is closed for this evidence set: `npm outdated --json` returned `{}` after the lockfile refreshed `@openrouter/ai-sdk-provider` to `2.8.1` within the existing package range.
- Linting is the Oxlint surface; do not document ESLint as the active maintainer gate.
- Packed install smoke passed for global, `npx`, and local dependency execution. The generated `zencommit-0.2.5.tgz` artifact was removed after the smoke run.

## Release Readiness Outcome

M002 docs, behavior, dependency posture, build output, and packed install surfaces are certified for the S07 final integrated gate on package version `0.2.5`. Future release tasks should rerun the same command matrix after any source, dependency, package metadata, or documentation changes before publishing a new artifact.
