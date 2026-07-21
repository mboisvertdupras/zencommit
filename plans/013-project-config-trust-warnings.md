# Plan 013: Warn when repo-supplied config redirects prompts and credentials to a custom endpoint

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/config/load.ts src/commands/default.ts src/config/load.test.ts tests/integration/cli-behavior.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none, but do NOT run concurrently with plan 001 (it also
  edits `src/commands/default.ts`) or plan 002 (shared
  `tests/integration/` surface is fine, but avoid same-time index updates).
- **Category**: security
- **Planned at**: commit `cd2908e`, 2026-07-21

## Why this matters

zencommit merges `zencommit.json` from the repository root into its config.
A repository is not the user — cloning and running `zencommit` inside a repo
whose config sets `ai.model` to an `openai-compatible/*` model and
`ai.openaiCompatible.baseUrl` to a third-party endpoint sends the user's
diff, and the `OPENAI_COMPATIBLE_API_KEY` credential if one is configured, to
that endpoint with no indication anything unusual happened. The maintainer's
recorded policy (see `plans/README.md` backlog) is that trusting project
config is standard tool behavior — so the remediation is **visibility, not
blocking**: a one-line stderr notice whenever repo-supplied (or inline
env-supplied) config selects a custom endpoint, plus a cleartext-transport
notice for non-loopback `http:` endpoints. No behavior is blocked; no
request is prevented.

## Current state

- `src/config/load.ts` — sources are loaded in precedence order and merged;
  `ConfigSourceName = 'global' | 'custom' | 'project' | 'inline'`.
  `'project'` is `<repoRoot>/zencommit.json` (repo-controlled); `'inline'` is
  `$ZENCOMMIT_CONFIG_CONTENT`. The merge (lines 134-141):

  ```ts
  export const resolveConfig = async (repoRoot: string | null): Promise<ResolvedConfig> => {
    const sources = await loadConfigSources(repoRoot);
    return sources.reduce<ResolvedConfig>(
      (config, source) =>
        deepMerge<ResolvedConfig>(config, source.data as DeepPartial<ResolvedConfig>),
      defaultConfig,
    );
  };
  ```

  `resolveConfigWithSources` (lines 143-159) duplicates the loop to also
  build a top-level-key → source map.

- `src/commands/default.ts:55-62` — the default command loads config through
  one of two paths depending on verbosity:

  ```ts
  let config: ResolvedConfig;
  if (getVerbosity() >= 1) {
    const resolved = await resolveConfigWithSources(repoRoot);
    config = resolved.config;
    logJson(1, 'config sources', resolved.sourceMap);
  } else {
    config = await resolveConfig(repoRoot);
  }
  ```

- The custom endpoint is honored in `src/llm/providers.ts:87-95`: for
  `openai-compatible/*` models, `config.ai.openaiCompatible.baseUrl` (or
  `OPENAI_COMPATIBLE_BASE_URL`) becomes the request base URL and
  `OPENAI_COMPATIBLE_API_KEY` is attached. (`providers.ts` is OUT of scope
  here — plans 004/008 own it; the warning lives at the command layer.)

- Existing stderr conventions in `default.ts`: `console.warn(...)` for
  advisory notices (e.g. line 122
  `console.warn('Model metadata not found. Using conservative token limits.')`).

- Test surfaces:
  - `src/config/load.test.ts` — colocated unit tests for the loader
    (pattern: `withTempDir`, `process.env` save/restore in `afterEach`).
  - `tests/integration/cli-behavior.test.ts` — spawns the built CLI with
    `ZENCOMMIT_CONFIG_CONTENT` + `ZENCOMMIT_MOCK_RESPONSE`; note one test
    asserts `expect(normalizeOutput(result.stderr)).toBe('')` for a dry run
    whose inline config does NOT use openai-compatible — the warning must
    therefore fire only on the conditions below, or that test breaks.

**Warning conditions (exact, to keep noise at zero for normal use):**

