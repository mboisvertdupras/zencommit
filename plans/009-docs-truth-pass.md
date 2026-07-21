# Plan 009: Make README and AGENTS.md stop claiming things the code doesn't do

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- README.md AGENTS.md src/auth/secrets.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but do NOT run concurrently with plans 005, 008, or 011 — they also edit `README.md`)
- **Category**: docs
- **Planned at**: commit `cd2908e`, 2026-07-21

## Why this matters

Three claims in the published docs are actively wrong, which is worse than
missing docs: a `$schema` URL that does not exist (editors that honor it show
a fetch error), a "Secure Credential Storage" claim that reads as
cross-platform when the secure store is macOS Keychain **only**, and an
AGENTS.md testing rule that contradicts where four test files actually live
(misdirecting any agent that follows it). This plan is text-only — zero
runtime behavior changes.

## Current state

Files and the exact wrong claims:

- `README.md:202` — the example config opens with a schema URL nothing hosts
  or generates:

  ```json
  {
    "$schema": "https://zencommit.dev/config.json",
    "ai": {
  ```

  Nothing in the repo generates a JSON schema, and the URL is not served.

- `README.md:13` — feature bullet:

  ```
  - **Secure Credential Storage** - API keys stored in the system secure store (with env fallback)
  ```

- `README.md` "Authentication" section intro (~line 128):

  ```
  Manage API keys with the `auth` command. Keys are stored via the secure-store backend and never written to config files.
  ```

  Reality: the only secure-store implementation is macOS Keychain.
  `src/auth/secrets.ts` — `MacOsKeychainSecretStore.assertSupportedPlatform()`:

  ```ts
  private assertSupportedPlatform(): void {
    if (process.platform !== 'darwin') {
      throw new SecretStoreUnavailableError(buildUnavailableMessage());
    }
  }
  ```

  On Linux/Windows, `zencommit auth login` fails with
  `SecretStoreUnavailableError` and users must use environment variables.

- `AGENTS.md` "Testing Guidelines":

  ```
  - Unit tests live in `tests/unit/`; integration tests live in `tests/integration/`.
  ```

  Reality: four unit test files are colocated in `src/`:
  `src/llm/truncate.test.ts`, `src/llm/tokens.test.ts`,
  `src/config/merge.test.ts`, `src/config/load.test.ts`. Both locations are
  valid — `tsconfig.build.json` excludes `src/**/*.test.ts` from the build.

- `src/llm/generate.ts:180` — an undocumented env hook used by the
  integration suite:

  ```ts
  if (process.env.ZENCOMMIT_MOCK_RESPONSE) {
  ```

  It bypasses the LLM call entirely and parses the env value as the response.
  Contributors reading AGENTS.md have no way to discover it. (Note:
  `ZENCOMMIT_CONFIG` and `ZENCOMMIT_CONFIG_CONTENT` ARE already documented at
  README.md:176–178 — do not re-document those.)

## Commands you will need

| Purpose      | Command                | Expected on success |
| ------------ | ---------------------- | ------------------- |
| Format check | `npm run format:check` | exit 0              |
| Tests        | `npm test`             | all pass            |

(`npm test` runs a full build via `pretest`; it proves the doc edits broke
nothing. `npm ci` first if `node_modules/` is missing.)

## Scope

**In scope** (the only files you may modify):

- `README.md`
- `AGENTS.md`

**Out of scope** (do NOT touch, even though they look related):

- Any `src/` file — this plan changes zero code.
- The README provider table and alias docs — plan 008 owns those.
- The README auth CLI examples (`--token` flags) — plan 005 owns those.
- Building an actual JSON schema or a cross-platform secret store — both are
  tracked separately (schema: not planned; secret store: direction option #2
  in `plans/README.md`).

## Git workflow

- Branch: `advisor/009-docs-truth-pass`
- Conventional commits, e.g. `docs: align credential-storage claims with implementation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the phantom `$schema` line

In `README.md`, delete the line `"$schema": "https://zencommit.dev/config.json",`
from the Full Configuration Schema example (leave the rest of the JSON intact
and still valid — no trailing-comma damage).

**Verify**: `grep -c "zencommit.dev/config.json" README.md` → `0`

### Step 2: Make the credential-storage claims platform-honest

- `README.md:13` bullet → reword to state macOS Keychain with env-var
  fallback elsewhere, e.g.:
  `- **Secure Credential Storage** - API keys stored in the macOS Keychain (environment variables on other platforms)`
- Authentication section intro → reword to the same effect: on macOS, keys go
  to the Keychain and are never written to config files; on Linux/Windows,
  `auth login` is unavailable and keys are supplied via the environment
  variables in the table below.

Keep the wording style of the surrounding README (short, plain sentences).

**Verify**: `grep -n "Keychain" README.md` → at least 2 matches (bullet + auth section)

### Step 3: Fix the AGENTS.md test-location rule and document the mock hook

In `AGENTS.md` "Testing Guidelines":

- Change the location rule to acknowledge both patterns, e.g.:
  `- Unit tests live in tests/unit/ or colocated next to the module as src/**/*.test.ts; integration tests live in tests/integration/. (The build excludes src/**/*.test.ts.)`
- Add one line documenting the test hook, e.g.:
  `- ZENCOMMIT_MOCK_RESPONSE (JSON string) bypasses the LLM call and is parsed as the model response — used by tests/integration/cli-behavior.test.ts.`

**Verify**: `grep -c "ZENCOMMIT_MOCK_RESPONSE" AGENTS.md` → `1`

### Step 4: Full check

**Verify**: `npm run format:check` → exit 0 (run `npm run format` on the two
files first if Prettier objects), then `npm test` → all pass.

## Test plan

No new tests — docs-only change. `npm test` is the regression gate proving no
file outside the two docs was touched by accident.

## Done criteria

- [ ] `grep -c "zencommit.dev/config.json" README.md` → 0
- [ ] README no longer implies cross-platform secure storage (both locations reworded)
- [ ] AGENTS.md acknowledges colocated `src/**/*.test.ts` files and documents `ZENCOMMIT_MOCK_RESPONSE`
- [ ] `npm run format:check` exits 0; `npm test` exits 0
- [ ] `git status` shows only `README.md`, `AGENTS.md` (and `plans/README.md`) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The README lines quoted in "Current state" are not found (another plan's
  edits landed first — report which sections conflict).
- `src/auth/secrets.ts` now contains a non-macOS secret store implementation
  (the platform-honesty rewording would then be wrong).

## Maintenance notes

- If direction option #2 (cross-platform secret store) is ever implemented,
  Step 2's wording must be reverted to the general claim.
- If a JSON schema is ever generated and hosted, re-add the `$schema` line.
- Plans 005 and 008 edit adjacent README sections; whichever lands last
  should re-read the Authentication section for coherence.
