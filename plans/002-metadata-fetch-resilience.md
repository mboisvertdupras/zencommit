# Plan 002: Make the models.dev metadata fetch unable to hang or fail a commit run

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/metadata/providers/modelsdev.ts src/metadata/cache.ts tests/unit/metadata-runtime.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

Every plain `zencommit` run resolves model metadata (token limits) before calling the LLM. When the on-disk cache is cold or stale, that means an HTTP fetch of `https://models.dev/api.json` (~2 MB) — issued with **no timeout**. A slow or black-holed connection hangs the entire commit flow indefinitely, before any spinner or model call. Separately, if the fetch _succeeds_ but the cache _write_ fails (read-only cache dir, full disk) and no prior cache exists, the error escapes and fails a run that had already obtained the data it needed. Three contained changes make metadata strictly best-effort: a fetch timeout, a response size cap, and a best-effort cache write.

## Current state

- `src/metadata/providers/modelsdev.ts` — fetches/caches models.dev data; the relevant function is `loadModels` inside `createModelsDevProvider` (lines 109–192).
- `src/metadata/cache.ts` — `readCache`/`writeCache`/`isCacheFresh` helpers (29 lines).
- `src/metadata/index.ts` — `createMetadataResolver.getModel` already catches provider errors, `console.warn`s, and returns `null` (lines 49–63); `src/commands/default.ts:119-122` then falls back to conservative 8k limits with a `console.warn`. **So failures already degrade gracefully — only a _hang_ is unrecoverable, and only a post-fetch write failure turns success into failure.**

The fetch and write, `src/metadata/providers/modelsdev.ts:132-167`:

```ts
try {
  if (getVerbosity() >= 1) {
    logVerbose(1, `metadata: fetching ${config.providers.modelsdev.url}`);
  }
  const response = await fetch(config.providers.modelsdev.url);
  if (!response.ok) {
    throw new Error(`models.dev responded with ${response.status}`);
  }
  let data: unknown;
  try {
    data = (await response.json()) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse models.dev response from ${config.providers.modelsdev.url}: ${(error as Error).message}`,
    );
  }
  cachedModels = requireUsableModelsDevData(data, config.providers.modelsdev.url);
  await writeCache(cachePath, data);          // <-- a write failure here fails the whole load
  logVerbose(2, `metadata: cache write ${cachePath}`);
  return cachedModels;
} catch (error) {
  if (cache) {
    ... // stale-cache fallback
  }
  throw error;                                 // <-- no cache: the run-level warn/null fallback catches this
}
```

`src/metadata/cache.ts:17-20`:

```ts
export const writeCache = async (cachePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(cachePath));
  await fs.writeFile(cachePath, `${JSON.stringify(data)}\n`, 'utf8');
};
```

There is precedent for `AbortSignal.timeout` in this repo: `src/llm/generate.ts:47-52` (`buildTimeoutSignal`) and `src/commands/auth.ts:53`. Follow that style.

### Conventions

TypeScript ESM, strict; arrow-function exports; verbose logging through `logVerbose(level, msg)` from `src/util/logger.ts`; user-facing warnings via `console.warn`. Tests: `tests/unit/metadata-runtime.test.ts` already exercises `createModelsDevProvider` with temp dirs and fixtures (see its `modelsDevFixture` helper and `withTempDir`) — extend that file, match its style.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
| --------- | ---------------------------------------------------- | ------------------- |
| Install   | `npm ci`                                             | exit 0              |
| Typecheck | `npm run typecheck`                                  | exit 0              |
| Lint      | `npm run lint`                                       | exit 0, 0 warnings  |
| Tests     | `npx vitest run tests/unit/metadata-runtime.test.ts` | all pass            |
| Full gate | `npm run typecheck && npm run lint && npm test`      | all exit 0          |

## Scope

**In scope** (the only files you should modify):

- `src/metadata/providers/modelsdev.ts`
- `src/metadata/cache.ts` (only if you choose to put the best-effort wrapper there; otherwise untouched)
- `tests/unit/metadata-runtime.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/metadata/index.ts` — its warn-and-null error handling is correct as-is.
- `src/metadata/providers/local.ts` — local file provider, no network.
- `src/config/*` — do not add new config options (timeout is a constant; see Step 1).
- `src/commands/default.ts` — its conservative-limits fallback already works.

## Git workflow

- Branch: `advisor/002-metadata-fetch-resilience`
- Conventional commits, e.g. `fix(metadata): bound models.dev fetch with timeout and size cap`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a fetch timeout

In `src/metadata/providers/modelsdev.ts`, add a module-level constant `const FETCH_TIMEOUT_MS = 10_000;` and change the fetch to:

```ts
const response = await fetch(config.providers.modelsdev.url, {
  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
});
```

Wrap nothing extra: an abort rejects the `fetch` promise with a `TimeoutError`, which flows into the existing `catch` and triggers the stale-cache fallback / null degradation exactly like any other fetch failure. Do not make the timeout configurable — metadata is auxiliary; a constant keeps config surface flat (the maintainer can promote it later).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Cap the response size

After the `response.ok` check and before `response.json()`, add:

```ts
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024; // models.dev api.json is ~2 MB today
const contentLength = Number(response.headers.get('content-length'));
if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
  throw new Error(
    `models.dev response too large (${contentLength} bytes) from ${config.providers.modelsdev.url}`,
  );
}
```

(Header-based check only — streaming-with-budget is overkill for this auxiliary fetch; a missing header falls through to normal parsing.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Make the cache write best-effort

Replace the `await writeCache(cachePath, data);` call (line 149) with a guarded version so a write failure cannot discard already-fetched models:

```ts
try {
  await writeCache(cachePath, data);
  logVerbose(2, `metadata: cache write ${cachePath}`);
} catch (error) {
  logVerbose(1, `metadata: cache write failed for ${cachePath}: ${(error as Error).message}`);
}
```

Keep `writeCache` in `src/metadata/cache.ts` itself unchanged (other callers may rightly want the throw).

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Tests

Extend `tests/unit/metadata-runtime.test.ts` (reuse its `withTempDir`, `modelsDevFixture`, and config-override helpers):

1. **Timeout reaches the fallback**: stub global fetch with `vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))`; pre-write a _stale_ cache file (old mtime via `fs.utimes`); assert `getModel` returns the cached model and that fetch was called once.
2. **Oversize response rejected**: stub fetch to resolve a `Response`-like object with `ok: true`, `headers.get('content-length')` returning `'999999999'`; with no cache present, assert `getModel` (called through `createModelsDevProvider`) rejects with a message containing `too large`.
3. **Cache write failure does not fail the load**: stub fetch to return a valid fixture; point the cache path at an unwritable location — note the cache path is derived from `getCacheRoot()` (`src/util/fs.ts:8-9`), which honors `XDG_CACHE_HOME`; set `process.env.XDG_CACHE_HOME` to a path that is a _file_, not a directory (create a temp file), so `ensureDir` fails; assert `getModel` still resolves with the fetched model. Restore the env var in `afterEach`.
4. **Fetch call carries a signal**: assert the fetch stub was called with an options object whose `signal` is an `AbortSignal` instance.

**Verify**: `npx vitest run tests/unit/metadata-runtime.test.ts` → all pass, including 4 new tests.

### Step 5: Full gate

**Verify**: `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.

## Test plan

Covered in Step 4. Pattern file: `tests/unit/metadata-runtime.test.ts` (existing fixtures and temp-dir helpers). All new tests must restore stubs/env in `afterEach` (`vi.unstubAllGlobals()`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'AbortSignal.timeout' src/metadata/providers/modelsdev.ts` → at least one match
- [ ] `grep -n 'content-length' src/metadata/providers/modelsdev.ts` → at least one match
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `npm test` exits 0; the 4 new tests exist and pass
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `loadModels` structure no longer matches the excerpt (drift).
- `AbortSignal.timeout` behaves differently under the test environment (e.g. Vitest fake timers interfering) after one fix attempt — report rather than restructuring the provider.
- Making the write best-effort breaks an existing test that asserts a throw on cache-write failure — that would mean the current behavior is intentionally pinned; report.

## Maintenance notes

- If a maintainer later wants a configurable timeout, promote `FETCH_TIMEOUT_MS` into `MetadataConfig.providers.modelsdev` (config types in `src/config/types.ts:44-47`, validation in `src/config/validate.ts:121-130`, README schema table) — deliberately deferred here to keep scope flat.
- Reviewer should confirm the timeout error path still prefers the stale cache over the conservative-limits fallback (the `catch` ordering in `loadModels`).
- Related but deferred: `isCacheFresh` treats non-finite `cacheTtlHours` as "stale" silently (`src/metadata/cache.ts:23-28`) — safe behavior, masks a config typo; not worth a change now.