1. A `'project'` or `'inline'` source's raw data contains
   `ai.openaiCompatible.baseUrl`, OR contains an `ai.model` string starting
   with `openai-compatible/`.
2. Independently of source: the merged `config.ai.openaiCompatible?.baseUrl`
   parses as a URL with protocol `http:` whose hostname is not loopback
   (`localhost`, `127.0.0.1`, `::1`, `[::1]`) — cleartext-transport notice.

Global config and `$ZENCOMMIT_CONFIG` (both user-controlled machine state)
never trigger condition 1.

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Lint      | `npm run lint`      | exit 0              |
| Tests     | `npm test`          | all pass            |

(`npm ci` first if `node_modules/` is missing.)

## Scope

**In scope** (the only files you may modify):

- `src/config/load.ts`
- `src/commands/default.ts`
- `src/config/load.test.ts` (extend)
- `tests/integration/cli-behavior.test.ts` (extend)

**Out of scope** (do NOT touch, even though they look related):

- `src/llm/providers.ts` — owned by plans 004/008; no validation there.
- `src/config/validate.ts` — validation can't see per-source origin; the
  check belongs where sources are still distinct.
- Blocking, prompting, or trust-store ("allow this repo once") mechanics —
  explicitly deferred; this plan only informs.
- `zencommit config print/validate` commands — advisory noise there helps
  nobody; the warning fires on the commit-generation path only.

## Git workflow

- Branch: `advisor/013-project-config-trust-warnings`
- Conventional commits, e.g. `feat(security): warn when repo config selects a custom endpoint`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract shared merge + add the override scanner in `load.ts`

- Extract the reduce into an exported pure helper and delegate:

  ```ts
  export const mergeConfigSources = (sources: ConfigSource[]): ResolvedConfig =>
    sources.reduce<ResolvedConfig>(
      (config, source) =>
        deepMerge<ResolvedConfig>(config, source.data as DeepPartial<ResolvedConfig>),
      defaultConfig,
    );
  ```

  `resolveConfig` becomes `mergeConfigSources(await loadConfigSources(repoRoot))`.
  Leave `resolveConfigWithSources` working as-is (refactor internally to use
  the helper only if it stays behavior-identical).

- Add the scanner (pure, unit-testable):

  ```ts
  export interface SensitiveOverride {
    path: 'ai.model' | 'ai.openaiCompatible.baseUrl';
    source: ConfigSourceName;
  }

  export const findSensitiveOverrides = (sources: ConfigSource[]): SensitiveOverride[] => { ... };
  ```

  Implementation: for each source with `name` `'project'` or `'inline'`,
  inspect `source.data` (an untyped object — access defensively with the
  same `isConfigObject`-style guards used elsewhere in the file): record
  `ai.openaiCompatible.baseUrl` if present; record `ai.model` only if it is
  a string starting with `openai-compatible/`.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass (pure
refactor so far, nothing user-visible).

### Step 2: Emit the notices in `default.ts`

Replace the dual load path (lines 55-62) with a single
`loadConfigSources` call:

```ts
const sources = await loadConfigSources(repoRoot);
let config: ResolvedConfig = mergeConfigSources(sources);
if (getVerbosity() >= 1) {
  logJson(1, 'config sources', buildSourceMapFromSources(sources));
}
```

where the verbose source map keeps its exact current shape (top-level key →
source name). Either export a small `buildSourceMap(sources)` helper from
`load.ts` (extracted from `resolveConfigWithSources`) or keep calling
`resolveConfigWithSources` at verbosity ≥ 1 — choose the helper; double
file-reads at verbose level are avoidable for free.

Then, immediately after the `validateConfig` block (after line 73), emit:

- For each `findSensitiveOverrides(sources)` entry:
  `console.warn(\`Warning: ${path} is set by ${source} config; prompts and OPENAI_COMPATIBLE_API_KEY (if set) will be sent to that endpoint.\`)`
  where `source` renders as `project (zencommit.json)` or
  `inline (ZENCOMMIT_CONFIG_CONTENT)`.
