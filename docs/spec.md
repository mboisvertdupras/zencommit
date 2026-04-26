# Build Spec — `zencommit` (AI Commit Message CLI)

**Purpose:** This document is the _implementation spec_ for the current Node.js + TypeScript CLI that generates git commit messages using an LLM. Current package metadata requires Node.js `>=22.14.0` and npm-based installs; Bun references belong only to historical migration inventory.

**Working identifiers (use these consistently in code):**

- CLI binary name: `zencommit`
- Project config file: `zencommit.json`
- Global config path (XDG): `${XDG_CONFIG_HOME:-$HOME/.config}/zencommit/config.json`
- Env vars:
  - `ZENCOMMIT_CONFIG` (path to JSON config)
  - `ZENCOMMIT_CONFIG_CONTENT` (inline JSON config content)

---

## 1) Product behavior

### 1.1 Core job

`zencommit` inspects git changes, sends a bounded diff to an LLM, receives a structured commit message, and optionally runs `git commit`.

### 1.2 Hard constraints (MUST)

1. **No provider adapters.** Do not implement custom per-provider HTTP clients.
2. **Use Vercel AI SDK** for model calls.
3. **Use a pluggable metadata provider** for model specs/limits/pricing/features. Default provider: **models.dev** (metadata only; not a model provider).
4. **Diff size MUST be auto-capped** based on the selected model’s token limits from the active metadata provider (models.dev by default).
5. **Config MUST be standard JSON** and merged (not replaced) across sources.
6. **Provide **``** UX** and store secrets **ONLY** via a **secure-store adapter** (never in config).
7. **Node.js + TypeScript** with minimal deps. Allowed deps (MVP):
   - `ai` (Vercel AI SDK)
   - `yargs`
   - `@clack/prompts`

---

## 2) CLI commands

### 2.1 Default command: `zencommit`

**Behavior:**

- Reads staged diff by default.
- Generates commit subject/body.
- Shows preview.
- Prompts to commit unless `--yes`.

**Flags (MVP):**

- `--version` (boolean): show the installed package version.
- `--help` (boolean): show top-level or subcommand help.
- `--yes` (boolean): skip confirmation and commit immediately.
- `--dry-run` (boolean): do not call `git commit`; print output.
- `--all` / `-a` (boolean): stage all (`git add -A`) before generating message.
- `--unstaged` (boolean): use unstaged diff; never commits unless `--commit` is explicitly provided.
- `--commit` (boolean): allow committing even with `--unstaged`.
- `--push` / `-p` (boolean): push after committing.
- `--model <id>`: override model id for this run.
- `--format <conventional|freeform>`: override commit style.
- `--lang <code>`: override language.
- `--no-body` (boolean): generate subject-only.
- `--verbose` / `-v`, `-vv`, `-vvv` (count): increase verbosity (never secrets).
- `--` passthrough: anything after `--` is forwarded to `git commit`.

**Exit codes (MVP):**

- `0` success
- `2` config/auth error
- `3` git error / no diff
- `4` model call error

### 2.2 `zencommit auth`

#### `zencommit auth login`

Secrets are stored **ONLY** via the secure-store adapter and MUST **never** be written to any config file.

Config may store only non-sensitive metadata (e.g., preferred key name and scope/label selection).

Flow:

1. Select which provider key to store (no custom keys):
   - OpenAI → `OPENAI_API_KEY`
   - Anthropic → `ANTHROPIC_API_KEY`
   - Google Gemini → `GOOGLE_GENERATIVE_AI_API_KEY` (also accept `GEMINI_API_KEY` at runtime)
2. Prompt for the secret value (masked input).
3. Store the secret in the secure store under the deterministic label: `zencommit:<ENV_KEY>`.
4. (Optional) Write non-sensitive metadata to config (merge-preserving), e.g. `auth.preferredEnvKey`.
5. Verify (best-effort): run a tiny model call with a 5s timeout and report success/failure.

**Fallback credential resolution (used at runtime and by **``**):**

