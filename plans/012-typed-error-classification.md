# Plan 012: Classify exit codes with typed errors instead of message regexes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/llm/generate.ts src/commands/default-flow.ts src/llm/output.ts tests/unit/default-flow.test.ts tests/unit/generate.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: run AFTER plans 004 and 008 (both rewrite `src/llm/providers.ts` / touch `src/llm/generate.ts`; this plan must not run concurrently with either, and running it after avoids rebase churn). Independent of 001/002/005/006/007.
- **Category**: tech-debt
- **Planned at**: commit `cd2908e`, 2026-07-21

## Why this matters

The CLI's documented exit-code contract (2 = config/auth, 3 = git/exec,
4 = model failure) is enforced by regex-matching error **message strings**:
`/API key/i`, exact-string `'Model call timed out'`, etc. Any rewording of a
message in `generate.ts` silently reroutes an error to the wrong exit code —
nothing in the type system connects the throw site to the classifier. Typed
error classes make the contract robust for errors this codebase throws, while
regex stays only as the unavoidable fallback for errors originating inside
third-party SDKs.

## Current state

- `src/commands/default-flow.ts:129-156` — the classifier, string-driven:

  ```ts
  export const classifyDefaultCommandError = (
    error: unknown,
  ): DefaultCommandErrorClassification => {
    if (error instanceof ConfigLoadError) {
      return { exitCode: 2, message: error.message };
    }

    if (error instanceof ExecError) {
      return {
        exitCode: 3,
        message: error.safeStderr || error.message,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error.';
    if (/API key/i.test(message)) {
      return {
        exitCode: 2,
        message: `${message}\nRun \`zencommit auth login\` to store credentials.`,
      };
    }

    if (
      /Unsupported model provider|Invalid commit message response|Model call timed out/i.test(
        message,
      )
    ) {
      return { exitCode: 4, message };
    }

    return { exitCode: 4, message };
  };
  ```

  It is called from exactly one place: `src/commands/default.ts:274`.

- `src/llm/generate.ts` — the throw sites this plan will type:
  - `const MODEL_TIMEOUT_MESSAGE = 'Model call timed out';` (line 45), thrown
    as `throw new Error(MODEL_TIMEOUT_MESSAGE)` in `withModelTimeout`
    (line 69), detected by `isModelTimeoutError` via string equality (line 75-76).
  - `ensureAuth` (line 99-118) throws
    `new Error(\`Missing API key for ${primary}. Set ${primary} or run \`zencommit auth login\`.\`)`.
  - `isProviderAuthError` (line 78-85) regex-matches **SDK-thrown** errors
    (401s etc.) to decide rethrow-vs-fallback — that regex is inherent (the
    SDK errors aren't ours) and stays.

- `src/llm/output.ts:17` — `CommitMessageOutputError extends Error` already
  exists (message shape: `Invalid commit message response during <phase>: …`);
  the classifier currently catches it only via the regex.

- `src/llm/providers.ts` throws plain `Error('Unsupported model provider: …')`
  and `Error('Model id must be in the format provider/model')` — that file is
  OUT of scope here (owned by plans 004/008), so those two keep flowing
  through the regex branch. Both already land on exit 4, which is also the
  default, so precision is not lost.

- Existing tests pinning today's behavior —
  `tests/unit/default-flow.test.ts`, test
  `'classifies runtime errors into stable exit-code buckets without leaking secrets'`,
  asserts (among others):

  ```ts
  expect(classifyDefaultCommandError(new Error('Missing API key for OPENAI_API_KEY'))).toEqual({
    exitCode: 2,
    message: 'Missing API key for OPENAI_API_KEY\nRun `zencommit auth login` to store credentials.',
  });
  ```

  These assertions must KEEP passing — plain-`Error` inputs still classify
  correctly via the retained regex fallback.

- Conventions: classes in `PascalCase`, `name` set in constructor (pattern:
  `ConfigLoadError` in `src/config/load.ts:16-26`), kebab-case filenames,
  no comments.

**Design constraint (why a new `src/llm/errors.ts` file):**
`default-flow.ts` must import the error classes, and importing them from
`generate.ts` would pull the entire `ai` SDK + provider graph into
`default-flow.ts`'s module graph (it is currently SDK-free and cheap to
import in unit tests). A leaf module with only error classes keeps it that
way.

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Lint      | `npm run lint`      | exit 0              |
| Tests     | `npm test`          | all pass            |

(`npm ci` first if `node_modules/` is missing.)

## Scope

**In scope** (the only files you may modify/create):

- `src/llm/errors.ts` (create)
- `src/llm/generate.ts`
- `src/commands/default-flow.ts`
- `tests/unit/default-flow.test.ts` (extend)
- `tests/unit/generate.test.ts` (extend/adjust only if its assertions
  reference the affected errors)

**Out of scope** (do NOT touch, even though they look related):

- `src/llm/providers.ts` — owned by plans 004/008; its plain errors stay
  regex-classified.
- `src/llm/output.ts` — `CommitMessageOutputError` is imported as-is, not
  modified.
- `src/commands/default.ts` — the single call site's contract
  (`{ exitCode, message }`) is unchanged.
- All user-facing message strings — every message must stay byte-identical
  (the integration suite asserts on them).
- `isProviderAuthError` in `generate.ts` — SDK-error matching stays regex.

## Git workflow

- Branch: `advisor/012-typed-error-classification`
- Conventional commits, e.g. `refactor(errors): classify exit codes via typed error classes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/llm/errors.ts`

```ts
export class ModelTimeoutError extends Error {
  constructor() {
    super('Model call timed out');
    this.name = 'ModelTimeoutError';
  }
}

export class MissingApiKeyError extends Error {
  constructor(envKey: string) {
    super(`Missing API key for ${envKey}. Set ${envKey} or run \`zencommit auth login\`.`);
    this.name = 'MissingApiKeyError';
    this.envKey = envKey;
  }

  readonly envKey: string;
}
```

(Adjust field-initialization order to satisfy `strict` — assign `envKey`
before or via declaration as TypeScript requires.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Throw the typed errors in `generate.ts`

- Import both classes from `./errors.js`.
- `withModelTimeout`: `throw new ModelTimeoutError()` instead of
  `new Error(MODEL_TIMEOUT_MESSAGE)`.
- `isModelTimeoutError`: `error instanceof ModelTimeoutError`. Remove
  `MODEL_TIMEOUT_MESSAGE` if now unused.
- `ensureAuth`: `throw new MissingApiKeyError(primary)` (note: the "Run
  `zencommit auth login`" sentence is part of the class's message — confirm
  the final message string is byte-identical to the old one).

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass. If
`tests/unit/generate.test.ts` fails on message assertions, the message drifted
— fix the class message, never the test.

### Step 3: Classify by `instanceof` in `default-flow.ts`

Import `ModelTimeoutError`, `MissingApiKeyError` from `../llm/errors.js` and
`CommitMessageOutputError` from `../llm/output.js`. In
`classifyDefaultCommandError`, after the existing `ConfigLoadError` /
`ExecError` branches and before the regex section, add:

```ts
if (error instanceof MissingApiKeyError) {
  return {
    exitCode: 2,
    message: `${error.message}\nRun \`zencommit auth login\` to store credentials.`,
  };
}

