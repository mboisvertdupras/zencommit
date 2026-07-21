# Plan 005: Keep API keys out of process argv (keychain writes and `auth login --token`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/auth/secrets.ts src/util/exec.ts src/commands/auth.ts src/index.ts tests/unit/secrets.test.ts tests/unit/exec.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

When `zencommit auth login` stores an API key in the macOS Keychain, it spawns `security add-generic-password … -w <THE KEY VALUE>` — the secret rides in the child process's argv, which is visible to **any other local process** via `ps`/`procfs`-equivalents for the lifetime of the (short) command. The CLI's own display-redaction (`redactedArgs`) hides it from zencommit's logs, but not from the OS process table. Separately, the documented non-interactive flow `zencommit auth login --env-key X --token <token>` puts the secret in *zencommit's own* argv and typically in shell history. Both are classic local-disclosure bugs; the fixes are mechanical: feed `security` its command via stdin (`security -i`), and offer `--token-stdin` for scripts.

## Current state

- `src/auth/secrets.ts` — `MacOsKeychainSecretStore` wraps the `security` CLI. The vulnerable write, lines 253–274:

```ts
async set(envKey: string, value: string): Promise<void> {
  this.assertSupportedPlatform();
  const command = [
    'security',
    'add-generic-password',
    '-U',
    '-s',
    this.service,
    '-a',
    envKey,
    '-w',
    value,                                  // <-- secret in argv
  ];
  try {
    await this.runner(command, {
      operation: `macOS Keychain store ${envKey}`,
      redactedArgs: [command.length - 1],   // hides it from zencommit's display only
    });
  } catch (error) {
    throw toKeychainFailureError('store', envKey, error);
  }
}
```

  Reads (`get`, lines 276–297) and deletes (299–313) pass only the *account name* in argv — fine as-is. The store is injectable: the constructor takes a `runner: ExecRunner = exec`, and `tests/unit/secrets.test.ts` already passes fake runners.

- `src/util/exec.ts` — the only child-process wrapper. `runCommand` (lines 196–249) spawns with `stdio: ['ignore', 'pipe', 'pipe']` — **no stdin support today**. `ExecOptions` is lines 139–147.
- `src/commands/auth.ts` — `runAuthLogin` (lines 61–112): `const token = args.token ?? (await promptForSecret(envKey));`. The `--token` flag is defined in `src/index.ts:123` (`.option('token', { type: 'string', describe: 'Secret token value' })`).
- `README.md:137` documents: `zencommit auth login --env-key OPENAI_API_KEY --token <token>`.

### The `security -i` technique

`security` has an interactive mode: `security -i` reads commands from stdin, one per line, with its own sh-like tokenizer. Writing
`add-generic-password -U -s zencommit -a OPENAI_API_KEY -w 'SECRETVALUE'\n`
to its stdin keeps the secret out of argv entirely. Quoting rule for the stdin line: wrap the value in single quotes and escape embedded single quotes as `'\''` — the same shape as `quoteArg` in `src/util/exec.ts:30-38` (reuse it; it is module-local, so export it or inline the same logic).

### Conventions