1. If a secret exists in the secure store for the selected label, use it.
2. Else, If `process.env[ENV_KEY]` is set, use it.
3. Else, scan `process.env` for common provider keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_API_KEY`, etc.).

Non-interactive:

- `zencommit auth login --env-key OPENAI_API_KEY --token <value>`

#### `zencommit auth logout`

- `zencommit auth logout --env-key OPENAI_API_KEY`
- Deletes the secret from the secure store for label `zencommit:<ENV_KEY>` (does not touch config).

#### `zencommit auth status`

- Prints which secrets are present (masked), and whether the selected execution mode is authenticated.

**Security requirements for auth commands:**

- Never print full secrets.
- Never write secrets to config files.
- When printing status, show only whether a secret exists for a key (and optionally the last 4 chars if the secure-store backend supports safe retrieval for display—otherwise omit).

### 2.3 `zencommit config`

- `zencommit config print` prints resolved config and shows which source each top-level key came from (mask secrets).
- `zencommit config init` writes a starter `zencommit.json` in repo.
- `zencommit config validate` validates resolved config; errors with actionable messages.

### 2.4 `zencommit models`

Uses the active **metadata provider** (models.dev by default) and cached metadata to search and inspect models.

- `zencommit models search [query]`: search by id/name.
  - `--max-items <number>` limits displayed search/autocomplete results (default `10`).
- `zencommit models info <modelId>`: show token limits, capabilities, and pricing.

---

## 3) Configuration

### 3.0 XDG Base Directory rules (MUST)

On Unix-like systems, all user paths MUST follow the XDG Base Directory Specification:

- Config root: `${XDG_CONFIG_HOME:-$HOME/.config}`
- Cache root: `${XDG_CACHE_HOME:-$HOME/.cache}`

`zencommit` MUST store configuration under the config root and non-essential downloaded data (like metadata caches) under the cache root.

### 3.1 Config sources and merge precedence

Settings are merged together. Later sources override earlier ones only for conflicting keys. Non-conflicting settings are preserved.

Load in this order:

1. **Global (XDG):** `${XDG_CONFIG_HOME:-$HOME/.config}/zencommit/config.json`
2. **Custom path:** file at `$ZENCOMMIT_CONFIG`
3. **Project:** `zencommit.json` at repo root (or nearest parent containing a `.git` dir; see 6.1)
4. **Inline:** JSON from `$ZENCOMMIT_CONFIG_CONTENT`

### 3.2 Merge semantics (MUST)

- Objects: deep merge recursively.
- Scalars: later wins.
- Arrays: later replaces earlier.

### 3.3 Config schema (MVP)

```json
{
  "$schema": "https://zencommit.dev/config.json",
  "ai": {
    "model": "openai/gpt-5",
    "temperature": 0.2,
    "maxOutputTokens": 4096,
    "timeoutMs": 20000,
    "openaiCompatible": {
      "baseUrl": "https://example.com/v1",
      "name": "my-openai-compatible"
    }
  },
  "commit": {
    "style": "conventional",
    "language": "en",
    "includeBody": true,
    "emoji": false
  },
  "git": {
    "diffMode": "staged",
    "autoStage": false,
    "confirmBeforeCommit": true
  },
  "diff": {
    "truncateStrategy": "smart",
    "includeFileList": true,
    "excludeGitignoreFiles": true,
    "maxFiles": 200,
    "smart": {
      "maxAddedLinesPerHunk": 12,
      "maxRemovedLinesPerHunk": 12
    }
  },
  "metadata": {
    "provider": "auto",
    "fallbackOrder": ["modelsdev", "local"],
    "providers": {
      "modelsdev": {
        "url": "https://models.dev/api.json",
        "cacheTtlHours": 24
      },
      "local": {
        "path": "./models.metadata.json"
      }
    }
  }
}
```

---

## 4) Metadata providers (model specs)

### 4.1 Purpose

Metadata providers supply **model limits** (input/context/output tokens) plus optional capabilities and pricing so `zencommit` can:

- auto-cap diffs to fit the selected model
- show model info via `zencommit models info/search`

Metadata is **never** used to call models.

### 4.2 Provider abstraction (MUST)

Implement a provider interface so metadata is not hard-coded to models.dev.

**Canonical internal shape (MUST):**

- `id` (string, e.g., `openai/gpt-5`)
- `name` (string)
- `limits.context` (number | null)
- `limits.input` (number | null)
- `limits.output` (number | null)
- `pricing` (optional; passthrough for display)
- `capabilities` (optional; passthrough for display)

**Provider methods (MUST):**

- `getModel(modelId) -> ModelMetadata | null`
- `search(query, limit?) -> ModelMetadata[]`

Optional:

- `list(limit?)`
- `refresh()`

### 4.3 Provider selection + fallback (MUST)

Config drives selection:

- `metadata.provider`:
  - `"modelsdev"` → use only models.dev
  - `"local"` → use only local provider
  - `"auto"` (default) → try providers in `metadata.fallbackOrder` until the model is found

If a provider is unreachable:

- it must fall back to its cache (if any) before failing
- in `auto` mode, the resolver then tries the next provider

### 4.4 Default provider: models.dev (remote)

- Fetch from `metadata.providers.modelsdev.url` (default `https://models.dev/api.json`).
- Cache at `${XDG_CACHE_HOME:-$HOME/.cache}/zencommit/metadata/modelsdev.cache.json`.
- Respect `metadata.providers.modelsdev.cacheTtlHours`.

