# Plan 006: Harden the commit-message editor flow (cleanup, fallbacks, honest failures)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cd2908e..HEAD -- src/ui/editor.ts tests/unit`
> If `src/ui/editor.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `cd2908e`, 2026-06-10

## Why this matters

When a user picks "Edit" at the commit-confirmation prompt, zencommit opens `$EDITOR` on a temp file. Today that flow has four defects: (1) the temp directory is **never deleted** — one leaks into `$TMPDIR` per edit; (2) if `$EDITOR` is unset, the function silently returns the unedited message — the user picked Edit, nothing happened, no explanation; (3) `$VISUAL` (the conventional first-choice variable) is ignored; (4) the editor string is split on bare spaces, so a quoted path (`EDITOR='"/Applications/My Editor.app/edit" -w'`) breaks, and a non-zero editor exit silently discards the user's edits with no message. These are small, contained fixes in one 43-line file, plus its first test file.

## Current state

`src/ui/editor.ts` — the entire file (43 lines):

```ts
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runEditor = (command: string, args: string[]): Promise<number> =>
  new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
    });

    proc.on('error', () => {
      resolve(1);
    });

    proc.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

export const openEditor = async (initialText: string): Promise<string> => {
  const editor = process.env.EDITOR;
  if (!editor) {
    return initialText;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zencommit-'));
  const filePath = path.join(tempDir, 'COMMIT_EDITMSG');
  await fs.writeFile(filePath, `${initialText.trim()}\n`, 'utf8');

  const [command, ...args] = editor.split(' ');
  if (!command) {
    return initialText;
  }

  const exitCode = await runEditor(command, [...args, filePath]);
  if (exitCode !== 0) {
    return initialText;
  }

  const updated = await fs.readFile(filePath, 'utf8');
  return updated.trim();
};
```

Sole call site: `src/commands/default.ts:244` — `const edited = await openEditor(formatPreview(message.subject, message.body));` inside the interactive confirm flow. The return contract (resolve to a string; on any failure return `initialText`) must be preserved — the caller has no error handling.

User-facing warnings elsewhere in this repo go through `console.warn` (e.g. `src/commands/default.ts:122`, `src/metadata/index.ts:59`). Tests for spawn-based code: `tests/unit/exec.test.ts` (real child processes) and `tests/unit/secrets.test.ts` (injected runners). There is no test file for `editor.ts` yet.

### Conventions

TypeScript ESM strict, arrow-function exports, kebab-case files, Prettier + oxlint zero warnings, conventional commits. New centralized unit tests live in `tests/unit/` (e.g. `tests/unit/editor.test.ts`), importing from `../../src/ui/editor.js`.

## Commands you will need

| Purpose   | Command                                         | Expected on success |
| --------- | ----------------------------------------------- | ------------------- |
| Install   | `npm ci`                                        | exit 0              |
| Typecheck | `npm run typecheck`                             | exit 0              |
| Lint      | `npm run lint`                                  | exit 0, 0 warnings  |
| Tests     | `npx vitest run tests/unit/editor.test.ts`      | all pass            |
| Full gate | `npm run typecheck && npm run lint && npm test` | all exit 0          |

## Scope

**In scope** (the only files you should modify/create):

- `src/ui/editor.ts`
- `tests/unit/editor.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `src/commands/default.ts` — the call site and its contract stay as-is.
- `src/util/exec.ts` — `openEditor` intentionally uses raw `spawn` with `stdio: 'inherit'` (the editor needs the TTY); do not route it through `exec()`.
- Falling back to `git config core.editor` / `git var GIT_EDITOR` — deliberately deferred (couples `ui/` to `git/`); listed in maintenance notes.
- `src/ui/prompts.ts` — separate surface.

## Git workflow

- Branch: `advisor/006-editor-flow-hardening`
- Conventional commits, e.g. `fix(ui): clean up editor temp files and honor VISUAL`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tokenizer for the editor command

Add a small module-local function to `src/ui/editor.ts` (export it for testing):

```ts
export const tokenizeEditorCommand = (editor: string): string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of editor.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token.length > 0);
};
```

Behavior: `'code --wait'` → `['code','--wait']`; `'"/path with spaces/edit" -w'` → `['/path with spaces/edit','-w']`; plain `vim` → `['vim']`. (Deliberately minimal — no escape sequences, no nested quoting; matches what people actually put in `$EDITOR`.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Rework `openEditor`

Rewrite the body preserving the signature `(initialText: string): Promise<string>`:

1. Resolution order: `process.env.VISUAL || process.env.EDITOR`. If neither is set (or tokenizes to empty), `console.warn('No editor configured. Set VISUAL or EDITOR to edit the message; keeping the generated one.');` and return `initialText`.
2. Wrap everything after `mkdtemp` in `try { … } finally { await fs.rm(tempDir, { recursive: true, force: true }); }` so the temp dir is removed on every path (success, non-zero exit, read failure).
3. On non-zero editor exit: `console.warn(\`Editor exited with code ${exitCode}; keeping the original message.\`);`and return`initialText`(from inside the`try`, before the `finally` cleanup runs).
4. Use `tokenizeEditorCommand` instead of `editor.split(' ')`.
5. Keep `runEditor` as-is (its resolve-with-1-on-error shape already maps spawn failure to the "keep original" path — but add the same `console.warn` for that case by checking the exit code as in (3); spawn-error and non-zero-exit can share the warning).

**Verify**: `npm run typecheck && npm run lint` → exit 0.

### Step 3: Tests — `tests/unit/editor.test.ts`

Use real child processes (pattern: `tests/unit/exec.test.ts`), not mocks — `node -e` is a perfectly controllable "editor":

- **Tokenizer** (pure): the three cases from Step 1 plus empty string → `[]` and `'  '` → `[]`.
- **No editor configured**: `vi.stubEnv('VISUAL', '')` + `vi.stubEnv('EDITOR', '')` (and delete them) → returns `initialText` unchanged; `console.warn` called (spy with `vi.spyOn(console, 'warn')`).
- **VISUAL wins over EDITOR**: set `VISUAL` to a `node -e` one-liner that appends a marker line to its last argument (`process.argv` gives the file path): e.g. `node -e "const fs=require('fs');const f=process.argv[1];fs.appendFileSync(f,'\nedited-by-visual')"`. Set `EDITOR` to something that would append a different marker. Assert the returned text contains `edited-by-visual`.
  - Note: the env value contains spaces and double quotes — construct it carefully with single quotes inside the test string, or use a small helper script written to a temp dir by the test and referenced without spaces. The simpler robust route: write `editor.cjs` into a temp dir via the test, set `VISUAL` to `node <abs-path-to-editor.cjs>` (no quotes needed if the temp path has no spaces).
- **Edited content returned trimmed**: editor script overwrites the file with `'new subject\n\nnew body\n'` → resolves to `'new subject\n\nnew body'`.
- **Non-zero exit keeps original**: editor script `process.exit(3)` → returns `initialText`; warn spy called with message containing `exited with code 3`.
- **Temp dir cleanup**: before/after sets of `fs.readdir(os.tmpdir())` entries matching `/^zencommit-/` are equal for both the success and non-zero-exit cases (snapshot the matching names before, assert no new ones remain after).
- `afterEach`: `vi.unstubAllEnvs(); vi.restoreAllMocks();`.

**Verify**: `npx vitest run tests/unit/editor.test.ts` → all pass.

### Step 4: Full gate

**Verify**: `npm run typecheck && npm run lint && npm run format:check && npm test` → all exit 0.

## Test plan

Covered in Step 3 (7 cases). Pattern files: `tests/unit/exec.test.ts` (spawning real `node -e` children), `tests/unit/secrets.test.ts` (env/cleanup discipline).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "split(' ')" src/ui/editor.ts` → no matches
- [ ] `grep -n 'finally' src/ui/editor.ts` → at least one match (cleanup path exists)
- [ ] `grep -n 'VISUAL' src/ui/editor.ts` → at least one match
- [ ] `tests/unit/editor.test.ts` exists; `npx vitest run` exits 0 including it
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` exit 0
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/ui/editor.ts` no longer matches the excerpt (drift).
- The cleanup `finally` interacts badly with `stdio: 'inherit'` on some platform path after one fix attempt (e.g. file still open on Windows) — report rather than removing cleanup.
- Tests are flaky due to tmpdir scanning (parallel test runs creating `zencommit-` dirs) — scope the cleanup assertion to the specific `tempDir` path if needed (assert `fs.access(tempDir)` rejects after the call) and note the substitution; if even that is unreliable, report.

## Maintenance notes

- Deferred on purpose: falling back to `git var GIT_EDITOR` (the full git resolution chain) — it would make `ui/editor.ts` depend on `util/exec.ts` and git; revisit if users ask for parity with `git commit`'s editor selection.
- Reviewer should scrutinize: the `finally` placement (cleanup must not run before `readFile`), and that the no-editor warning goes to stderr-compatible `console.warn`, not `console.log` (stdout carries the message preview in this CLI).
- If a future change routes editor spawning through `util/exec.ts`, it must preserve `stdio: 'inherit'` — the current `exec()` pipes stdio and would break interactive editors.
