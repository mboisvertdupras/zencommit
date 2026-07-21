# Implementation Plans

Round 1 is complete. All 13 plans from the 2026-06-10 audit (at `cd2908e`,
promoted 2026-07-21) were executed on `chore/audit-remediation`, merged via
PR #2, and released as **v0.3.0** on 2026-07-21. The individual plan documents
are preserved in git history (tag `v0.3.0`, `plans/` directory).

Next `/improve` run: audit fresh from the sections below; keep plan numbering
monotonic — the next plan is `014`.

## Backlog — vetted findings, deliberately not planned

- **`getFileSummary` rename-path matching** (correctness, S, LOW): numstat↔name-status path joining for renames relies on three fallback map lookups (`src/git/diff.ts:78-92`); renames with tabs/odd formats can show `(+? -?)`. Cosmetic. Revisit only if a rename-display bug is actually reported.

## Direction options (maintainer decisions, not defects)

Grounded in repo evidence as of v0.3.0; effort estimates are coarse:

1. **`prepare-commit-msg` hook integration** (`zencommit hooks install`) — all building blocks exist: non-interactive `--yes`, `--dry-run`, exit-code contract, staged-diff default. The classic adjacent feature for commit-message generators; would need a `--batch` audit of every interactive path. Effort ~M.
2. **Cross-platform secret store** — `SecretStore` is an interface with an injectable implementation (`src/auth/secrets.ts`); adding libsecret (Linux) / Credential Manager (Windows) backends, or an encrypted-file fallback, closes the platform gap for non-mac users of a public npm package. Effort M–L. (If implemented, revert the macOS-only wording plan 009 added to README.)
3. **Expose gitmoji via CLI** — a complete `src/llm/prompts/gitmoji.md` exists and is wired to `commit.emoji` config, but no `--emoji` flag exists (`--format` only offers conventional|freeform). One yargs option + `applyCliOverrides` line. Effort S.
4. **PR-description / changelog generation** — the diff→truncate→prompt pipeline (`truncate.ts`, `tokens.ts`, `prompt.ts`) is commit-message-agnostic; a second command reusing it with different templates is cheap relative to its surface value. Spike first. Effort M.

## Findings considered and rejected

(So nobody re-audits them.)

- **"Default model `openai/gpt-5` does not exist" (audit DOCS-03)**: false — `gpt-5` exists in the models.dev dataset; the default config is functional.
- **"Metadata fallback is silent" (audit CORRECTNESS-09)**: false — the default command warns and falls back to conservative token limits.
- **Commit-subject argument injection via leading `-` (audit SECURITY-02)**: not exploitable — the subject is the argv value consumed by `-m`; `spawn` without a shell prevents the rest.
- **Verbose logs print the diff/prompt at `-vvv` (audit SECURITY-01)**: by design — explicit opt-in debug verbosity on a local tool printing the user's own diff to stderr.
- **Secrets injected into `process.env` inherited by children (audit SECURITY-04)**: by design — env vars are the AI SDKs' documented credential channel; children spawned are git and the user's editor.
- **Keychain account names reveal configured providers (audit SECURITY-09)**: accepted trade-off; the auditor itself concluded no action needed.
- **`metadata.providers.local.path` path traversal (audit SECURITY-06)**: config is user/repo-controlled and the file content is only parsed as model metadata; reading files is what config does.
- **Zod/schema-based config validation rewrite (audit DEBT-04)**: not worth it — the hand-rolled validator is small, complete, and tested (range checks landed in plan 011).
- **Truncation strategy dispatch consolidation (audit DEBT-05), `maxFiles` enforcement location (DEBT-07)**: cosmetic; cost of churn exceeds benefit.
- **Pre-commit hooks (audit DX-02)**: rejected for now — single-maintainer repo, CI is the enforcement point; revisit if contributor count grows.
- **`security find-generic-password` per key in `auth status` (~24 sequential spawns)**: cosmetic latency in a rarely-run command.