Failure behavior:

- If remote fetch fails, use cache if present (warn if stale).

### 4.5 Local provider (offline)

- Reads a local JSON file from `metadata.providers.local.path`.
- Recommended format: a saved snapshot of models.dev `api.json` so it works as a drop-in offline fallback.
- The provider MUST normalize its input into the canonical internal shape.

### 4.6 Final fallback behavior (MUST)

If metadata cannot be resolved for a model:

- `zencommit` should proceed with conservative defaults for budgeting (e.g., input cap 8,000 tokens) and warn.
- `zencommit models info <id>` should error with an actionable message suggesting switching metadata provider or providing a local metadata file.

## 5) Automatic diff token capping

### 5.1 Goal

Automatically cap diff content so the request stays within model limits.

### 5.2 Token budgets

Let:

- `L_in` = `model.limit.input` (if missing, fallback to `model.limit.context`)
- `L_ctx` = `model.limit.context` (if missing, treat as Infinity)
- `L_out` = `model.limit.output` (if missing, treat as Infinity)
- `O_cfg` = `config.ai.maxOutputTokens`
- `O` = `min(O_cfg, L_out)`

We need input tokens ≤ `L_in` and total tokens (input + output) ≤ `L_ctx`.

### 5.3 Token estimation (MUST)

Use `tiktoken` to count tokens (avoid handwritten estimators).

- Determine an encoding for token counting:
  - If a model-specific encoding mapping is available, use it.
  - Otherwise default to a widely compatible encoding used by `tiktoken` (document the chosen default in code).
- Token counting must be performed for:
  - `promptWithoutDiff`
  - candidate diff payloads during truncation

Note: token counting is for budgeting only; it does not need to match provider tokenization perfectly, but must be consistent and conservative.

### 5.4 Compute diff budget (MUST)

1. Build the full prompt **without** the diff (include instructions + file list + formatting requirements).
2. `T_overhead = estimateTokens(promptWithoutDiff)`
3. `T_input_max = min(L_in, L_ctx - O)` (if `L_ctx` is Infinity, ignore that term)
4. `T_available = T_input_max - T_overhead`
5. If `T_available <= 0`: do **summary-only** mode (file list + stats, no hunks).

### 5.5 Truncation strategies (MVP)

The goal is to maximize **signal per token**. `zencommit` MUST support at least two truncation strategies.

#### Strategy: `byFile`

- Parse a unified diff by file using `diff --git` boundaries.
- For each file section, keep:
  - header lines (`diff --git`, `---`, `+++`)
  - hunk header lines (`@@ ... @@`)
  - up to N changed lines until budget is used
