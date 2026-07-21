# Plan 008: Remove provider aliases — one canonical id per provider, aligned with models.dev

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/llm/providers.ts src/auth/secrets.ts README.md tests/unit/secrets.test.ts src/llm/providers.test.ts`
> If `src/llm/providers.ts` or `src/auth/secrets.ts` changed since this plan
> was written, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition — with two
> expected exceptions: (a) `src/llm/providers.test.ts` appearing is plan 003's
> work, not drift; (b) if plan 004 (lazy loading) already landed, the factory
> table entries are `async (m) => (await import(...))...` instead of direct
> calls — that is expected; this plan's key renames and alias deletions apply
> identically to the lazy form.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (breaking change to accepted model-id strings)
- **Depends on**: none (see "Interaction with plans 003/004" below for ordering)
- **Category**: tech-debt
- **Planned at**: commit `cd2908e`, 2026-06-10 (promoted from the plans/README.md backlog item "Provider alias registry divergence"; approach changed by maintainer decision from *consolidate the registries* to *remove aliases entirely*)

## Why this matters

zencommit accepts each provider under up to four names, maintained in two independent alias tables that disagree with each other and with the metadata source. `src/llm/providers.ts` maps 17 aliases for model resolution; `src/auth/secrets.ts` keeps its own `providerIds` alias lists for auth (including `grok`, which providers.ts does not accept); and the metadata layer does exact-id matching against models.dev with **no** aliasing — so today `gemini/x` resolves a provider and auth but silently misses metadata and degrades to conservative 8k token limits, while `amazon-bedrock/x` gets metadata that canonical `bedrock/x` doesn't. The maintainer's decision: aliases are an anti-pattern — remove them. One name per provider, and that name is **models.dev's id** where they differ, so the single surviving name works in all three places (provider resolution, auth, metadata) with zero mapping tables. A bonus consistency win: ids shown by `zencommit models search` (which are models.dev ids) become directly usable as `--model` values.

This is a **breaking change** for users whose configs use an alias or one of the three renamed short ids. The package is 0.x; mark the commit as breaking (see Git workflow).

## Current state

### The canonical-id decision (maintainer-approved)

Three canonical ids are **renamed** to models.dev's ids (verified against the models.dev dataset: `amazon-bedrock`, `google-vertex`, `google-vertex-anthropic` all exist as provider keys there; short `bedrock`/`vertex` do not):

| Old canonical | New canonical | models.dev metadata |
|---|---|---|
| `bedrock` | `amazon-bedrock` | now matches |
| `vertex` | `google-vertex` | now matches |
| `vertex-anthropic` | `google-vertex-anthropic` | now matches |

All other canonical ids stay as-is (`openai`, `anthropic`, `google`, `xai`, `vercel`, `azure`, `groq`, `deepinfra`, `mistral`, `togetherai`, `cohere`, `cerebras`, `perplexity`, `gateway`, `openrouter`, `gitlab`, `openai-compatible`) — each already matches its models.dev key, except `gateway` and `openai-compatible`, which have no models.dev entry by nature (meta-providers) and keep their existing conservative-limits behavior.

Two distinct kinds of spelling stop working — keep them straight (the success/rejection test tables in Step 3 mirror this split):

- **Renamed canonical ids** (3): `bedrock`, `vertex`, `vertex-anthropic` — rejected after this plan because the canonical key itself changed (use the new name from the table above).
- **Deleted alias spellings** (13): `azure-openai`, `aws-bedrock`, `google-vertex-ai`, `google-generative-ai`, `gemini`, `open-router`, `gitlab-ai`, `gitlab-duo`, `together.ai`, `xai-grok`, `vercel-ai-gateway`, `ai-gateway`, plus secrets.ts-only `grok` — rejected because aliasing is removed.

(`amazon-bedrock`, `google-vertex`, `google-vertex-anthropic` appear in today's alias table too — they stop being *aliases* and become the *canonical* names, so they are **accepted** post-change and belong in the success tests, never the rejection tests.)

### `src/llm/providers.ts` (102 lines)

- Lines 23–43 — `PROVIDER_FACTORIES`: keys include `bedrock: (modelName) => bedrock(modelName)`, `vertex: (modelName) => vertex(modelName)`, `'vertex-anthropic': (modelName) => vertexAnthropic(modelName)` (the import names `bedrock`/`vertex`/`vertexAnthropic` from `@ai-sdk/amazon-bedrock`, `@ai-sdk/google-vertex`, `@ai-sdk/google-vertex/anthropic` stay — only the *keys* change).
- Lines 45–65 — `PROVIDER_ALIASES: Record<string, string>` (19 entries, 4 of which are no-op identity self-mappings: `'vertex-anthropic'`, `'openai-compatible'`, `openrouter`, `gitlab`). **Delete whole table.**
- Lines 67–68:

```ts
const normalizeProviderId = (provider: string): string =>
  PROVIDER_ALIASES[provider.toLowerCase()] ?? provider.toLowerCase();
