# Plan 010: Delete the orphaned root entrypoint and dead config-command code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- index.ts src/commands/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `cd2908e`, 2026-07-21

## Why this matters

Two pieces of code exist that nothing calls: a one-line root `index.ts` and
an exported command handler with zero call sites. Dead exports invite drift
(they get "maintained" without ever running) and mislead readers about the
CLI's real surface. As a bonus, removing the dead handler leaves two
identical `ConfigLoadError` catch blocks in the same file, which this plan
consolidates into one helper.

## Current state

- `index.ts` (repo root, entire file):

  ```ts
  import './src/index.js';
  ```

  Nothing references it: `package.json` `main` is `./dist/index.js`, the npm
  `bin` is `bin/zencommit.js` (which imports `dist/index.js`),
  `tsconfig.build.json` includes only `src/**`, and `package.json` `files`
  ships only `dist` and `bin`. It exists solely so the root-level typecheck
  has something to chew on — which it doesn't need.

- `src/commands/config.ts:70-83` — `runConfigShowResolved`, exported, zero
  call sites anywhere in `src/`, `tests/`, `bin/`, or `scripts/`
  (`src/index.ts` registers only `runConfigPrint`, `runConfigInit`,
  `runConfigValidate`):

  ```ts
  export const runConfigShowResolved = async (): Promise<void> => {
    try {
      const repoRoot = await getRepoRoot();
      const config = await resolveConfig(repoRoot);
      const redacted = redactObject(config);
      console.log(JSON.stringify(redacted, null, 2));
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(error.message);
        process.exit(2);
      }
      throw error;
    }
  };
  ```

- The same `catch` shape appears verbatim in `runConfigPrint`
  (`src/commands/config.ts:21-27`) and `runConfigValidate`
  (`src/commands/config.ts:61-67`). After deleting `runConfigShowResolved`,
  two copies remain.

Repo conventions: arrow-function exports, `const` helpers above their users,
no comments (see the rest of `src/commands/config.ts` — match it).

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Lint      | `npm run lint`      | exit 0              |
| Tests     | `npm test`          | all pass            |

(`npm ci` first if `node_modules/` is missing.)

## Scope

**In scope** (the only files you may modify/delete):

- `index.ts` (repo root — delete)
- `src/commands/config.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/index.ts` — the real CLI entrypoint; unrelated to root `index.ts`.
- `PROVIDER_ALIASES` identity entries in `src/llm/providers.ts`
  (`openrouter: 'openrouter'` etc.) — plan 008 deletes that entire table; do
  not pre-empt it.
- `redactObject`, `resolveConfig` — still used by the surviving handlers.
- Any other pre-existing dead code you may notice — report it, don't delete it.

## Git workflow

- Branch: `advisor/010-dead-code-sweep`
- Conventional commits, e.g. `chore: remove orphaned root entrypoint and dead config handler`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the root `index.ts`

`git rm index.ts`

**Verify**: `grep -rn "\.\./index\b\|'\./index.ts'\|\"index.ts\"" src bin scripts tsconfig.json tsconfig.build.json package.json | grep -v src/index` → no matches, then `npm run typecheck` → exit 0.

### Step 2: Remove `runConfigShowResolved`

Delete the function (`src/commands/config.ts:70-83`). Do not remove the
imports it shares with the surviving handlers (`resolveConfig`,
`redactObject`, `getRepoRoot`, `ConfigLoadError`) — all are still used.

**Verify**: `grep -rn "runConfigShowResolved" . --include="*.ts" --include="*.js" --include="*.mjs"` → no matches; `npm run typecheck` → exit 0.

### Step 3: Consolidate the duplicated `ConfigLoadError` catch

In `src/commands/config.ts`, add one local helper and route both remaining
try/catch bodies through it:

```ts
const withConfigErrorHandling = async (run: () => Promise<void>): Promise<void> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
};
```

`runConfigPrint` and `runConfigValidate` become
`await withConfigErrorHandling(async () => { ...existing body... })` with
their own try/catch removed. `runConfigInit` has no such catch — leave it
alone. Behavior must be byte-identical: same messages, same exit code 2.

**Verify**: `npm run lint` → exit 0; `npm test` → all pass (the integration
suite `tests/integration/cli-behavior.test.ts` asserts `config validate`
exits 2 with `Invalid JSON in inline config from ZENCOMMIT_CONFIG_CONTENT` on
malformed inline config — that test is the behavioral gate for this step).

## Test plan

No new tests. The existing gates cover everything this plan touches:

- `tests/integration/cli-behavior.test.ts` exercises `config print` (parses
  the JSON + `Sources:` output) and `config validate` error paths (exit 2).
- `npm run build` (via `pretest`) proves the root `index.ts` deletion breaks
  neither compilation nor `scripts/verify-dist.mjs`.

## Done criteria

- [ ] Root `index.ts` no longer exists
- [ ] `grep -rn "runConfigShowResolved" .` (excluding `plans/` and `dist/`) → no matches
- [ ] Exactly one `instanceof ConfigLoadError` occurrence remains in `src/commands/config.ts`
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all exit 0
- [ ] `git status` shows only the two in-scope files (plus `plans/README.md`) changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any grep in Step 1 or Step 2 finds a real reference to root `index.ts` or
  `runConfigShowResolved` — the "orphaned" premise is then false.
- The integration tests fail after Step 3 with different error text or exit
  codes — the consolidation changed behavior; do not adjust the tests to
  match, revert and report.

## Maintenance notes

- If a `config show-resolved` subcommand is ever wanted, note that
  `runConfigPrint` already prints the resolved config plus sources — the
  deleted handler was a strict subset of it.
- Reviewer should confirm Step 3 changed no user-visible strings
  (`git diff` should show only structural movement in the two handlers).
