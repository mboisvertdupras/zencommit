# Plan 003: Add unit tests for the untested LLM pure layer (providers, output, prompt)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/llm/providers.ts src/llm/output.ts src/llm/prompt.ts src/llm/prompt-template.ts`
> If any in-scope source file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (and it _unblocks_ plan 004, which refactors `providers.ts`)
- **Category**: tests
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

zencommit is an AI commit-message CLI. Three pure modules decide which provider SDK handles a model id, whether an LLM response is accepted, and what prompt the model sees — and none has a dedicated test file. They are tested only incidentally through `tests/unit/generate.test.ts`'s mocked flows. Plan 004 will rewrite `src/llm/providers.ts` to lazy-load provider SDKs; without alias-resolution tests pinning today's behavior first, that refactor cannot be verified. These modules are pure functions over plain data, so the tests are cheap and stable.

## Current state

This is a **tests-only plan**: no production source files change.

- `src/llm/providers.ts` (102 lines) — `resolveLanguageModel(modelId, options)` splits `provider/model`, normalizes the provider through `PROVIDER_ALIASES` (lines 45–65: e.g. `gemini→google`, `aws-bedrock→bedrock`, `together.ai→togetherai`, `open-router→openrouter`, `vercel-ai-gateway→gateway`), and dispatches to `PROVIDER_FACTORIES` (lines 23–43, 19 entries). The `openai-compatible` provider is special-cased (lines 87–96): requires `options.openaiCompatible.baseUrl` or `OPENAI_COMPATIBLE_BASE_URL` env, else throws `'OPENAI_COMPATIBLE_BASE_URL is required for openai-compatible models.'`. Errors: missing slash → `'Model id must be in the format provider/model'` (line 84); unknown provider → `` `Unsupported model provider: ${rawProvider}` `` (line 99).
- `src/llm/output.ts` (65 lines) — `validateCommitMessageOutput(value, phase)` accepts only plain objects with string `subject`/`body`, trims and CRLF-normalizes via `normalizeCommitMessageField`, rejects empty subjects; `parseCommitMessageOutput(rawJson, phase)` JSON-parses then validates. Both throw `CommitMessageOutputError` whose message embeds the phase, e.g. `'Invalid commit message response during text fallback: …'`.
- `src/llm/prompt.ts` (79 lines) — `buildPrompt(input)` / `buildPromptWithoutDiff(input)` load markdown templates from `src/llm/prompts/*.md` via `new URL('./prompts/base.md', import.meta.url)` and render with `renderTemplate` from `src/llm/prompt-template.ts`. Key behaviors: `style === 'conventional'` injects `conventional.md` content; `emoji: true` injects `gitmoji.md`; `includeBody` toggles the body guideline string; `buildPromptWithoutDiff` substitutes `'(omitted for budgeting)'` for the diff; empty fileList becomes `'(omitted)'`; empty diff becomes `'(empty)'`.
- `src/llm/prompt-template.ts` (43 lines) — `renderTemplate` supports `{{var}}` and `{{#if var}}...{{/if}}`.

Existing test exemplars:

- `tests/unit/generate.test.ts` — Vitest style for this repo: `vi.mock('ai', …)`, builder helpers like `baseInput(overrides)`, `afterEach` cleanup of env vars and mocks.
- `src/llm/tokens.test.ts`, `src/llm/truncate.test.ts` — colocated pure-function tests.

**Test placement**: this repo has both colocated tests (`src/**/*.test.ts`) and central ones (`tests/unit/`). For pure modules, colocated is the established pattern (`tokens.test.ts`, `truncate.test.ts` sit next to their modules). Put the three new files next to their modules: `src/llm/providers.test.ts`, `src/llm/output.test.ts`, `src/llm/prompt.test.ts`. There is no `vitest.config.ts`; Vitest's default glob picks up both locations.

**Construction-time side effects warning** (matters for `providers.test.ts`): the factory functions (`openai(modelName)`, `azure(modelName)`, …) come from real `@ai-sdk/*` packages. Most construct a model handle without contacting the network or requiring an API key at construction time, but some read env at construction (Azure may require `AZURE_RESOURCE_NAME` or fail; Bedrock/Vertex may probe region/project env vars). Handle this empirically — see Step 1's contingency.

## Commands you will need

