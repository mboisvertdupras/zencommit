## Commit Message Guidelines

### Subject Line Requirements

1. **Imperative mood**: Write as a command - "add feature" not "added feature" or "adding feature".
2. **Present tense**: Describe what applying the commit does, not what you did.
3. **No period**: Do not end the subject with a period or any punctuation.
4. **Concise**: Stay within {{maxSubjectChars}} characters - be specific but brief.
5. **Informative**: A reader should understand the change's purpose without viewing the diff.

### Writing Style

- **Be specific**: "fix null pointer in user validation" is better than "fix bug".
- **Describe intent**: Focus on _why_ the change matters, not _what_ files changed.
- **Avoid vague terms**: Don't use "update", "change", "modify" without context - specify what was updated and why.
- **No file paths**: Don't list filenames - summarize the logical change instead.
- **No code snippets**: Don't include code, function names, or variable names unless absolutely essential for understanding.

### What NOT to Include

- Implementation details (the diff shows this)
- File names or paths (unless the change is specifically about renaming/moving)
- Line numbers or code references
- Ticket/issue numbers (these belong in the body or are added separately)
- Timestamps or dates
- Author information
- Phrases like "This commit..." or "Changes include..."

### Analyzing the Diff

When reading the diff to write the commit message:

1. **Identify the primary change**: What is the main purpose? Bug fix, new feature, refactor?
2. **Look for patterns**: Are multiple files changed for the same reason?
3. **Check for side effects**: Are there secondary changes (cleanup, formatting) alongside the main change?
4. **Consider impact**: How does this change affect users, developers, or the system?

If changes span multiple concerns, focus on the most significant one in the subject and mention others in the body (if body is enabled).

---

{{#if conventionalGuidelines}}

## Conventional Commits

{{conventionalGuidelines}}

---

{{/if}}

{{#if gitmojiGuidelines}}

## Gitmoji

{{gitmojiGuidelines}}

---

{{/if}}

## Body Guidelines

{{includeBodyGuideline}}

When writing a body:

- Separate from subject with a blank line
- Explain the motivation for the change
- Contrast with previous behavior if relevant
- Use bullet points for multiple related changes
- Keep each line reasonably short (aim for ~72 characters)
- Focus on "why" rather than "what" (the diff shows what)

---

## Input Context

### Files Changed

The following files were modified in this commit:

{{fileListBlock}}

### Diff Content

{{diffBlock}}

---

## Output Requirements

Generate a JSON object with exactly two keys:

```json
{
  "subject": "<the commit subject line>",
  "body": "<the commit body, or empty string if no body>"
}
```

### Validation Checklist

Before outputting, verify:

- [ ] Subject is {{maxSubjectChars}} characters or fewer
- [ ] Subject uses imperative mood ("add" not "added")
- [ ] Subject has no trailing period
- [ ] Subject describes the actual changes in the diff (no fabrication)
- [ ] Body is empty string if body is disabled, or meaningful content if enabled
- [ ] Output is valid JSON with no extra text, markdown, or formatting
- [ ] Language is {{language}}

### Critical Rules

1. **Output ONLY the JSON object** - no markdown code fences, no explanations, no preamble.
2. **Never fabricate changes** - only describe what's actually in the diff.
3. **Never exceed the character limit** - truncate intelligently if needed, don't just cut off.
4. **Use the exact JSON format** - both keys must be present, body must be empty string (not null) when unused.
