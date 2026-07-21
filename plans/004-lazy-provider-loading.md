# Plan 004: Lazy-load provider SDKs so a run only pays for the provider it uses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/llm/providers.ts src/llm/generate.ts src/commands/auth.ts src/llm/providers.test.ts tests/unit/generate.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Two expected exceptions, not drift:
> (a) `src/llm/providers.test.ts` is _created by plan 003_ after the planned-at
> SHA; (b) if plan 008 (remove provider aliases) already landed,
> `PROVIDER_ALIASES`/`normalizeProviderId` are gone and three factory keys are
> renamed (`amazon-bedrock`, `google-vertex`, `google-vertex-anthropic`) —
> proceed, applying this plan's lazy-import conversion to the factory table
> exactly as found, preserving its keys.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/003-llm-layer-unit-tests.md (alias-resolution tests must exist first)
- **Category**: perf
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

`src/llm/providers.ts` statically imports all 19 provider SDKs (17 `@ai-sdk/*` packages plus `@openrouter/ai-sdk-provider` and `gitlab-ai-provider`). Measured at the planned-at commit: importing `dist/llm/providers.js` costs **~100–140 ms**, and importing `dist/commands/default.js` (the path every real `zencommit` run takes) costs **~156 ms total** — versus ~80 ms for the whole `--help` run, which lazy-loads commands. A commit-message CLI runs dozens of times a day; every run pays for 18 SDKs it won't use. Converting the factory table to dynamic `import()` cuts that cost to one SDK per run, and is the architectural prerequisite for ever slimming the dependency footprint (currently 239 MB node_modules / 161 packages).

## Current state

- `src/llm/providers.ts` (102 lines) — the only file that imports `@ai-sdk/*` packages. Structure:
  - Lines 1–21: 20 static imports (19 SDK factories + `type LanguageModel` from `ai`).
  - Lines 23–43: `PROVIDER_FACTORIES: Record<string, (modelName: string) => LanguageModel>` — one entry per provider, e.g. `openai: (modelName) => openai(modelName)`.
  - Lines 45–65: `PROVIDER_ALIASES` (e.g. `gemini→google`, `aws-bedrock→bedrock`, `together.ai→togetherai`).
  - Lines 77–102: `export const resolveLanguageModel = (modelId, options = {}): LanguageModel` — **synchronous**; splits `provider/model`; special-cases `openai-compatible` (uses `createOpenAICompatible` from `@ai-sdk/openai-compatible` with `options.openaiCompatible?.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL`); throws `'Model id must be in the format provider/model'` and `` `Unsupported model provider: ${rawProvider}` ``.
- **Call sites (exactly two, both already inside async functions):**
  - `src/llm/generate.ts:87-88`: `const resolveModel = (modelId, input) => resolveLanguageModel(modelId, { openaiCompatible: input.openaiCompatible });` — used at line 122 inside `callModelOnce` (async).
  - `src/commands/auth.ts:29-35`: `const resolveModel = (modelId, openaiCompatible) => { try { return resolveLanguageModel(...) } catch { return null } }` — used at line 42 inside `verifyCredentials` (async).
- Tests touching this surface: `src/llm/providers.test.ts` (created by plan 003 — sync calls that must become `await`/`rejects`), and `tests/unit/generate.test.ts` (mocks the `ai` package, not the provider SDKs; asserts `'Unsupported model provider'` errors through `generateCommitMessage`).
- Subpath import to preserve: `vertexAnthropic` comes from `'@ai-sdk/google-vertex/anthropic'` (line 10).

### Baseline measurements (reproduce before changing anything)

```
node -e 'const t=performance.now(); import("./dist/llm/providers.js").then(()=>{console.log((performance.now()-t).toFixed(0), "ms")})'
# ~100–140 ms at cd2908e
```

### Conventions

TypeScript ESM, strict mode, arrow-function exports, Prettier + oxlint (zero warnings). Conventional commits.

## Commands you will need

| Purpose   | Command                     | Expected on success         |
| --------- | --------------------------- | --------------------------- |
| Install   | `npm ci`                    | exit 0                      |
| Typecheck | `npm run typecheck`         | exit 0                      |
| Lint      | `npm run lint`              | exit 0, 0 warnings          |
| Build     | `npm run build`             | exit 0 (also verifies dist) |
| Tests     | `npx vitest run`            | all pass                    |
| Timing    | the `node -e` snippet above | see step targets            |

## Scope

**In scope** (the only files you should modify):

- `src/llm/providers.ts`
- `src/llm/generate.ts` (one `await`)
- `src/commands/auth.ts` (make its `resolveModel` async, one `await`)
- `src/llm/providers.test.ts` (sync → async assertions)
- `tests/unit/generate.test.ts` (only if its provider-error tests need `await` adjustments)

**Out of scope** (do NOT touch, even though they look related):

