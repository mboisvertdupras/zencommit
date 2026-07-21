# Plan 011: Enforce numeric ranges in validateConfig (temperature, cacheTtlHours)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/config/validate.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but do NOT run concurrently with plans 005, 008, or 009 — they also edit `README.md`)
- **Category**: bug
- **Planned at**: commit `cd2908e`, 2026-07-21

## Why this matters

`validateConfig` exists to fail fast with a clear message (exit 2) before any
network call, but two numeric fields accept nonsense: `ai.temperature` passes
for `-5` or `100` (the provider then rejects the request with an opaque SDK
error, classified as exit 4), and `cacheTtlHours` accepts negatives (silently
meaning "cache never fresh", so every run refetches models.dev). Range checks
turn both into the actionable exit-2 config errors the validator was built
for.

## Current state

- `src/config/validate.ts:37-39` — type check only, no range:

  ```ts
  if (!isNumber(config.ai.temperature)) {
    addError(errors, 'ai.temperature', 'Temperature must be a number.');
  }
  ```

- `src/config/validate.ts:124-130` — same:

  ```ts
  if (!isNumber(config.metadata.providers.modelsdev.cacheTtlHours)) {
    addError(
      errors,
      'metadata.providers.modelsdev.cacheTtlHours',
      'cacheTtlHours must be a number.',
    );
  }
  ```

- `isNumber` (line 19-20) already rejects `NaN`. `Infinity` passes it —
  the range checks below must also exclude it.
- `src/metadata/cache.ts:22-28` — `isCacheFresh` treats non-finite TTL as
  stale and negative TTL as always-stale; `0` legitimately means "never use
  disk cache". So the valid range is `>= 0` and finite.
- `README.md:256` documents `temperature` as `Sampling temperature (0-1)`,
  but OpenAI-compatible providers accept up to 2. Chosen bound: **0–2
  inclusive** (superset of what major providers accept; Anthropic-bound
  configs above 1 will get the provider's own error, which is acceptable),
  and the README row is updated to match.
- Defaults (`src/config/types.ts`): `temperature: 0.2`,
  `cacheTtlHours: 24` — both inside the new ranges, so no default breaks.
- Validation is invoked at `src/commands/default.ts:66` and
  `src/commands/config.ts:51` (`config validate`); both print each
  `- path: message` line and exit 2 on failure.
- Repo conventions: the validator is hand-rolled on purpose (a Zod migration
  was explicitly rejected — see `plans/README.md` "considered and rejected").
  Match the existing `addError(errors, 'path', 'Message.')` style exactly.
- Test convention for this directory: colocated files —
  `src/config/merge.test.ts` is the structural pattern
  (`import { describe, expect, it } from 'vitest'` + plain assertions).

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Lint      | `npm run lint`      | exit 0              |
| Tests     | `npm test`          | all pass            |

(`npm ci` first if `node_modules/` is missing.)

## Scope

**In scope** (the only files you may modify/create):

- `src/config/validate.ts`
- `src/config/validate.test.ts` (create)
- `README.md` (one table row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/metadata/cache.ts` — `isCacheFresh` already handles bad TTLs
  defensively; keep that belt-and-suspenders.
- Any other validator field (`maxFiles`, `fallbackOrder` element types,
  `baseUrl` format, …) — not part of this finding.
- `src/config/types.ts` defaults.

## Git workflow

- Branch: `advisor/011-validate-config-ranges`
- Conventional commits, e.g. `fix(config): enforce temperature and cacheTtlHours ranges`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the range checks

In `src/config/validate.ts`:

- Temperature (replace the existing check):

  ```ts
  if (!isNumber(config.ai.temperature) || config.ai.temperature < 0 || config.ai.temperature > 2) {
    addError(errors, 'ai.temperature', 'Temperature must be a number between 0 and 2.');
  }
  ```

- cacheTtlHours (replace the existing check): require
  `isNumber(...) && Number.isFinite(...) && value >= 0`, message
  `'cacheTtlHours must be a non-negative number.'`.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Create `src/config/validate.test.ts`

Model after `src/config/merge.test.ts`. Build a valid base from the exported
`defaultConfig` (`import { defaultConfig } from './types.js'`) using
`structuredClone`, mutate one field per case. Cases to cover:

1. `validateConfig(structuredClone(defaultConfig))` → `valid: true`, zero errors.
2. `temperature: -0.1` → invalid, error path `ai.temperature`.
3. `temperature: 2.1` → invalid, error path `ai.temperature`.
4. `temperature: 2` and `temperature: 0` → valid (inclusive bounds).
5. `cacheTtlHours: -1` → invalid, error path `metadata.providers.modelsdev.cacheTtlHours`.
6. `cacheTtlHours: 0` → valid.
7. `cacheTtlHours: Number.POSITIVE_INFINITY` → invalid.

**Verify**: `npm test` → all pass, including the 7 new cases.

### Step 3: Update the README temperature row

`README.md:256`: change `Sampling temperature (0-1)` to
`Sampling temperature (0-2, provider-dependent)`. Touch nothing else in the
table.

**Verify**: `grep -n "Sampling temperature" README.md` → shows the new text; `npm run lint` → exit 0.

## Test plan

Covered by Step 2 (new colocated `validate.test.ts`, pattern:
`src/config/merge.test.ts`). Full-suite gate: `npm test` → all pass; the
integration suite must stay green since defaults sit inside the new ranges.

## Done criteria

- [ ] `src/config/validate.test.ts` exists with the 7 cases above; `npm test` exits 0
- [ ] `grep -n "between 0 and 2" src/config/validate.ts` → 1 match
- [ ] `grep -n "non-negative" src/config/validate.ts` → 1 match
- [ ] README temperature row reads `(0-2, provider-dependent)`
- [ ] `npm run typecheck` and `npm run lint` exit 0
- [ ] `git status` shows only the three in-scope files (plus `plans/README.md`) changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Existing tests fail because they feed out-of-range values through
  `validateConfig` and expect them to pass — report which tests; the range
  choice may need maintainer input.
- The excerpts in "Current state" don't match `validate.ts` (drift).

## Maintenance notes

- Users with existing configs outside these ranges will now get exit 2 with
  an explicit message where they previously got provider errors or silent
  refetching — that's the intended behavior change; mention it in the
  release notes.
- If Anthropic-only strictness (max 1.0) is ever wanted, do it per-provider
  in the LLM layer, not here — the validator has no provider knowledge.
