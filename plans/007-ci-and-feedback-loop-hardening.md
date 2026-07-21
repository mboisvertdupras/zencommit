# Plan 007: CI matrix, audit gate, and a fast local test loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- .github/workflows/ci.yml package.json AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

zencommit is a published npm CLI with `engines.node: >=22.14.0`, but CI tests exactly one Node version (22.14.0) — a user on Node 24 runs code no pipeline ever exercised. The README and AGENTS.md both list `npm audit --audit-level=low` as a quality gate, but CI never runs any audit, and a known moderate advisory (`ws` GHSA-58qx-3vcg-4xpx, via `gitlab-ai-provider → socket.io-client → engine.io-client`) sits unwatched. Locally, `npm test` triggers a full rebuild via the `pretest` hook (~typecheck + clean + compile + asset copy + dist verify) even when iterating on a pure unit test. Three small changes: a Node version matrix, an audit job that matches what the docs promise, and a fast `test:unit` path that skips the build.

## Current state

`.github/workflows/ci.yml` (the entire file, 22 lines):

```yaml
name: CI
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '22.14.0'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run build
      - run: npm run test:run
```

`package.json` scripts (lines 14–30): `"pretest": "npm run build"`, `"test": "npm run test:run"`, `"test:run": "vitest run"`. The build chain: `"build": "npm run typecheck && npm run clean && npm run build:ts && npm run build:assets && npm run build:verify"`.

Test layout: unit tests live in `tests/unit/` and colocated `src/**/*.test.ts` — **none of them require `dist/`**. Only `tests/integration/` spawns the built CLI: `tests/helpers/cli.ts` hardcodes `dist/index.js`. So a no-build unit loop is sound as long as it excludes `tests/integration`.

Current audit reality (verified at plan time): `npm audit --audit-level=low` exits non-zero with 2 moderate findings (`ws` 8.0.0–8.20.0 via `engine.io-client`; chain: `gitlab-ai-provider@6.6.0 → socket.io-client@4.8.3 → engine.io-client@6.6.4 → ws@8.18.3`). `npm audit fix` may resolve it if `engine.io-client`'s range admits `ws@8.21+`; that is Step 3's experiment.

`AGENTS.md` "Build, Test, and Development Commands" section lists the command set that must stay accurate. There is also a `release.yml` workflow (npm trusted publishing) — out of scope.

### Conventions

CI uses `actions/checkout@v6` / `actions/setup-node@v6` (recently bumped for Node 24 runtimes — see commit `cd2908e`). Conventional commits, e.g. `ci: bump actions to Node 24 runtimes`.

## Commands you will need

| Purpose       | Command                                                                 | Expected on success                  |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| Install       | `npm ci`                                                                | exit 0                               |
| Audit (probe) | `npm audit --audit-level=moderate`                                      | currently exit ≠ 0 (the ws advisory) |
| Audit (gate)  | `npm audit --audit-level=high`                                          | exit 0 today                         |
| Unit loop     | `npm run test:unit` (created in Step 2)                                 | all pass, no build                   |
| Full tests    | `npm test`                                                              | all pass                             |
| YAML sanity   | `node -e "console.log('ok')"` + push to a branch for Actions validation | —                                    |

## Scope

**In scope** (the only files you should modify):

- `.github/workflows/ci.yml`
- `package.json` (scripts only — no dependency changes except those made by `npm audit fix` to `package-lock.json` in Step 3, if it succeeds)
- `package-lock.json` (only via `npm audit fix`)
- `AGENTS.md` (commands section)

**Out of scope** (do NOT touch, even though they look related):

- `.github/workflows/release.yml` — publishing flow, separately owned.
- `engines` field in `package.json` — keep `>=22.14.0`.
- Adding husky/lint-staged/pre-commit hooks — considered and rejected for now (single-maintainer repo, CI is the gate; see plans/README.md).
- Removing the `pretest` hook — keep `npm test` building first (integration tests need fresh `dist/`); we add a _parallel_ fast path instead.

## Git workflow

- Branch: `advisor/007-ci-hardening`
- Conventional commits, e.g. `ci: add node matrix and audit gate`.
- Do NOT push or open a PR unless the operator instructed it (workflow validation requires a push — coordinate with the operator; see Step 5).

## Steps

### Step 1: Node version matrix

In `.github/workflows/ci.yml`, convert the single job to a matrix:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: ['22.14.0', '24.x']
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run build
      - run: npm run test:run