- Allocation:
  - Start by giving each file a minimum quota (e.g., 120 tokens) until you hit budget or exhaust files.
  - Distribute remaining budget proportionally by original file section size.
- Always append a clear truncation marker when content was cut.

#### Strategy: `smart` (recommended)

`smart` compresses the diff _before_ truncating by: removing low-value noise, reducing context, and sampling the most informative changed lines.

**Stage A — Always include a compact file summary (MUST):** Include a short summary before any hunks:

- `git diff --cached --name-status`
- `git diff --cached --numstat` Render as one line per file: `<status> <path> (+A -D)` and include rename targets when applicable.

**Stage B — Compute a compact diff (MUST):** For `smart`, compute the diff using options that reduce verbosity:

- `--unified=0` (no surrounding context)
- `--no-color`
- `--no-ext-diff`
- `--diff-algorithm=histogram`
- `--no-prefix` (drops `a/` and `b/` prefixes)

Then post-process to remove low-signal lines:

- Drop `index ...` lines.
- For binary files, replace the entire section with a single marker: `BINARY FILE CHANGED (<path>)`.

**Stage C — Hunk prioritization + sampling (MUST):** Parse the compact diff into file sections and hunks, then select hunks until the token budget is reached.

Suggested scoring heuristics (keep simple):

- De-prioritize generated paths (e.g., `dist/`, `build/`, `vendor/`, lockfiles, minified files).
- Prefer source-code extensions over images/docs when budget is tight.
- Prefer smaller hunks over huge hunks (higher signal density).
- Boost hunks that contain likely “definition” lines (examples: `+ export function`, `+ class`, `+ interface`, `+ type`, `+ def`).

For each selected hunk, include:

- the hunk header line (`@@ ... @@`)
- up to `diff.smart.maxAddedLinesPerHunk` added lines and `diff.smart.maxRemovedLinesPerHunk` removed lines
- always keep any “definition” lines even if that displaces other lines
- if lines are omitted, append a compact omission marker: `… omitted (+X additions, -Y deletions)`

**Stage D — Graceful degradation (MUST):** If still too large:

1. Drop hunk bodies for low-priority files; keep only file summary + hunk headers.
2. If still too large, keep only the file summary.

**Token counting performance note (MUST):** Avoid O(n^2) token counting loops. Tokenize per chunk (file summary, each sampled hunk) once, then accumulate counts.

### 5.6 Runtime retry safety

If the model/provider returns a “context/input too large” error:

- Retry up to 2 times by reducing `T_available` by 30% each retry.

---

## 6) Git behavior

### 6.1 Repo discovery

- Determine repo root via `git rev-parse --show-toplevel`.
- Project config discovery:
  - Use repo root returned above.
  - Look for `${repoRoot}/zencommit.json`.

### 6.2 Diff modes

- staged (default): `git diff --cached --no-color`
- unstaged: `git diff --no-color`
- all: `git add -A` then staged diff

### 6.3 Commit execution

- If committing, use:
  - `git commit -m <subject>`
  - If body non-empty: `git commit -m <subject> -m <body>`
- Forward args after `--`.

---

## 7) LLM request + response specification

### 7.1 Output contract (MUST)

The model must produce a JSON object:

```json
{
  "subject": "...",
  "body": "..."
}
```

Rules:

- `subject` required, single line.
- `body` optional; may be empty string.
- If conventional style: `subject` must match `type(scope?): subject`.
- Enforce `maxSubjectChars`.

### 7.2 Use AI SDK structured output (preferred)

Use AI SDK’s structured output support via JSON schema (no zod dependency).

- Use `generateObject` with a JSON schema representing `{ subject: string, body: string }`.
- If structured output fails, fallback:
  1. `generateText` with strict JSON instruction.
  2. Parse JSON.
  3. If invalid, run a single repair prompt: “Return ONLY valid JSON matching schema.”

### 7.3 Prompt template (MVP)

System:

