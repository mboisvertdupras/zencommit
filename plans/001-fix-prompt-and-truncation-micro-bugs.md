# Plan 001: Fix three small correctness/perf bugs in the prompt-budget path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/commands/default.ts src/llm/truncate.ts src/llm/tokens.ts src/llm/truncate.test.ts src/llm/tokens.test.ts`
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

zencommit is an AI commit-message CLI: it takes the staged git diff, truncates it to fit the model's token budget, and sends it to an LLM. Three small defects sit in that budget path: (1) a prompt sent to the LLM contains a literal `\n` two-character sequence instead of a newline, (2) the smart truncator re-tokenizes the entire original diff one extra time on every run just to compute a boolean, and (3) the computed token budget can go negative, violating its implicit contract with downstream consumers. All three are local, low-risk fixes that improve output quality and per-run latency.

## Current state

- `src/commands/default.ts` — the main command flow; builds the token budget and calls the truncators (lines 136–164).
- `src/llm/truncate.ts` — diff truncation (smart + byFile strategies); the redundant tokenization is in the `truncateDiffSmart` return (lines 548–553).
- `src/llm/tokens.ts` — token counting and budget computation; `computeTokenBudget` is lines 38–55.
- Existing tests: `src/llm/truncate.test.ts` and `src/llm/tokens.test.ts` (colocated with their modules; Vitest discovers them with no config file — there is intentionally no `vitest.config.ts`).

### Bug 1 — literal backslash-n in prompt text

`src/commands/default.ts:155-158` (the `byFile`-strategy path when the budget is exhausted):

```ts
} else if (budget.availableTokens <= 0) {
  const fileSummary = await getFileSummary({ mode: effectiveDiffMode, cwd: repoRoot });
  truncatedText = fileSummary.trim() ? `File summary:\\n${fileSummary.trim()}` : fileList;
}
```