```

**Verify**: `npx yaml --help >/dev/null 2>&1 || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"` → `yaml ok` (or equivalent YAML parse check).

### Step 2: Fast unit-test script

In `package.json` scripts, add (keeping existing scripts untouched):

```json
"test:unit": "vitest run --exclude '**/tests/integration/**'",
```

Then check the exclusion semantics empirically — Vitest's `--exclude` _adds_ to default excludes. Expected: `npm run test:unit` runs all colocated `src/**/*.test.ts` and `tests/unit/**` files but zero files from `tests/integration/`. If the flag form doesn't exclude correctly in this Vitest major (4.x), use the project-glob alternative: `"test:unit": "vitest run src tests/unit"`.

Update `AGENTS.md`'s command list: add `npm run test:unit` — "fast unit suite, no build required (integration tests need `npm test`)".

**Verify**: `npm run test:unit` → exits 0, output lists no `tests/integration/` files; `rm -rf dist && npm run test:unit` → still exits 0 (proves no dist dependency); then `npm run build` to restore `dist/`.

### Step 3: Try to clear the ws advisory

Run `npm audit fix` (lockfile-only changes expected). Then `npm audit --audit-level=low`:

- If it now exits 0: commit the lockfile change as `fix(deps): resolve ws advisory via npm audit fix`, and use `--audit-level=low` in Step 4's gate (matching the documented promise).
- If the advisory remains (transitive range too narrow): revert any lockfile churn (`git checkout -- package-lock.json`), and use `--audit-level=high` in Step 4 so CI gates on what it can actually enforce. Record the residual advisory in your final report and in `plans/README.md` under backlog.

**Verify**: `npm ci && npx vitest run` → all pass (whichever branch was taken).

### Step 4: Audit job in CI

Append a second job to `ci.yml` (independent of the matrix job):

```yaml
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with:
        node-version: '22.14.0'
        cache: 'npm'
    - run: npm ci
    - run: npm audit --audit-level=<level from Step 3>
```

**Verify**: YAML parse check as in Step 1; locally run the exact audit command → exit 0.

### Step 5: Validate on GitHub Actions

Workflow changes can only be fully validated by Actions itself. Ask the operator to push the branch (or push if the operator pre-authorized it). Both matrix legs and the audit job must go green.

**Verify**: `gh run list --branch advisor/007-ci-hardening --limit 3` shows the CI run with conclusion `success` (or report the failing leg verbatim).

## Test plan

No new test files. The verification is the CI run itself (Step 5) plus the local proofs in Steps 2–4 (`test:unit` passes without `dist/`; audit command exits 0 at the chosen level).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c 'matrix' .github/workflows/ci.yml` → ≥ 1; `grep -c "24.x" .github/workflows/ci.yml` → 1
- [ ] `grep -c 'npm audit' .github/workflows/ci.yml` → 1
- [ ] `npm run test:unit` exits 0 with `dist/` deleted (restore `dist/` after via `npm run build`)
- [ ] `npm audit --audit-level=<chosen level>` exits 0 locally
- [ ] AGENTS.md lists `test:unit`
- [ ] CI green on both matrix legs + audit job (or explicitly reported as blocked on push authorization)
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm audit fix` changes any `dependencies` semver range in `package.json` (it should only touch the lockfile) — revert and report.
- The Node 24 matrix leg fails — that is a _discovery_, not a bug in this plan; report the failure output verbatim and leave the matrix in place with the leg marked `continue-on-error: true` only if the operator approves.
- Vitest exclusion can't be made to skip integration tests with either form in Step 2.
- You cannot push and the operator is unavailable — complete Steps 1–4, mark the plan BLOCKED on Step 5 in `plans/README.md`.

## Maintenance notes

- When Node 26 becomes LTS, extend the matrix; when `engines` floor moves, move the lower leg with it.
- If Step 3 left the ws advisory in place at `--audit-level=high`: revisit when `gitlab-ai-provider` updates `socket.io-client` (or when plan 004's lazy loading enables dropping/optionalizing the GitLab provider). Watching: GHSA-58qx-3vcg-4xpx.
- Reviewer should scrutinize: that `pretest` still exists (integration tests must keep building first) and that `test:unit` genuinely excludes integration files rather than silently running zero tests (compare the reported test counts: `test:unit` should run fewer files than `test:run`, not zero).