TypeScript ESM strict; arrow-function exports; errors via the existing `toKeychainFailureError` helpers; tests with injected fake runners (exemplar: `tests/unit/secrets.test.ts`, which constructs `MacOsKeychainSecretStore` with a `vi.fn()` runner and asserts on the command arrays). Conventional commits.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `npm ci`                                             | exit 0              |
| Typecheck | `npm run typecheck`                                  | exit 0              |
| Lint      | `npm run lint`                                       | exit 0, 0 warnings  |
| Tests     | `npx vitest run tests/unit/secrets.test.ts tests/unit/exec.test.ts` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test`      | all exit 0          |

## Scope

**In scope** (the only files you should modify):
- `src/util/exec.ts` (add optional `stdin` support)
- `src/auth/secrets.ts` (rewrite `set` to use `security -i`)
- `src/commands/auth.ts` + `src/index.ts` (add `--token-stdin`)
- `tests/unit/secrets.test.ts`, `tests/unit/exec.test.ts` (new cases)
- `README.md` (auth section update)

**Out of scope** (do NOT touch, even though they look related):
- `get`/`delete` keychain paths — no secret in their argv.
- The env-injection in `src/llm/generate.ts:109-111` (`process.env[key] = value`) — that is how AI SDKs receive keys by convention; not a defect.
- Deprecating/removing `--token` — keep it working (scripts depend on it); we add the safer alternative and document the trade-off.
- Any non-macOS secret-store backend (tracked separately in `plans/README.md` backlog).

## Git workflow

- Branch: `advisor/005-keep-secrets-out-of-argv`
- Conventional commits, e.g. `fix(auth): pass keychain secrets via stdin instead of argv`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add stdin support to `exec`

In `src/util/exec.ts`:

1. Add `stdin?: string;` to `ExecOptions` (lines 139–147).
2. In `runCommand` (line 212), when `options.stdin !== undefined`, spawn with `stdio: ['pipe', 'pipe', 'pipe']`, then after wiring the data handlers: `proc.stdin!.on('error', () => {}); proc.stdin!.end(options.stdin);` (the no-op error handler prevents an EPIPE crash if the child exits before reading). When `options.stdin` is undefined, keep `['ignore', 'pipe', 'pipe']` exactly as today.
3. The stdin content must NEVER appear in `commandDisplay`, logs, or `ExecError` fields — it is not part of `command[]`, so this holds automatically; do not add it anywhere.

Add to `tests/unit/exec.test.ts` (follow its existing style): a test running `exec(['cat'], { stdin: 'hello' })` asserting `stdout === 'hello'`, and one with `exec(['node', '-e', 'process.exit(0)'], { stdin: 'ignored' })` asserting no throw (child exits without reading stdin).

**Verify**: `npx vitest run tests/unit/exec.test.ts` → all pass.

### Step 2: Rewrite the keychain `set` to use `security -i`

In `src/auth/secrets.ts`, replace the body of `MacOsKeychainSecretStore.set`:

```ts
async set(envKey: string, value: string): Promise<void> {
  this.assertSupportedPlatform();
  const quoted = `'${value.replaceAll("'", "'\\''")}'`;
  const line = `add-generic-password -U -s ${this.service} -a ${envKey} -w ${quoted}\n`;
  try {
    await this.runner(['security', '-i'], {
      operation: `macOS Keychain store ${envKey}`,
      stdin: line,
    });
  } catch (error) {
    throw toKeychainFailureError('store', envKey, error);
  }
}
```

Notes:
- `this.service` is the constant `'zencommit'` and `envKey` is validated against the known-key allowlist upstream (`validateEnvKey` in `src/commands/auth.ts:22-27`), so only `value` needs quoting.
- `redactedArgs` is no longer needed for this call (argv is just `security -i`).
- **Behavioral check on error shape**: in `-i` mode, a failed inner command may surface as a non-zero exit of `security` itself with the message on stderr — which the runner turns into an `ExecError`, same as before. Keep the existing `toKeychainFailureError` wrapping.

Update `tests/unit/secrets.test.ts`: the existing `set` tests assert on the old command array — update them to assert (a) the command array is exactly `['security', '-i']`, (b) `options.stdin` contains `add-generic-password` and the secret value, and (c) **the secret value does not appear anywhere in the `command` array** (the regression this plan exists for). Keep the failure-path tests (ExecError → keychain failure message) passing.

**Verify**: `npx vitest run tests/unit/secrets.test.ts` → all pass.

### Step 3: Manual keychain round-trip (macOS only; skip on other platforms and note it)

Build and exercise the real keychain with a throwaway value (NOT a real key):

```bash
npm run build
node dist/index.js auth login --env-key OPENAI_API_KEY --token zc-plan005-dummy
node dist/index.js auth status | grep OPENAI_API_KEY     # expect: stored (…ummy)
node dist/index.js auth logout --env-key OPENAI_API_KEY  # expect: Removed …
```

If `auth status` previously showed a real stored `OPENAI_API_KEY`, do NOT run this step against it — STOP and report instead (don't clobber the user's real key).

**Verify**: the three commands behave as annotated; the dummy value round-trips.

### Step 4: Add `--token-stdin`

1. `src/index.ts` auth-login builder (around line 120–124): add `.option('token-stdin', { type: 'boolean', default: false, describe: 'Read the secret token from stdin' })` and pass `tokenStdin: argv['token-stdin']` through to `runAuthLogin`.
2. `src/commands/auth.ts`: extend `AuthArgs` with `tokenStdin?: boolean`. In `runAuthLogin`, resolve the token as: `--token` value if given; else if `tokenStdin`, read all of stdin (`const token = (await new Response(process.stdin).text()).trim()` — Node ≥22 supports this; empty result → print `No token received on stdin.` and `process.exit(2)`); else the interactive `promptForSecret`.
3. `README.md`: in the Authentication section, document `echo "$MY_KEY" | zencommit auth login --env-key OPENAI_API_KEY --token-stdin` as the recommended non-interactive form, and add one sentence noting `--token` exposes the value to shell history/process listings.

**Verify**: `npm run build && printf 'zc-plan005-dummy2' | node dist/index.js auth login --env-key OPENAI_API_KEY --token-stdin` → `Stored OPENAI_API_KEY in secure store.`; then `node dist/index.js auth logout --env-key OPENAI_API_KEY` (same real-key caution as Step 3).

### Step 5: Full gate

**Verify**: `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.

## Test plan

- `tests/unit/exec.test.ts`: stdin piping happy path; child-exits-early path (Step 1).
- `tests/unit/secrets.test.ts`: argv-free `set` (Step 2), including the explicit "secret not in command array" regression assertion; failure-path message preservation.
- Manual macOS round-trip (Steps 3–4) — keychain cannot run in CI; the unit tests with injected runners are the automated guard.
- Pattern files: `tests/unit/exec.test.ts`, `tests/unit/secrets.test.ts` (both exist; both already use injected runners/mocks).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "'-w'," src/auth/secrets.ts` → no match in `set` (the argv write is gone)
- [ ] `npx vitest run` exits 0; new exec-stdin and secrets-argv tests exist and pass
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `node dist/index.js auth login --help` lists `--token-stdin` (after `npm run build`)
- [ ] README documents `--token-stdin`; `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 3 manual round-trip fails: `security -i` quoting may differ from the plan's assumption for some character class. Report the failing value shape and the `security` stderr — do not fall back to argv.
- `auth status` shows a real stored key for the env-key you were about to test with (don't destroy user state).
- Reading stdin via `new Response(process.stdin)` fails to type-check under the repo's TS config after one attempt — report; do not pull in a dependency for stdin reading.
- The existing secrets tests assert behaviors this plan didn't anticipate (more than reshaping the `set` command assertions).

## Maintenance notes

- Test secrets in unit tests must be obvious dummies (`zc-plan005-dummy`); never real key material — and per repo policy, never commit secret values.
- Reviewer should scrutinize the single-quote escaping in Step 2 against a value containing `'`, a space, and `\` (one of the unit tests should use exactly such a value, e.g. `ab'c \ d`).
- Deferred, tracked in backlog: non-macOS secret store backends (currently `SecretStoreUnavailableError` + env-var fallback everywhere else); rate of `security` spawns in `runAuthStatus` (one per known key, ~24 sequential spawns) is cosmetic and untouched.
