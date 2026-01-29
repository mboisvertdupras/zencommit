# Repository Guidelines

## Project Structure & Module Organization

- `index.ts` is the current Bun/TypeScript entrypoint (prototype).
- `docs/spec.md` defines the CLI behavior and target module layout; treat it as the source of truth.
- Tooling lives in `package.json`, `tsconfig.json`, `bun.lock`. `node_modules/` is local only.
- As the codebase grows, follow the structure described in `docs/spec.md` (e.g., `src/commands/`, `src/config/`, `src/git/`, `src/llm/`).

## Build, Test, and Development Commands

- `bun install` — install dependencies.
- `bun index.ts` — run the current prototype entrypoint.
- `bun run lint` — run ESLint (TypeScript + Node/Bun globals).
- `bun run lint:fix` — auto-fix lint issues where possible.
- `bun run format` — format with Prettier.
- `bun run format:check` — verify formatting in CI.
- No build or test scripts are configured yet; add them in `package.json` when introducing a build step or tests.

## Coding Style & Naming Conventions

- TypeScript + ESM only (`"type": "module"`). Prefer `import`/`export`; avoid CommonJS.
- Keep code strict per `tsconfig.json` (e.g., `strict`, `noUncheckedIndexedAccess`).
- Indentation: 2 spaces in JSON; use 2 spaces in TS for consistency.
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, `kebab-case` for file names.
- Formatting/linting: Prettier (`.prettierrc.json`) and ESLint (`eslint.config.js`).

## Testing Guidelines

- Tests are not set up yet.
- The spec expects unit and integration tests (see `docs/spec.md`); when adding tests, include a clear runner command (e.g., `bun test`) and note the test locations.

## Commit & Pull Request Guidelines

- The repo has no commit history yet; start with Conventional Commits (e.g., `feat: add config loader`, `fix: handle empty diff`).
- Keep subjects ≤72 chars; include a body for breaking changes or complex behavior.
- PRs should include: a short summary, how you tested (commands), and any CLI output examples that changed.

## Security & Configuration Notes

- Never commit API keys or secrets. The spec requires Bun’s Secrets API and non-sensitive config in `zencommit.json`.