| Purpose   | Command                                         | Expected on success |
| --------- | ----------------------------------------------- | ------------------- |
| Install   | `npm ci`                                        | exit 0              |
| Typecheck | `npm run typecheck`                             | exit 0              |
| Lint      | `npm run lint`                                  | exit 0, 0 warnings  |
| One file  | `npx vitest run src/llm/providers.test.ts`      | all pass            |
| All tests | `npx vitest run`                                | all pass            |
| Full gate | `npm run typecheck && npm run lint && npm test` | all exit 0          |

## Scope

**In scope** (create only):

- `src/llm/providers.test.ts`
- `src/llm/output.test.ts`
- `src/llm/prompt.test.ts`

**Out of scope** (do NOT touch):

- All production source files. If a test reveals a real bug, write the test to pin **current** behavior, and report the bug in your final summary instead of fixing it.
- `tests/unit/generate.test.ts` — leave existing coverage alone.
- Do not add a `vitest.config.ts` and do not add test scripts to `package.json`.

## Git workflow

- Branch: `advisor/003-llm-layer-unit-tests`
- Conventional commits, e.g. `test(llm): cover provider alias resolution` (history exemplar: `style(llm): apply prettier formatting`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `src/llm/providers.test.ts`

Test `resolveLanguageModel` directly (no mocking of `@ai-sdk/*` packages to start — they are already installed):

- **Error contracts** (no SDK construction involved):
  - `resolveLanguageModel('gpt-4o')` (no slash) throws `Model id must be in the format provider/model`.
  - `resolveLanguageModel('nope/whatever')` throws `Unsupported model provider: nope` (raw, un-normalized id in message).
  - `resolveLanguageModel('openai-compatible/m')` with no options/env throws the `OPENAI_COMPATIBLE_BASE_URL is required` error. Use `vi.stubEnv`/`afterEach` to guarantee `OPENAI_COMPATIBLE_BASE_URL` is unset.
- **Happy-path construction**: for ids `openai/gpt-4o`, `anthropic/claude-sonnet-4-5`, `groq/llama-3.3-70b`, assert the call returns a truthy value and does not throw.
- **Alias/id table** (the heart of this file — pins behavior for plan 004). ⚠ **Plan 008 interaction — check first**: if plan 008 (remove provider aliases) has landed (`grep -c PROVIDER_ALIASES src/llm/providers.ts` → 0), aliases are _rejected_ and three canonical ids are renamed; in that case `src/llm/providers.test.ts` will already exist with the rejection table from 008 — extend it rather than recreating, and skip the equivalence list below. Otherwise (aliases still present), for each alias pair assert both calls succeed (don't compare instances, just non-throw + truthy):
  `gemini/x` & `google/x`; `aws-bedrock/x` & `bedrock/x`; `amazon-bedrock/x`; `google-vertex/x` & `vertex/x`; `google-vertex-anthropic/x` & `vertex-anthropic/x`; `azure-openai/x` & `azure/x`; `together.ai/x` & `togetherai/x`; `xai-grok/x` & `xai/x`; `open-router/x` & `openrouter/x`; `vercel-ai-gateway/x`, `ai-gateway/x` & `gateway/x`; `gitlab-ai/x`, `gitlab-duo/x` & `gitlab/x`. Also case-insensitivity: `OpenAI/gpt-4o` succeeds.
  Drive these with `it.each` to keep the file compact.
- **openai-compatible precedence**: with `options.openaiCompatible = { baseUrl: 'https://example.test/v1', name: 'custom' }`, the call succeeds; with only `OPENAI_COMPATIBLE_BASE_URL` env stubbed, it also succeeds.
- **Contingency**: if any factory throws at construction because of missing env (likely candidates: `azure`, `bedrock`, `vertex`, `vertex-anthropic`), first try satisfying it with stubbed dummy env vars in `beforeEach` (e.g. `AZURE_RESOURCE_NAME=test`, `AWS_REGION=us-east-1`, `GOOGLE_VERTEX_PROJECT=test`, `GOOGLE_VERTEX_LOCATION=us-central1`) — dummy values never get used because no request is made. If a specific provider still cannot construct hermetically, mock just that one package with `vi.mock('@ai-sdk/<name>', () => ({ <factory>: vi.fn(() => ({})) }))` and leave a one-line comment naming why. Do not mock packages that work unmocked.

**Verify**: `npx vitest run src/llm/providers.test.ts` → all pass.

### Step 2: `src/llm/output.test.ts`

Direct tests for `validateCommitMessageOutput` and `parseCommitMessageOutput`:

- Valid object → trimmed/normalized result (`'  feat: x  '` → `'feat: x'`; `'a\r\nb'` body → `'a\nb'`).
- Rejections (assert `CommitMessageOutputError` and that the message contains the phase string): non-object (`null`, `[]`, `'str'`); missing/non-string `subject` or `body`; whitespace-only subject.
- Empty body is **accepted** (subject-only commits are legal).
- `parseCommitMessageOutput`: valid JSON → result; invalid JSON → error message contains `expected valid JSON object`; JSON that parses but fails shape (e.g. `'[1,2]'`) → object-shape error.
- Phase propagation: pass `'repair response'` and assert it appears in the thrown message.

**Verify**: `npx vitest run src/llm/output.test.ts` → all pass.

### Step 3: `src/llm/prompt.test.ts`

Use the **real** template files (no fs mocking — they live at `src/llm/prompts/*.md` and resolve via `import.meta.url`). Build a helper `baseInput(overrides)` like `generate.test.ts` does, with `style: 'conventional'`, `language: 'en'`, `includeBody: true`, `emoji: false`, `maxSubjectChars: 72`, `fileList: 'a.ts\nb.ts'`, `diffText: 'diff --git a.ts a.ts'`. Assert on stable markers, not full snapshots:

- `buildPrompt` returns non-empty `system` and `user`; `user` contains the fileList and diffText verbatim.
- `style: 'freeform'` → `user` does NOT contain a distinctive string from `src/llm/prompts/conventional.md` (open the file, pick its first heading or a unique phrase); `style: 'conventional'` → it does.
- `emoji: true` → `user` contains a distinctive string from `src/llm/prompts/gitmoji.md`; `emoji: false` → it does not.
- `includeBody: false` → `user` contains `Do not include a body`; `includeBody: true` → contains `Include a short body`.
- `buildPromptWithoutDiff` → `user` contains `(omitted for budgeting)` and not the diffText.
- Empty `fileList` → `(omitted)`; empty `diffText` with `buildPrompt` → `(empty)`.
- `language: 'fr'` and `maxSubjectChars: 50` are interpolated into `user` (assert `'fr'` and `'50'` substrings near their template context — check `src/llm/prompts/base.md` for exact phrasing before writing the assertion).

**Verify**: `npx vitest run src/llm/prompt.test.ts` → all pass.

### Step 4: Full gate

**Verify**: `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.

## Test plan

This plan _is_ the test plan (Steps 1–3). Structural pattern: `tests/unit/generate.test.ts` for helpers/cleanup discipline; `src/llm/truncate.test.ts` for colocated pure-function style. Expected new test count: roughly 35–50 cases across three files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Files `src/llm/providers.test.ts`, `src/llm/output.test.ts`, `src/llm/prompt.test.ts` exist
- [ ] `npx vitest run` exits 0 with all three new files listed as passed
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `git status` shows only the three new test files (plus `plans/README.md`)
- [ ] No production `src/**/*.ts` (non-test) file modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- More than three provider factories cannot be constructed hermetically even with dummy env vars and single-package mocks — the test design needs rethinking, not more mocks.
- Any test reveals an alias that does NOT resolve (e.g. an alias listed in README but absent from `PROVIDER_ALIASES`) — pin actual behavior with the test, and report the discrepancy; do not edit `providers.ts`.
- Template marker assertions are impossible because `base.md` lacks stable phrasing — report which assertion, with the template's actual content.

## Maintenance notes

- Plan 004 (lazy provider loading) will change `resolveLanguageModel` to async; these tests are written sync — plan 004 includes updating them to `await`. That is expected churn, not a defect.
- The alias `it.each` table in `providers.test.ts` is the contract for README's "Provider Aliases" section; if a new provider is added, extend both.
- Known divergence (out of scope here): `src/auth/secrets.ts` keeps its own provider-alias list (`providerIds`, lines 13–151) which includes `grok` — an alias `providers.ts` does NOT support. Tests here will document `grok/x` as unsupported. **Plan 008 removes all provider aliases outright** — see its annotations; recommended execution order is 008 before this plan.