```

- Lines 77–102 — `resolveLanguageModel`: splits on `/`, calls `normalizeProviderId(rawProvider)` (line 86), special-cases `provider === 'openai-compatible'` (lines 87–96), then factory lookup; unknown provider throws `` `Unsupported model provider: ${rawProvider}` `` (line 99).

### `src/auth/secrets.ts` (425 lines)

- Line 10 — `providerIds?: string[];` on `ProviderAuthConfig`. **Delete field.**
- `PROVIDER_AUTH_CONFIGS` (lines 13–151) — ten entries carry `providerIds` alias arrays (lines 33, 40, 47, 54, 67, 74, 86, 111, 136, 149). **Delete all ten arrays.** Three entries also need their `id` renamed: `id: 'vertex'` (line 36) → `'google-vertex'`, `id: 'vertex-anthropic'` (line 43) → `'google-vertex-anthropic'`, `id: 'bedrock'` (line 77) → `'amazon-bedrock'`.
- Lines 370–375:

```ts
const PROVIDER_AUTH_INDEX: Map<string, ProviderAuthConfig> = new Map(
  PROVIDER_AUTH_CONFIGS.flatMap((config) => {
    const aliases = config.providerIds ?? [];
    return [config.id, ...aliases].map((id) => [id.toLowerCase(), config]);
  }),
);
```

- Lines 153–155 — `ENV_KEY_ALIASES` maps `GOOGLE_GENERATIVE_AI_API_KEY` → `['GEMINI_API_KEY']`. **This is NOT a provider alias** — it is an env-var fallback (Google's own tooling sets `GEMINI_API_KEY`), documented in README's env table. **Keep it; out of scope.**

### Docs and tests

- `README.md:298-300` — provider-table rows for `bedrock/<model>`, `vertex/<model>`, `vertex-anthropic/<model>`.
- `README.md:315-327` — the "### Provider Aliases" section (heading through the trailing blank line). **Delete whole section.** Line numbers in this plan are as of `cd2908e` — locate by heading/row text if they have shifted.
- Verified at plan time: **no test, no config default, and no other source file references any alias form or the three short ids** (`grep -rn "bedrock\|vertex" src tests --include='*.ts'` hits only `providers.ts` and `secrets.ts`; the default model is `openai/gpt-5`). Test churn is confined to files this plan touches/creates.
- `tests/unit/secrets.test.ts` exists (injectable-store pattern) — extend it; `src/llm/providers.test.ts` exists **only if plan 003 ran first** (check at execution time).

### Conventions

TypeScript ESM strict, arrow-function exports, Prettier + oxlint zero warnings, conventional commits.

## Interaction with plans 003/004

- **Recommended order: 008 before 003** — then 003's tests pin the post-alias world directly (003 Step 1 has been annotated accordingly). If 003 already ran, update its alias-equivalence table per Step 3 below instead of creating a new file.
- **004 (lazy loading)** can run before or after 008; both orders are annotated in each plan's drift check. The two plans touch different aspects of the same table (004: values become lazy; 008: keys renamed, aliases deleted).

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `npm ci`                                             | exit 0              |
| Typecheck | `npm run typecheck`                                  | exit 0              |
| Lint      | `npm run lint`                                       | exit 0, 0 warnings  |
| Tests     | `npx vitest run`                                     | all pass            |
| Full gate | `npm run typecheck && npm run lint && npm run format:check && npm test` | all exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `src/llm/providers.ts`
- `src/auth/secrets.ts`
- `src/llm/providers.test.ts` (create if absent, update if plan 003 already created it)
- `tests/unit/secrets.test.ts` (extend)
- `README.md` (provider table + alias section)

**Out of scope** (do NOT touch, even though they look related):
- `ENV_KEY_ALIASES` / `GEMINI_API_KEY` env fallback in `src/auth/secrets.ts:153-155` and its README env-table row — env-var fallback, not a provider alias.
- `src/metadata/**` — exact-id matching is now the *correct* behavior everywhere; nothing to change.
- `src/commands/models.ts` — already operates on models.dev ids; benefits automatically.
- Case sensitivity: **keep** the existing `.toLowerCase()` folding in both lookup paths — case folding is normalization, not aliasing, and removing it would break differently-cased configs for no clarity gain.
- `package.json` version field / changelog — release mechanics are the maintainer's (but see Git workflow for the breaking-change marker).

## Git workflow

- Branch: `advisor/008-remove-provider-aliases`
- This is a breaking change — use the conventional-commits breaking marker, e.g.:
  `refactor(providers)!: remove provider aliases; align canonical ids with models.dev`
  with a `BREAKING CHANGE:` footer listing every removed spelling and its replacement (use the mapping table from "Current state").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm the alias surface is still exactly two files

`grep -rn "PROVIDER_ALIASES\|providerIds\|normalizeProviderId" src tests index.ts --include='*.ts' | grep -v 'src/llm/providers.ts\|src/auth/secrets.ts\|providers.test.ts'`

**Verify**: no output. Any hit means an alias table or consumer appeared somewhere new after `cd2908e` — that is a STOP condition (the removal must be total).

### Step 1: Strip aliases from `src/llm/providers.ts`

1. Rename three `PROVIDER_FACTORIES` keys: `bedrock` → `'amazon-bedrock'` (currently unquoted; the new hyphenated key must be quoted), `vertex` → `'google-vertex'` (same), `'vertex-anthropic'` → `'google-vertex-anthropic'` (already quoted; stays quoted). Simple-identifier keys (`openai`, `groq`, …) stay unquoted. The right-hand sides (the `bedrock`/`vertex`/`vertexAnthropic` factory calls and their imports) are unchanged — those are TypeScript identifiers, not provider ids.
2. Delete `PROVIDER_ALIASES` (lines 45–65) and `normalizeProviderId` (lines 67–68).
3. In `resolveLanguageModel`, replace line 86 with `const provider = rawProvider.toLowerCase();`.
4. Make the unknown-provider error self-documenting (replaces the discoverability aliases provided). Above the factory table add:

```ts
const SUPPORTED_PROVIDERS = (): string =>
  [...Object.keys(PROVIDER_FACTORIES), 'openai-compatible'].sort().join(', ');
```

and change the throw at line 98–100 to:

```ts
throw new Error(
  `Unsupported model provider: ${rawProvider}. Supported providers: ${SUPPORTED_PROVIDERS()}`,
);
```

**Verify**: `npm run typecheck` → exit 0; `grep -c 'PROVIDER_ALIASES\|normalizeProviderId' src/llm/providers.ts` → 0.

### Step 2: Strip aliases from `src/auth/secrets.ts`

Do these in order (1 before 3, so the index is never built from stale ids):

1. Rename the three `id` values FIRST: line 36 `id: 'vertex'` → `id: 'google-vertex'`, line 43 `id: 'vertex-anthropic'` → `id: 'google-vertex-anthropic'`, line 77 `id: 'bedrock'` → `id: 'amazon-bedrock'`. These must be byte-identical to the Step 1 factory keys. Leave `name`, `envKeys`, `required`, `primaryEnvKey` untouched on every entry.
2. Delete `providerIds?: string[];` from `ProviderAuthConfig` (line 10) and all ten `providerIds:` arrays from `PROVIDER_AUTH_CONFIGS` (at lines 33, 40, 47, 54, 67, 74, 86, 111, 136, 149 — entries: google, vertex, vertex-anthropic, xai, gateway, azure, bedrock, togetherai, openrouter, gitlab).
3. Simplify the index (lines 370–375) to:

```ts
const PROVIDER_AUTH_INDEX: Map<string, ProviderAuthConfig> = new Map(
  PROVIDER_AUTH_CONFIGS.map((config) => [config.id, config]),
);
```

(`resolveProviderAuth` keeps its `.toLowerCase()` at line 384, and every `config.id` is already lowercase.)

**Verify**:
- `npm run typecheck` → exit 0
- `grep -n 'providerIds' src/auth/secrets.ts` → no output
- `grep -n "id: 'bedrock'\|id: 'vertex'\|id: 'vertex-anthropic'" src/auth/secrets.ts` → no output; `grep -c "id: '" src/auth/secrets.ts` → 20 (same count as before — renames, not deletions)
- `npx vitest run tests/unit/secrets.test.ts` → all pass (existing tests use canonical ids only — if any fails on an alias, STOP: the recon claim was wrong)

### Step 3: Tests

First determine the branch: `test -f src/llm/providers.test.ts && echo exists || echo absent`

- **exists** (plan 003 ran first): rework its alias/id table — the spellings below assert **rejection**, the renamed canonical ids move to the success cases. Keep 003's other coverage (error contracts, openai-compatible, case folding) intact.
- **absent**: create `src/llm/providers.test.ts` (colocated next to `src/llm/providers.ts`, matching the style of `src/llm/tokens.test.ts`) — plan 003 will extend it later.

Either way, the file must cover (one `describe`, three `it.each`-driven groups):

1. **Success — canonical ids** (includes the three renames): `resolveLanguageModel('amazon-bedrock/anthropic.claude-3-5-sonnet')`, `('google-vertex/gemini-2.0-flash')`, `('google-vertex-anthropic/claude-sonnet-4-20250514')`, `('openai/gpt-4o')` succeed (truthy, no throw). If a factory throws at construction for missing env, first stub dummy env vars in `beforeEach` (`AWS_REGION=us-east-1`, `GOOGLE_VERTEX_PROJECT=test`, `GOOGLE_VERTEX_LOCATION=us-central1`, `AZURE_RESOURCE_NAME=test`); if one still can't construct hermetically, mock that single package with `vi.mock` and a one-line comment.
2. **Rejection — old canonical ids (renamed)**: `it.each(['bedrock', 'vertex', 'vertex-anthropic'])` → `resolveLanguageModel(\`${p}/m\`)` throws with message containing both `Unsupported model provider: ${p}` and `Supported providers:`.
3. **Rejection — deleted alias spellings**: `it.each(['aws-bedrock', 'google-vertex-ai', 'gemini', 'google-generative-ai', 'azure-openai', 'together.ai', 'xai-grok', 'grok', 'open-router', 'vercel-ai-gateway', 'ai-gateway', 'gitlab-ai', 'gitlab-duo'])` → same assertion as group 2.
4. **Case folding survives**: `'OpenAI/gpt-4o'` and `'Amazon-Bedrock/m'` succeed.

Also extend `tests/unit/secrets.test.ts` with: `resolveProviderAuth('amazon-bedrock/some-model')` returns the config whose `name` is `'Amazon Bedrock'` (renamed canonical id); `resolveProviderAuth('bedrock/some-model')` returns `null` (old canonical id); `resolveProviderAuth('gemini/some-model')` returns `null` (deleted alias). (`resolveProviderAuth` is exported from `src/auth/secrets.ts:379`.)

Note: if plan 004 already landed, `resolveLanguageModel` is async — use `await expect(...).rejects.toThrow(...)` / `.resolves` forms accordingly.

**Verify**: `npx vitest run src/llm/providers.test.ts tests/unit/secrets.test.ts` → all pass.

### Step 4: README

1. Update the Supported Providers table rows (lines 298–300):
   - `| AWS Bedrock | \`amazon-bedrock/<model>\` | \`amazon-bedrock/anthropic.claude-3-5-sonnet\` |`
   - `| Google Vertex | \`google-vertex/<model>\` | \`google-vertex/gemini-2.0-flash\` |`
   - `| Vertex Anthropic | \`google-vertex-anthropic/<model>\` | \`google-vertex-anthropic/claude-sonnet-4-20250514\` |`
2. Delete the entire `### Provider Aliases` section (lines 315–326, heading through the last alias bullet).
3. In its place add a short `### Migration note` (3–4 lines): provider ids now have exactly one accepted spelling, matching models.dev ids; list the three renames (`bedrock`→`amazon-bedrock`, `vertex`→`google-vertex`, `vertex-anthropic`→`google-vertex-anthropic`) and state that former aliases (e.g. `gemini`, `aws-bedrock`, `open-router`) are rejected with an error listing supported providers. Mention that ids from `zencommit models search` are now always valid `--model` values.

**Verify**: `grep -c 'Provider Aliases' README.md` → 0; `grep -n 'amazon-bedrock/<model>' README.md` → 1 match; `npm run format:check` → exit 0 (Prettier checks markdown).

### Step 5: Full gate and smoke

**Verify**:
- `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.
- `npm run build && node dist/index.js --model gemini/gemini-2.5-pro --dry-run; echo "exit=$?"` — **either outcome below is acceptable; neither is a failure**:
  - a diff is staged → stderr contains `Unsupported model provider: gemini. Supported providers: …` and exit is `4`;
  - nothing is staged → exit `3` ("No diff to summarize" — the run never reaches provider resolution); in that case the provider error path is already proven by `npx vitest run src/llm/providers.test.ts`, just note in your report which outcome you observed.

## Test plan

Covered in Step 3: ~6 success cases (renamed + unchanged canonical ids, case folding), 16 rejection cases (one per removed spelling, via `it.each`), 3 auth-resolution cases. Pattern files: `src/llm/tokens.test.ts` (colocated style), `tests/unit/secrets.test.ts` (existing auth tests).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c 'PROVIDER_ALIASES\|normalizeProviderId' src/llm/providers.ts` → 0
- [ ] `grep -c 'providerIds' src/auth/secrets.ts` → 0
- [ ] `grep -rn "'bedrock'\|'vertex'\|'vertex-anthropic'" src/llm/providers.ts src/auth/secrets.ts` → no matches. (This checks *quoted string* ids only — the unquoted TypeScript identifiers `bedrock`/`vertex`/`vertexAnthropic` in imports and factory bodies are correct and will not match; the new `'google-vertex'`/`'amazon-bedrock'` strings will not false-positive because the quote character precedes `google-`/`amazon-`, not `vertex`/`bedrock`.)
- [ ] Positive presence of the renamed keys: `grep -c "'amazon-bedrock':" src/llm/providers.ts` → 1; `grep -c "'google-vertex':" src/llm/providers.ts` → 1; `grep -c "'google-vertex-anthropic':" src/llm/providers.ts` → 1; `grep -c "id: 'amazon-bedrock'\|id: 'google-vertex'\|id: 'google-vertex-anthropic'" src/auth/secrets.ts` → 3
- [ ] `grep -c 'Provider Aliases' README.md` → 0
- [ ] `grep -c 'GEMINI_API_KEY' src/auth/secrets.ts` → unchanged from before (env-key alias preserved)
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0; `npm test` exits 0 with the new rejection/success cases passing
- [ ] Commit message carries the `!`/`BREAKING CHANGE:` marker with the removed→replacement mapping
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any existing test fails because it used an alias spelling or a short id (`bedrock`/`vertex`) — recon found none; a hit means the codebase drifted, so report before rewriting tests.
- The `@ai-sdk/google-vertex/anthropic` or `@ai-sdk/amazon-bedrock` factory cannot construct hermetically even with dummy env stubs and a single-package mock (same contingency budget as plan 003: more than three mocked packages means the approach needs rethinking).
- You find any *additional* alias table or provider-id mapping beyond the two documented here (e.g. introduced after `cd2908e`) — the removal must be total or not at all; report the location.
- `README.md` lines have shifted so much that the table/section edits in Step 4 don't clearly map — re-locate by heading text, and STOP only if the "Provider Aliases" section is already gone or materially different.

## Maintenance notes

- **Naming rule going forward** (worth adding to AGENTS.md in a future docs pass): a provider's id is models.dev's provider key, spelled exactly one way; adding a provider means one factory entry, one auth entry with the same `id`, one README row — no aliases.
- Reviewer should scrutinize: the three renamed `id`s in `secrets.ts` against the factory keys in `providers.ts` (they must be byte-identical — a typo splits auth from resolution again, the exact bug class this plan removes); and that the `BREAKING CHANGE` footer's mapping table is complete (3 renamed canonical ids + 13 deleted alias spellings = 16 rejected spellings, each with its replacement or "use canonical id X").
- Release note for the maintainer: this warrants a minor version bump (0.x breaking convention) and a changelog entry; users see a clear, self-documenting error rather than silent misbehavior, which is the intended trade.
- Plans 003 and 004 have been annotated for ordering interactions with this plan; if you executed this plan, also re-read those annotations before running either.