Inside a template literal, `\\n` produces the two characters `\` and `n`, not a newline. The equivalent code path inside `truncateDiffSmart` does it correctly — `src/llm/truncate.ts:478`: ``const summaryBlock = fileSummary.trim() ? `File summary:\n${fileSummary.trim()}\n` : '';``

### Bug 2 — redundant full-diff tokenization

`src/llm/truncate.ts:548-553`:

```ts
return {
  text: combined,
  usedTokens: combinedTokens,
  truncated: diffTokens < countTokens(diffText, encoding),
  mode: 'smart',
};
```

`diffText` is the full original compact diff. `countTokens` runs js-tiktoken `encode()` over all of it solely to derive the `truncated` boolean, after the hunk-selection loop already knows exactly what was dropped. On large diffs this is the single most expensive line in the function.

The information needed to compute `truncated` without re-encoding is already present in the function:

- `hunks` (line 493) is the full list of candidate hunks; `selections` (line 503) is what survived the budget. If `selections.length < hunks.length`, content was dropped.
- `selectHunkLines` (lines 344–382) returns `omittedAdded`/`omittedRemoved` per hunk — if any selected hunk omitted lines, content was dropped. Note the selection loop (lines 507–528) already calls `selectHunkLines` per hunk; you can record whether any selection had omissions there.
- The smart diff also drops context lines (lines starting with a space) by design — that is _always_ true, so "did we drop context lines" is not part of the current `truncated` semantics. Preserve the current semantics: `truncated` is true when selected output tokens are fewer than the full diff's tokens. Dropping any hunk, omitting any +/- line, or hitting the headers-only/summary-only degradation paths each imply that. One subtlety: when ALL hunks are selected with zero omissions, the current expression can still return `true` because the rebuilt smart diff drops context lines and file `index`/`---`/`+++` noise. Decide `truncated` as: `selections.length < hunks.length || anyOmitted` — and accept this as a deliberate, documented semantic tightening (the result now reports whether _change content_ was dropped, not whether formatting shrank). Existing tests pin the current behavior; see the test plan.

### Bug 3 — negative `availableTokens`

`src/llm/tokens.ts:38-55`:

```ts
export const computeTokenBudget = (
  limits: ModelLimits,
  maxOutputTokens: number,
  overheadTokens: number,
): TokenBudget => {
  const contextLimit = limits.context ?? Number.POSITIVE_INFINITY;
  const inputLimit = limits.input ?? limits.context ?? Number.POSITIVE_INFINITY;
  const outputLimit = limits.output ?? Number.POSITIVE_INFINITY;
  const outputTokens = Math.min(maxOutputTokens, outputLimit);
  const inputMaxTokens = Math.min(inputLimit, contextLimit - outputTokens);
  const availableTokens = inputMaxTokens - overheadTokens;
  ...
```

When `overheadTokens > inputMaxTokens` (tiny model, large prompt scaffolding), `availableTokens` goes negative. Downstream both truncators happen to guard with `<= 0` (`truncateDiffByFile` at `truncate.ts:209`, `truncateDiffSmart` at `truncate.ts:469`, and `default.ts:155`), so behavior is currently safe — but the contract should be explicit. Clamp `availableTokens` to `Math.max(0, ...)`. The `<= 0` guards keep working because `0` still satisfies them.

### Conventions

TypeScript ESM, `strict` + `noUncheckedIndexedAccess`. Arrow-function exports (`export const fn = (...) =>`), kebab-case filenames, Prettier formatting, oxlint with zero warnings. Tests use Vitest `describe/it/expect`; model new test cases on the existing cases in `src/llm/truncate.test.ts`.

## Commands you will need

| Purpose                       | Command                | Expected on success |
| ----------------------------- | ---------------------- | ------------------- |
| Install                       | `npm ci`               | exit 0              |
| Typecheck                     | `npm run typecheck`    | exit 0, no output   |
| Lint                          | `npm run lint`         | exit 0, 0 warnings  |
| Format                        | `npm run format:check` | exit 0              |
| Tests                         | `npx vitest run`       | all pass            |
| Full test (builds dist first) | `npm test`             | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/commands/default.ts` (one-line string fix)
- `src/llm/truncate.ts` (truncated-flag computation)
- `src/llm/tokens.ts` (clamp)
- `src/llm/truncate.test.ts`, `src/llm/tokens.test.ts` (new cases)

**Out of scope** (do NOT touch, even though they look related):

- `truncateDiffByFile` and its allocation algorithm — works as designed.
- The hunk-scoring heuristics (`scoreHunk`) — behavior change there alters which hunks models see; not this plan.
- `src/llm/generate.ts`, prompt templates — unrelated.
- `dist/` — generated; never edit.

## Git workflow

- Branch: `advisor/001-prompt-truncation-micro-bugs`
- Conventional commits, e.g. `fix(llm): avoid re-tokenizing full diff for truncated flag` (matches history: `fix(metadata): correctly prefix namespaced model IDs`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the literal `\n`

In `src/commands/default.ts:157`, change `` `File summary:\\n${fileSummary.trim()}` `` to `` `File summary:\n${fileSummary.trim()}` ``.

**Verify**: `grep -n 'File summary:\\\\n' src/commands/default.ts` → no matches; `npm run typecheck` → exit 0.

### Step 2: Clamp the budget

In `src/llm/tokens.ts`, change line 48 to `const availableTokens = Math.max(0, inputMaxTokens - overheadTokens);`.

Add a test in `src/llm/tokens.test.ts`: `computeTokenBudget` with `limits = { context: 100, input: 100, output: null }`, `maxOutputTokens = 50`, `overheadTokens = 500` → `availableTokens` is `0` (not negative).

**Verify**: `npx vitest run src/llm/tokens.test.ts` → all pass including the new case.

### Step 3: Replace the redundant tokenization

In `src/llm/truncate.ts` `truncateDiffSmart`:

1. In the selection loop (lines 507–528), track two booleans: `anyHunkSkipped` (a hunk failed the budget check at line 521 — set where the `continue` happens) and `anyLinesOmitted` (a _selected_ hunk had `omittedAdded + omittedRemoved > 0`).
2. Change the final return's `truncated` to `anyHunkSkipped || anyLinesOmitted`. The earlier degraded returns (summary-only at 469–476 and 542–546, and the headers-only path setting at 535–540) already hard-code `truncated: true` or imply it — when the headers-only fallback (line 536) is used, `truncated` must also be `true`; ensure that path sets it.
3. Run the existing suite. If an existing test in `src/llm/truncate.test.ts` asserted `truncated: true` for a case where all hunks fit with no omissions (relying on context-line removal alone), update that assertion to `false` and note the semantic tightening in the commit body.

**Verify**: `npx vitest run src/llm/truncate.test.ts` → all pass; `grep -n 'countTokens(diffText' src/llm/truncate.ts` → no matches.

### Step 4: Full gate

**Verify**: `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.

## Test plan

- `src/llm/tokens.test.ts`: new case — overhead larger than input limit yields `availableTokens === 0`.
- `src/llm/truncate.test.ts`: new cases —
  - a diff that fully fits the budget with no omissions → `truncated: false`, `mode: 'smart'`;
  - a diff where one hunk is dropped by budget → `truncated: true`;
  - a diff where a hunk exceeds `maxAddedLinesPerHunk` (omitted lines) but all hunks selected → `truncated: true`.
- Model after the existing tests in the same files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `npm test` exits 0; the new test cases listed above exist and pass
- [ ] `grep -c 'File summary:\\\\n' src/commands/default.ts` → 0
- [ ] `grep -c 'countTokens(diffText' src/llm/truncate.ts` → 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift).
- More than two existing truncate tests change expectation in Step 3 — that suggests the `truncated` semantics are more load-bearing than assessed; report instead of rewriting tests wholesale.
- Fixing the flag requires touching `buildSmartDiff`/`selectHunkLines` signatures in a way that changes their exported behavior.

## Maintenance notes

- The `truncated` flag now means "change content (hunks or +/- lines) was dropped", not "output is byte-smaller than input". Anyone adding a new degradation path to `truncateDiffSmart` must set it explicitly.
- Reviewer should scrutinize Step 3's loop bookkeeping — `anyHunkSkipped` must only be set when the budget check fails, not on the first iteration of an empty-hunk file.
- Deferred: `truncateDiffSmart` re-encodes file headers for every unselected file repeatedly during selection; a memoization pass was considered and deferred as premature (headers are short).