- You write concise, accurate git commit messages.
- Follow requested style and constraints.
- Never mention that you are an AI.

User:

- Provide:
  - style + language
  - max subject chars
  - file list (paths)
  - truncated diff content
- Ask for JSON output with required keys.

### 7.4 Post-processing (MUST)

- Trim whitespace.
- Convert Windows line endings to `\n`.
- If subject exceeds max chars: hard-trim with ellipsis only if configured; otherwise re-prompt once with stricter instruction.

---

## 8) Auth + execution mode

### 8.1 Default execution mode

Use provider API keys with the Vercel AI SDK.

- The configured model is passed as a plain string: `provider/model`.
- Authentication uses the provider’s standard env var name, e.g.:
  - `openai/*` → `OPENAI_API_KEY`
  - `anthropic/*` → `ANTHROPIC_API_KEY`
  - `google/*` → `GOOGLE_GENERATIVE_AI_API_KEY` (also accept `GEMINI_API_KEY`)

### 8.2 Secrets to env (MUST)

Before calling the AI SDK, ensure the required provider key is present:

1. Attempt to load `KEY` from the secure-store label `zencommit:<KEY>` and set it in-memory.
2. Else, scan for equivalent keys in `process.env` (e.g., for Gemini accept `GEMINI_API_KEY` as equivalent to `GOOGLE_GENERATIVE_AI_API_KEY`).

If no credential is available, fail with exit code `2` and an actionable message suggesting `zencommit auth login`.

---

## 9) Project structure (MUST)

```
/zencommit
  package.json
  tsconfig.json
  src/
    index.ts              # yargs entry
    commands/
      default.ts
      auth.ts
      config.ts
      models.ts
    config/
      load.ts             # load sources
      merge.ts            # deep merge
      types.ts
      validate.ts
    auth/
      secrets.ts          # read/write secrets via secure-store adapter (no config persistence)
    metadata/
      index.ts             # provider registry + resolver (auto/fallback)
      types.ts
      cache.ts             # shared caching helpers
      providers/
        modelsdev.ts       # remote models.dev provider (metadata only)
        local.ts           # local JSON provider (offline)
    git/
      repo.ts
      diff.ts
      commit.ts
    llm/
      prompt.ts
      generate.ts
      truncate.ts
      tokens.ts
    ui/
      prompts.ts
      editor.ts
    util/
      fs.ts
      exec.ts
      redact.ts
```

Implementation notes:

- Prefer Node `child_process` wrappers for running git.
- Keep modules small and pure (easy for tests).

---

## 10) Tests (MVP)

### 10.1 Unit tests

- config deep merge (objects/scalars/arrays)
- config precedence order
- token estimation + diff budget computation
- diff parsing and truncation by file

### 10.2 Integration tests

Create a temp git repo:

- stage a file change → run `zencommit --dry-run` (mock LLM) → verify output format
- run `zencommit --yes --dry-run` doesn’t prompt

### 10.3 Mocking LLM

LLM module must be injectable:

- `generateCommitMessage(input, deps)` where deps includes `callModel()`.

---

## 11) Build order checklist (for the AI agent)

1. Initialize Node.js + TS project, set up `yargs` entry.
2. Implement config load + merge + validate.
3. Implement metadata providers (models.dev default + local offline provider) + caching/resolution.
4. Implement git repo discovery + diff collection.
5. Implement prompt builder (without diff), token estimator, budget, truncation.
6. Implement AI SDK call (structured output) and fallback parsing.
7. Implement default command UX with clack (confirm/edit).
8. Implement `auth` commands and secret persistence via the secure-store adapter.
9. Add tests (unit + integration), ensure no secrets leak.
10. Ship `zencommit config init/print/validate` and `zencommit models` commands.

---

## 12) Definition of Done (MVP)

- `zencommit` generates a valid commit message and can commit.
- Diff auto-capping works with different models using metadata-provider token limits (models.dev by default).
- `auth login` stores keys only in the secure store (never in config).
- No provider adapters exist; AI SDK is the only model interface.
- Config merging works exactly as specified.
