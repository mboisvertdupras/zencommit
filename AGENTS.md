# Repository Guidelines

## Project Structure & Module Organization

- `src/index.ts` is the TypeScript CLI entrypoint; compiled runtime artifacts are emitted to `dist/`.
- `bin/zencommit.js` is the npm launcher that imports `dist/index.js`.
- Tooling metadata lives in `package.json`, `package-lock.json`, and TypeScript configs (`tsconfig*.json`).

## Build, Test, and Development Commands

- `npm ci` — install dependencies from lockfile (CI/reproducible installs).
- `npm run lint` — run Oxlint with type-aware checks and zero-warning enforcement.
- `npm run typecheck` — run the TypeScript no-emit typecheck gate.
- `npm run lint:fix` — auto-fix Oxlint issues where possible.
- `npm run format` — format with Prettier.
- `npm run format:check` — verify formatting.
- `npm test` — run Vitest suite (pretest builds `dist/`).
- `npm run test:unit` — fast unit suite, no build required (integration tests need `npm test`).
- `npm run build` — clean, compile TS, copy runtime assets, and verify `dist/`.
- `npm audit --audit-level=low` — run the low-threshold dependency security audit.
- `npm run smoke:install-matrix` — validate packed-artifact execution for global, `npx`, and local dependency modes.
- `node dist/index.js --help` — run the compiled CLI directly.

## Coding Style & Naming Conventions

- Node.js `>=22.14.0` is the package runtime floor; do not publish less-specific Node floor guidance for current setup.
- TypeScript + ESM only (`"type": "module"`). Prefer `import`/`export`; avoid CommonJS.
- Keep strict typing per `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, etc.).
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `kebab-case` for file names.
- Formatting/linting: Prettier (`.prettierrc.json`) and Oxlint via the package `lint` script.

## Testing Guidelines

- Test runner: Vitest (`npm test`).
- Unit tests live in `tests/unit/`; integration tests live in `tests/integration/`.
- Keep user-facing behavior covered (exit codes `0/2/3/4`, config precedence, auth fallback behavior, dry-run outputs).

## Commit & Pull Request Guidelines

- Use Conventional Commits (e.g., `feat: add config loader`, `fix: handle empty diff`).
- Keep subjects ≤72 chars; include a body for breaking changes or non-trivial behavior.
- PRs should include: summary, verification commands run, and updated CLI output examples when behavior-facing text changes.

## Security & Configuration Notes

- Never commit API keys or other secrets.
- Secrets must be stored via the runtime secure-store adapter (with env fallback), never in `zencommit.json`.
- Keep `zencommit.json` limited to non-sensitive configuration.