- `package.json` dependencies — do NOT demote `@ai-sdk/*` to optional/peer deps in this plan. That changes install behavior for users and is a separate decision.
- `src/auth/secrets.ts` provider table — different subsystem (auth env keys), even though it looks like a duplicate registry.
- `src/metadata/**` — model _metadata_ is unrelated to provider _SDK_ loading.
- The alias set and error messages — behavior must be byte-identical (plan 003's tests enforce this).

## Git workflow

- Branch: `advisor/004-lazy-provider-loading`
- Conventional commits, e.g. `perf(llm): lazy-load provider SDKs on first use`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline

Run `npm run build`, then the timing snippet 3×; record the median in your final report.

**Verify**: numbers in the ~100–140 ms range (machine-dependent; just record them).

### Step 2: Convert the factory table to dynamic imports

In `src/llm/providers.ts`:

1. Delete the 19 static SDK imports (keep `import type { LanguageModel } from 'ai';` — type-only imports are erased at compile time and cost nothing at runtime).
2. Change the table type to `Record<string, (modelName: string) => Promise<LanguageModel>>` and each entry to the dynamic form:

```ts
const PROVIDER_FACTORIES: Record<string, (modelName: string) => Promise<LanguageModel>> = {
  openai: async (m) => (await import('@ai-sdk/openai')).openai(m),
  anthropic: async (m) => (await import('@ai-sdk/anthropic')).anthropic(m),
  google: async (m) => (await import('@ai-sdk/google')).google(m),
  'vertex-anthropic': async (m) => (await import('@ai-sdk/google-vertex/anthropic')).vertexAnthropic(m),
  ...
  gitlab: async (m) => (await import('gitlab-ai-provider')).gitlab(m),
};
```

Every entry mirrors the original import name exactly (the static import list at the top of the current file is the authoritative mapping — package name ↔ exported factory). If `PROVIDER_ALIASES` and `normalizeProviderId` still exist (plan 008 not yet executed), keep them unchanged; if plan 008 already removed them, leave the post-008 lookup (`rawProvider.toLowerCase()`) untouched.

3. Make `resolveLanguageModel` async (`Promise<LanguageModel>`); in the `openai-compatible` branch, `const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');` then proceed as before. **Keep the two `throw new Error(...)` messages and the order of checks identical** — `tests/unit/generate.test.ts` matches on `'Unsupported model provider'` and plan 003's tests pin the rest.

**Verify**: `npm run typecheck` → errors ONLY at the two call sites (expected, fixed next step) or exit 0 if you fix them in the same pass.

### Step 3: Await at the two call sites

- `src/llm/generate.ts:87-88` — make `resolveModel` return the promise and `await` it at line 122: `const model = await resolveModel(input.modelId, input);`
- `src/commands/auth.ts:29-35` — make `resolveModel` async and `try { return await resolveLanguageModel(...) } catch { return null }`; `verifyCredentials` already awaits nothing at line 42 — change to `const model = await resolveModel(modelId, openaiCompatible);`.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 4: Update tests

- `src/llm/providers.test.ts` (from plan 003): error assertions become `await expect(resolveLanguageModel(...)).rejects.toThrow(...)`; happy-path/alias assertions become `await expect(...).resolves.toBeTruthy()`.
- `tests/unit/generate.test.ts`: run it; if the `'Unsupported model provider'` test still passes untouched (it should — the error now arrives via promise rejection inside the same async flow), leave the file alone.

**Verify**: `npx vitest run` → all pass.

### Step 5: Measure the win and run the install gate

`npm run build`, then re-run the timing snippet 3×. Then run the packaging smoke test:

**Verify**:

- median import time for `dist/llm/providers.js` **< 30 ms** (it should now import only the alias tables);
- `node dist/index.js --help` still exits 0;
- `npm run smoke:install-matrix` → exit 0 (confirms packed-artifact execution still works for global/npx/local installs — dynamic imports must resolve in all three layouts);
- `npm test` → all pass.

## Test plan

- Plan 003's `src/llm/providers.test.ts` is the regression suite — every alias and error path, now async.
- One new test in `providers.test.ts`: `resolveLanguageModel('openai/gpt-4o')` twice in a row resolves both times (exercises repeated dynamic import; Node caches modules, this pins that no state breaks on the second call).
- Existing `tests/unit/generate.test.ts` continues to cover the generate-flow integration (it mocks `ai`, not the SDKs, so it exercises the real lazy `resolveLanguageModel`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "^import .*@ai-sdk" src/llm/providers.ts` → 0 (no static value imports of SDKs; a `grep -c "await import('@ai-sdk" src/llm/providers.ts` → ≥ 16)
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `npm test` exits 0
- [ ] `npm run smoke:install-matrix` exits 0
- [ ] Reported median import time of `dist/llm/providers.js` < 30 ms post-change, with before/after numbers in the final report
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 003's tests do not exist yet (`ls src/llm/providers.test.ts` fails) — execute plan 003 first; do not write throwaway tests inline.
- TypeScript cannot type a dynamic subpath import (`@ai-sdk/google-vertex/anthropic`) after one attempt at the standard form — report the exact error; do not switch to `any`.
- The smoke install matrix fails on the npx or global layout — dynamic import resolution differs there; report rather than adding bundling.
- Any pinned error message or alias behavior changes (a plan-003 test fails for non-async reasons).

## Maintenance notes

- This unlocks (but does not perform) dependency-footprint work: with lazy loading, `@ai-sdk/*` packages could become `optionalDependencies` or install-on-demand. That is a user-facing install-behavior change needing a maintainer decision — deliberately out of scope.
- Reviewer should scrutinize: the factory table entries against the old import list one-by-one (a typo'd package name now fails at _runtime_ for that provider only, not at build time). The alias tests catch all of them, which is why plan 003 is a hard dependency.
- Future provider additions must add: a factory entry here, an auth entry in `src/auth/secrets.ts`, and a row in README — see plan 008 (remove provider aliases), which sets the naming rule: one id per provider, matching models.dev's key.
