# Dependency Upgrade Notes

## S04 Runtime Upgrade Batches — 2026-04-25

### Batch 1: AI SDK/provider family

Command:

```sh
npm install ai@latest @ai-sdk/amazon-bedrock@latest @ai-sdk/anthropic@latest @ai-sdk/azure@latest @ai-sdk/cerebras@latest @ai-sdk/cohere@latest @ai-sdk/deepinfra@latest @ai-sdk/gateway@latest @ai-sdk/google@latest @ai-sdk/google-vertex@latest @ai-sdk/groq@latest @ai-sdk/mistral@latest @ai-sdk/openai@latest @ai-sdk/openai-compatible@latest @ai-sdk/perplexity@latest @ai-sdk/togetherai@latest @ai-sdk/vercel@latest @ai-sdk/xai@latest
```

Outcome:

- Upgraded `ai` from `6.0.61` to `6.0.168`.
- Upgraded the direct `@ai-sdk/*` provider family to npm `latest` versions compatible with the AI SDK 6 graph.
- No provider-facing source migration was required for `generateObject`, `generateText`, `jsonSchema`, or the provider factory imports.
- Targeted provider/generation/default-flow/parity tests passed after the batch.

### Batch 2: OpenRouter provider

Command:

```sh
npm install @openrouter/ai-sdk-provider@latest
```

Outcome:

- Upgraded `@openrouter/ai-sdk-provider` from `2.1.1` to `2.8.0`.
- The existing `openrouter(modelName)` factory boundary in `src/llm/providers.ts` remains valid.
- Targeted provider/generation/default-flow/parity tests passed after the batch.

### Batch 3: GitLab provider package move

Commands:

```sh
npm install @gitlab/gitlab-ai-provider@latest
npm uninstall @gitlab/gitlab-ai-provider && npm install gitlab-ai-provider@latest
```

Outcome:

- `@gitlab/gitlab-ai-provider@4.1.0` installed successfully but npm reported the package is deprecated and moved to `gitlab-ai-provider`.
- Replaced the deprecated direct dependency with `gitlab-ai-provider@6.6.0`.
- Updated `src/llm/providers.ts` to import `gitlab` from `gitlab-ai-provider`.
- The existing `gitlab`, `gitlab-ai`, and `gitlab-duo` model aliases remain unchanged for users.
- Targeted provider/generation/default-flow/parity tests passed after the migration.

### Batch 4: CLI prompt/spinner/tokenizer support packages

Command:

```sh
npm install @clack/prompts@latest yocto-spinner@latest js-tiktoken@latest @dqbd/tiktoken@latest yargs@latest
```

Outcome:

- Upgraded `@clack/prompts` from `1.0.0` to `1.2.0`.
- Upgraded `yocto-spinner` from `1.0.0` to `1.1.0`.
- Aligned the direct `js-tiktoken` package spec with installed latest `1.0.21`.
- Confirmed `@dqbd/tiktoken@1.0.22` and `yargs@18.0.0` were already latest.
- No prompt cancellation, spinner, or yargs source migration was required.
- Targeted provider/generation/default-flow/parity tests passed after the batch.

## S04 Dev Toolchain Upgrade Batch — 2026-04-25

Command:

```sh
npm install --save-dev vitest@latest vite@latest typescript@latest @types/node@latest @types/yargs@latest prettier@latest oxlint@latest oxlint-tsgolint@latest
```

Outcome:

- Upgraded `vitest` from `4.0.18` to `4.1.5` and added direct `vite@8.0.10` devDependency ownership so the Vitest/Vite lockfile path resolves the approved Vite 8 graph.
- Upgraded `@types/node` from `25.1.0` to `25.6.0`, `prettier` from `3.8.1` to `3.8.3`, and `typescript` from `5.9.3` to `6.0.3`.
- Confirmed `@types/yargs@17.0.35`, `oxlint@1.61.0`, and `oxlint-tsgolint@0.22.0` were already latest practical stable versions.
- Aligned the public `typescript` peer range with the upgraded dev compiler (`^6.0.3`).
- `npm ls vite vitest rollup postcss` now shows `vitest@4.1.5`, direct `vite@8.0.10`, `postcss@8.5.10`, and no locked `rollup` path under the Vitest/Vite graph.
- Verified the updated toolchain through the package build and test gates.

## S04 Final Audit/Outdated Closure — 2026-04-25

Commands:

```sh
npm audit --audit-level=low --json
npm outdated --json
npm update minimatch brace-expansion
npm audit --audit-level=low --json
npm outdated --json
```

Outcome:

- Initial T04 audit evidence still found transitive `glob -> minimatch -> brace-expansion` advisories through `@ai-sdk/google-vertex -> google-auth-library -> gaxios -> rimraf`.
- `npm update minimatch brace-expansion` refreshed the lockfile to `minimatch@9.0.9` and `brace-expansion@2.1.0` through normal semver ranges; no direct dependency, override, `--force`, or credentialed registry access was required.
- `npm audit --audit-level=low --json` returned 0 total vulnerabilities after the transitive refresh.
- `npm outdated --json` returned an empty JSON object (`{}`), confirming no direct runtime or dev dependency drift remains.

## Intentional Runtime Pins / Exceptions

None for direct runtime or dev dependencies. If a future direct package is intentionally held back, document the package name, current version, wanted/latest version, reason, and follow-up owner here before claiming `npm outdated --json` closure.

## Failure / Audit Findings

- No npm metadata parse failures or lockfile generation failures occurred during S04.
- No live provider credentials were required for verification; tests used mocks and local CLI fixtures.
- The remaining low-threshold audit finding from T03 was closed in T04 by updating the vulnerable transitive `glob` path to patched `minimatch` and `brace-expansion` versions. `npm audit --audit-level=low` now exits 0 with 0 vulnerabilities.
- `npm outdated --json` now exits 0 with `{}`. There are no intentional direct dependency pins or outdated-package exceptions to carry into S05/S06/S07.
