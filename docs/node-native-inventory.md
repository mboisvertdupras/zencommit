# Node-Native Migration Inventory (Bun Usage)

This inventory is historical migration context: it maps the Bun-specific runtime, tooling, CI, and documentation usage that must be addressed during the Bun-to-Node migration to make `zencommit` fully Node/npm-native. It is not current setup guidance; current maintainer commands live in `README.md`, `AGENTS.md`, and package scripts.

## Runtime code (must refactor)

| Area                         | Current Bun usage                                                         | References                                                                                                                                 | Node-native target                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| CLI entrypoint               | Bun shebang                                                               | `src/index.ts:1`                                                                                                                           | Use `#!/usr/bin/env node`                                                                                   |
| Secret storage               | `Bun.secrets.set/get/delete`                                              | `src/auth/secrets.ts:164`, `src/auth/secrets.ts:168`, `src/auth/secrets.ts:176`                                                            | Replace with Node-compatible secret backend (for example OS keychain via `keytar` or encrypted local store) |
| Process spawning             | `Bun.spawn` for command execution                                         | `src/util/exec.ts:33`, `src/ui/editor.ts:20`                                                                                               | Replace with `node:child_process` (`spawn`/`execFile`) wrappers                                             |
| File loading + markdown hook | `Bun.file(...).text()`, `Bun.markdown.render`, Bun file import assertions | `src/llm/prompt.ts:2`, `src/llm/prompt.ts:3`, `src/llm/prompt.ts:4`, `src/llm/prompt.ts:5`, `src/llm/prompt.ts:39`, `src/llm/prompt.ts:45` | Replace with `node:fs/promises` file reads and remove Bun markdown dependency                               |

## Tests (must refactor)

| Area                      | Current Bun usage      | References                             | Node-native target                                    |
| ------------------------- | ---------------------- | -------------------------------------- | ----------------------------------------------------- |
| Integration test launcher | Invokes CLI with `bun` | `tests/integration/default.test.ts:38` | Invoke `node` (compiled output or ts runner strategy) |

## Tooling and packaging (must refactor)

| Area                   | Current Bun usage                    | References                | Node-native target                                                                                                              |
| ---------------------- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Build script           | `bun build --compile`                | `package.json:21`         | Replace with Node-compatible packaging flow (for example `tsup`/`esbuild` + standalone binary strategy, or JS-only npm package) |
| Dev types              | `@types/bun` dependency              | `package.json:63`         | Remove once Bun globals are gone                                                                                                |
| Lockfile               | Bun lockfile in repo                 | `bun.lock`                | Replace with `package-lock.json`                                                                                                |
| Generated-file scoring | Explicit `bun.lock` lockfile pattern | `src/llm/truncate.ts:274` | Keep as optional historical pattern or remove if Bun support is dropped                                                         |
| Gitignore comment      | Mentions Bun install                 | `.gitignore:1`            | Update comment to npm install wording                                                                                           |

## CI/CD workflows (must refactor)

| Workflow      | Current Bun usage                  | References                                                                                                                                                                               | Node-native target                                            |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| CI            | Bun setup + `bun install/run/test` | `.github/workflows/ci.yml:13`, `.github/workflows/ci.yml:15`, `.github/workflows/ci.yml:16`, `.github/workflows/ci.yml:17`, `.github/workflows/ci.yml:18`, `.github/workflows/ci.yml:19` | Use `actions/setup-node`, `npm ci`, `npm run ...`, `npm test` |
| Release build | Bun setup/install/build            | `.github/workflows/release.yml:35`, `.github/workflows/release.yml:37`, `.github/workflows/release.yml:38`, `.github/workflows/release.yml:43`                                           | Build artifacts with Node-native toolchain                    |

## Documentation and contributor guidance (must refactor)

| Area                | Current Bun usage                                 | References                                                                                                                                                                                                                                                                                 | Node-native target                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| User docs           | Bun install/run/test commands and Bun positioning | `README.md:13`, `README.md:23`, `README.md:26`, `README.md:34`, `README.md:35`, `README.md:120`, `README.md:359`, `README.md:366`, `README.md:369`, `README.md:372`, `README.md:373`, `README.md:376`, `README.md:377`, `README.md:380`, `README.md:383`, `README.md:414`, `README.md:426` | Rewrite installation/dev/auth text for Node/npm runtime   |
| Build spec          | Bun is a foundational constraint in spec text     | `docs/spec.md:3`, `docs/spec.md:29`, `docs/spec.md:30`, `docs/spec.md:74`, `docs/spec.md:85`, `docs/spec.md:91`, `docs/spec.md:102`, `docs/spec.md:112`, `docs/spec.md:486`, `docs/spec.md:512`, `docs/spec.md:540`, `docs/spec.md:571`, `docs/spec.md:578`, `docs/spec.md:588`            | Update specification language to Node-native expectations |
| Repo agent guidance | Bun-first dev instructions                        | `AGENTS.md:5`, `AGENTS.md:7`, `AGENTS.md:12`, `AGENTS.md:13`, `AGENTS.md:14`, `AGENTS.md:15`, `AGENTS.md:16`, `AGENTS.md:17`, `AGENTS.md:31`, `AGENTS.md:41`                                                                                                                               | Update contributor/agent instructions to npm/node         |

## User-facing Bun wording to update alongside runtime changes

- `src/index.ts:122`
- `src/index.ts:133`
- `src/commands/auth.ts:106`
- `src/commands/auth.ts:122`

These strings currently mention "Bun secrets" and should be renamed once a Node-native secret backend is selected.

## Baseline validation before migration edits

- `bun run lint` passed
- `bun run test` passed (5 files, 9 tests)
