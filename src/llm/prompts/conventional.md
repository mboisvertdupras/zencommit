Follow the Conventional Commits specification (v1.0.0) precisely.

### Format

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

For this tool, output only the subject line in "subject" and the body (if requested) in "body".

### Structure Rules

1. **Type** (required): A noun describing the category of change. Must be lowercase.
2. **Scope** (optional): A noun in parentheses describing the section of the codebase (e.g., `feat(parser):`).
3. **Breaking change indicator** (optional): A `!` immediately before the `:` signals a breaking change.
4. **Description** (required): A short summary immediately after the colon and space.
5. **Body** (optional): Free-form text providing additional context, separated from subject by a blank line.

### Allowed Types

Choose the single most appropriate type based on the primary purpose of the change:

| Type       | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| `feat`     | A new feature visible to users or a significant capability addition       |
| `fix`      | A bug fix that corrects incorrect behavior                                |
| `docs`     | Documentation-only changes (README, comments, JSDoc, etc.)                |
| `style`    | Code style/formatting changes that do not affect logic (whitespace, etc.) |
| `refactor` | Code restructuring that neither fixes a bug nor adds a feature            |
| `perf`     | Performance improvements without functional changes                       |
| `test`     | Adding, updating, or fixing tests (no production code changes)            |
| `build`    | Changes to build system, dependencies, or tooling (npm, webpack, etc.)    |
| `ci`       | Changes to CI/CD configuration (GitHub Actions, Jenkins, etc.)            |
| `chore`    | Maintenance tasks that don't fit other categories (deps update, cleanup)  |
| `revert`   | Reverts a previous commit (reference the reverted commit in body)         |

### Type Selection Guidelines

- **feat vs refactor**: If the change adds new behavior users can observe, it's `feat`. If it restructures existing code without changing behavior, it's `refactor`.
- **fix vs refactor**: If the code was broken and now works correctly, it's `fix`. If the code worked before and still works the same way, it's `refactor`.
- **chore vs build**: Build system changes (webpack config, tsconfig) use `build`. Generic maintenance (updating .gitignore, cleaning up old files) uses `chore`.
- **docs vs style**: Changes to documentation/comments use `docs`. Formatting changes to code itself use `style`.

### Scope Guidelines

- Use lowercase, kebab-case for scopes (e.g., `feat(user-auth):`, `fix(api-client):`).
- Scope should identify the module, component, or area affected.
- Common scopes: `api`, `ui`, `cli`, `config`, `core`, `deps`, `auth`, `db`, module names, component names.
- Omit scope if the change is broad or the scope is obvious from context.
- Be consistent with scopes used in the repository's existing commit history.

### Description Rules

1. Use imperative, present-tense verbs: "add", "fix", "update", "remove", "refactor" (not "added", "fixes", "updating").
2. Start with a lowercase letter (unless it's a proper noun or acronym).
3. Do not end with a period.
4. Be specific but concise - aim for clarity in under 50 characters when possible (hard limit is the configured max).
5. Describe _what_ the commit does when applied, not what you did.

### Breaking Changes

If the commit introduces a breaking change (incompatible API change, removed feature, etc.):

- Add `!` before the colon: `feat(api)!: remove deprecated endpoints`
- Optionally explain in the body with `BREAKING CHANGE: <explanation>`

### Examples

**Simple feature:**

```
feat(auth): add OAuth2 login support
```

**Bug fix with scope:**

```
fix(parser): handle empty input without throwing
```

**Refactor without scope:**

```
refactor: extract validation logic into separate module
```

**Breaking change:**

```
feat(api)!: change response format to JSON:API spec
```

**Documentation:**

```
docs: update installation instructions for Windows
```

**Build/dependencies:**

```
build(deps): upgrade TypeScript to v5.3
```

**Chore:**

```
chore: remove unused development scripts
```

**With body (when body is enabled):**

```
fix(cache): prevent stale data on concurrent requests

Race condition occurred when multiple requests invalidated
the cache simultaneously. Added mutex lock to ensure
atomic read-modify-write operations.
```