- Condition 2 (cleartext): if the merged
  `config.ai.openaiCompatible?.baseUrl` is `http:` to a non-loopback host
  (use `new URL(...)` in a try/catch; unparseable → skip, the provider layer
  will error properly later):
  `console.warn('Warning: ai.openaiCompatible.baseUrl uses http:; credentials and diffs will be sent unencrypted.')`

Warnings go to stderr via `console.warn`, before the spinner starts, so they
are visible in both interactive and `--yes` runs.

**Verify**: `npm run typecheck` → exit 0, then manual smoke:
`npm run build && cd "$(mktemp -d)" && git init -q . && echo x > f && git add f && ZENCOMMIT_CONFIG_CONTENT='{"ai":{"model":"openai-compatible/foo","openaiCompatible":{"baseUrl":"http://example.com/v1"}}}' ZENCOMMIT_MOCK_RESPONSE='{"subject":"feat: x","body":""}' node <repo>/dist/index.js --dry-run --yes`
→ stderr contains both warnings, exit 0.

### Step 3: Unit tests for the scanner

Extend `src/config/load.test.ts` (match its existing style):

1. Project source with `ai.openaiCompatible.baseUrl` → one override,
   `source: 'project'`.
2. Inline source with `ai.model: 'openai-compatible/x'` → one override,
   `source: 'inline'`.
3. Global source with both fields → empty result.
4. Project source with `ai.model: 'openai/gpt-5'` → empty result (trusted
   provider ids don't warn).
5. Malformed shapes (`ai` not an object, `openaiCompatible: null`) → empty
   result, no throw.

**Verify**: `npm test` → all pass.

### Step 4: Integration tests for the emitted warnings

Extend `tests/integration/cli-behavior.test.ts` following the dry-run
pattern already in the file (temp repo + `ZENCOMMIT_CONFIG_CONTENT` +
`ZENCOMMIT_MOCK_RESPONSE` + `--dry-run --yes`):

1. Inline config selecting `openai-compatible/mock` with an `https:` baseUrl
   → exit 0, stderr contains `is set by inline`, stdout still contains the
   mock subject.
2. The same with an `http://203.0.113.5/v1` baseUrl → stderr additionally
   contains `unencrypted`.
3. Confirm the existing `'…dry-run…'` test asserting empty stderr still
   passes untouched (its config doesn't hit any condition).

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

Steps 3–4 are the test plan (unit: scanner truth table; integration:
end-to-end stderr contract). Patterns: existing tests in the same two files.
Full gate: `npm test` → all pass with zero edits to existing assertions.

## Done criteria

- [ ] `findSensitiveOverrides` exported from `src/config/load.ts` with the 5 unit cases passing
- [ ] Both warnings emitted from `src/commands/default.ts` on the conditions above, never otherwise
- [ ] The pre-existing empty-stderr dry-run integration test passes unmodified
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all exit 0
- [ ] `git status` shows only in-scope files (plus `plans/README.md`) changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 001 is IN PROGRESS (check `plans/README.md`) — shared-file conflict on
  `src/commands/default.ts`.
- The existing empty-stderr integration test fails — the warning conditions
  are too broad; report rather than widening the test.
- Preserving the verbose `config sources` output shape via a helper turns out
  to require changing `resolveConfigWithSources`'s public behavior (the
  `config print` command depends on it — `tests/integration` will catch it).

## Maintenance notes

- This is deliberately warn-only. If users report notice fatigue for
  legitimate project-level `openai-compatible` setups, the follow-up is a
  suppression mechanism (e.g. a global-config allowlist of repo paths) — a
  maintainer decision, out of scope here.
- Plans 004/008 rewrite `providers.ts`; nothing here touches it, but a future
  hardening pass could move condition 2 (cleartext check) next to the
  `createOpenAICompatible` call so the `OPENAI_COMPATIBLE_BASE_URL` env path
  is covered too — deferred to avoid file contention.
- Reviewer: scrutinize `findSensitiveOverrides`'s defensive access — raw
  source data is unvalidated JSON.