if (error instanceof ModelTimeoutError || error instanceof CommitMessageOutputError) {
  return { exitCode: 4, message: error.message };
}
```

KEEP the existing `/API key/i` and
`/Unsupported model provider|Invalid commit message response|Model call timed out/i`
regex branches below, unchanged — they now serve SDK-thrown errors and
`providers.ts`'s plain errors.

**Verify**: `npm test` → all pass, including the existing
`'classifies runtime errors into stable exit-code buckets'` test unmodified.

### Step 4: Extend the classifier test

In `tests/unit/default-flow.test.ts`, inside the existing classify test (or a
sibling `it`), add typed-instance cases following the existing `toEqual`
pattern:

- `new MissingApiKeyError('OPENAI_API_KEY')` → exitCode 2, message ending
  with the login hint line.
- `new ModelTimeoutError()` → exitCode 4, message `'Model call timed out'`.
- `new CommitMessageOutputError(...)` → exitCode 4 (construct it the same way
  `src/llm/output.ts` does — check its constructor signature first).
- Keep (do not delete) the existing plain-`Error` cases — they now prove the
  regex fallback still works.

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

- New cases per Step 4 in `tests/unit/default-flow.test.ts` (pattern: the
  existing classify test in the same file).
- Existing message-string assertions across
  `tests/unit/{default-flow,generate}.test.ts` and
  `tests/integration/cli-behavior.test.ts` act as the no-regression gate —
  none may be edited to accommodate a changed message.
- Verification: `npm test` → all pass.

## Done criteria

- [ ] `src/llm/errors.ts` exists; `grep -n "instanceof ModelTimeoutError\|instanceof MissingApiKeyError\|instanceof CommitMessageOutputError" src/commands/default-flow.ts` → 3 class names present
- [ ] `grep -n "new Error(MODEL_TIMEOUT_MESSAGE)\|Missing API key for \${primary}" src/llm/generate.ts` → no matches (both throws are typed now)
- [ ] The two regex branches still exist in `classifyDefaultCommandError`
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all exit 0 with zero edits to existing assertion strings
- [ ] `git status` shows only in-scope files (plus `plans/README.md`) changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 004 or 008 are IN PROGRESS (check `plans/README.md`) — shared-file
  conflict on `generate.ts`.
- Importing `CommitMessageOutputError` into `default-flow.ts` pulls heavy
  transitive imports (check `src/llm/output.ts`'s import list — it should be
  a leaf; if it imports the `ai` SDK, put the `instanceof` behind a different
  mechanism and report).
- Any existing test needs its expected message string changed to pass.

## Maintenance notes

- New failure modes in the LLM layer should get a class in
  `src/llm/errors.ts` + an `instanceof` branch — never a new regex.
- When plan 004/008's rewrite of `providers.ts` settles, migrating its two
  plain errors (`Unsupported model provider…`, `Model id must be…`) to a
  typed class in `errors.ts` is the natural follow-up (deferred here to avoid
  the file contention).
- Reviewer: diff-check that no user-visible message changed (`git diff` on
  string literals only moves them between files).
