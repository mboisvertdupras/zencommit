# zencommit

AI-powered git commit message generator. Analyzes your staged changes and generates meaningful, conventional commit messages using LLMs.

## Features

- **Smart Diff Analysis** - Automatically parses and prioritizes code changes for optimal context
- **Auto Token Capping** - Intelligently truncates diffs based on model token limits
- **Multiple Providers** - Supports 20+ AI providers via Vercel AI SDK
- **Conventional Commits** - Generates messages following conventional commit standards
- **Interactive Workflow** - Preview, edit, or confirm before committing
- **Flexible Configuration** - Global, project, and CLI-level configuration options
- **Secure Credential Storage** - API keys stored in the system secure store (with env fallback)

## Installation

### Global Install

```bash
npm install -g zencommit
```

### One-Off via npx

```bash
npx zencommit --help
```

### Local Dependency

```bash
npm install --save-dev zencommit
npx zencommit --help
```

### From Source

```bash
git clone https://github.com/mboisvertdupras/zencommit.git
cd zencommit
npm install
npm run build
node dist/index.js --help
```

## Quick Start

1. **Set up your API key:**

```bash
zencommit auth login
```

2. **Stage your changes and run:**

```bash
git add .
zencommit
```

3. **Review, edit, or confirm the generated commit message.**

## Usage

### Basic Commands

```bash
# Generate commit message for staged changes
zencommit

# Auto-commit without confirmation
zencommit --yes

# Preview without committing
zencommit --dry-run

# Stage all changes and generate message
zencommit --all

# Stage all changes (short flag)
zencommit -a

# Generate message for unstaged changes (preview only)
zencommit --unstaged
```

### Command-Line Options

| Flag               | Description                                         |
| ------------------ | --------------------------------------------------- |
| `--help`           | Show top-level or subcommand help                   |
| `--version`        | Show the installed package version                  |
| `--verbose`, `-v`  | Increase verbosity (`-v`, `-vv`, `-vvv`)            |
| `--yes`            | Skip confirmation and commit immediately            |
| `--dry-run`        | Preview output without committing                   |
| `--all`, `-a`      | Stage all changes (`git add -A`) before generating  |
| `--unstaged`       | Use unstaged diff (never commits unless `--commit`) |
| `--commit`         | Allow committing with `--unstaged`                  |
| `--push`, `-p`     | Push after committing                               |
| `--model <id>`     | Override model (e.g., `openai/gpt-5`)               |
| `--format <style>` | Commit style: `conventional` or `freeform`          |
| `--lang <code>`    | Language code (e.g., `en`, `fr`, `es`)              |
| `--no-body`        | Generate subject line only                          |
| `--`               | Pass additional arguments to `git commit`           |

### Examples

```bash
# Use a specific model
zencommit --model anthropic/claude-sonnet-4-20250514

# Generate in French
zencommit --lang fr

# Freeform style without body
zencommit --format freeform --no-body

# Pass args to git commit
zencommit --yes -- --no-verify

# Stage, commit, and push in one go
zencommit -ap --yes

# Verbose output for debugging
zencommit -vv --dry-run
```

## Authentication

Manage API keys with the `auth` command. Keys are stored via the secure-store backend and never written to config files.

```bash
# Interactive login
zencommit auth login

# Non-interactive login (recommended): pipe the secret via stdin
echo "$MY_KEY" | zencommit auth login --env-key OPENAI_API_KEY --token-stdin

# Non-interactive login with a token value on the command line
zencommit auth login --env-key OPENAI_API_KEY --token <token>

# Remove stored key
zencommit auth logout --env-key OPENAI_API_KEY

# Check authentication status
zencommit auth status
```

Prefer `--token-stdin` for scripting: passing `--token <token>` exposes the secret to your shell history and to other local processes via the process listing.

### Supported Environment Variables

| Provider                | Environment Variable                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| OpenAI                  | `OPENAI_API_KEY`                                                                     |
| Anthropic               | `ANTHROPIC_API_KEY`                                                                  |
| Google                  | `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`                                   |
| Google Vertex           | `GOOGLE_VERTEX_API_KEY`                                                              |
| Google Vertex Anthropic | `GOOGLE_VERTEX_API_KEY`                                                              |
| xAI                     | `XAI_API_KEY`                                                                        |
| Vercel                  | `VERCEL_API_KEY`                                                                     |
| Vercel AI Gateway       | `AI_GATEWAY_API_KEY`                                                                 |
| Azure                   | `AZURE_API_KEY`                                                                      |
| AWS Bedrock             | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, or Bedrock bearer |
| Groq                    | `GROQ_API_KEY`                                                                       |
| DeepInfra               | `DEEPINFRA_API_KEY`                                                                  |
| Mistral                 | `MISTRAL_API_KEY`                                                                    |
| Together AI             | `TOGETHER_AI_API_KEY`                                                                |
| Cohere                  | `COHERE_API_KEY`                                                                     |
| Cerebras                | `CEREBRAS_API_KEY`                                                                   |
| Perplexity              | `PERPLEXITY_API_KEY`                                                                 |
| OpenRouter              | `OPENROUTER_API_KEY`                                                                 |
| OpenAI-compatible       | `OPENAI_COMPATIBLE_API_KEY`                                                          |
| GitLab                  | `GITLAB_TOKEN`                                                                       |

## Configuration

Configuration is loaded from multiple sources and merged in order:

1. **Global** - `~/.config/zencommit/config.json`
2. **Custom path** - `$ZENCOMMIT_CONFIG`
3. **Project** - `zencommit.json` in repository root
4. **Inline** - `$ZENCOMMIT_CONFIG_CONTENT` (JSON string)

### Initialize Config

```bash
zencommit config init
```

### View Resolved Config

```bash
zencommit config print
```

### Validate Config

```bash
zencommit config validate
```

### Full Configuration Schema

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
      "name": "my-provider"
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

### Configuration Options

#### AI Settings (`ai`)

| Option             | Type   | Default          | Description                              |
| ------------------ | ------ | ---------------- | ---------------------------------------- |
| `model`            | string | `"openai/gpt-5"` | Model ID in `provider/model` format      |
| `temperature`      | number | `0.2`            | Sampling temperature (0-1)               |
| `maxOutputTokens`  | number | `4096`           | Maximum tokens in response               |
| `timeoutMs`        | number | `20000`          | Request timeout in milliseconds          |
| `openaiCompatible` | object | -                | Settings for OpenAI-compatible providers |

#### Commit Settings (`commit`)

| Option        | Type    | Default          | Description                      |
| ------------- | ------- | ---------------- | -------------------------------- |
| `style`       | string  | `"conventional"` | `"conventional"` or `"freeform"` |
| `language`    | string  | `"en"`           | Language code for commit message |
| `includeBody` | boolean | `true`           | Include detailed body in message |
| `emoji`       | boolean | `false`          | Include emoji in commit subject  |

#### Git Settings (`git`)

| Option                | Type    | Default    | Description                          |
| --------------------- | ------- | ---------- | ------------------------------------ |
| `diffMode`            | string  | `"staged"` | `"staged"`, `"unstaged"`, or `"all"` |
| `autoStage`           | boolean | `false`    | Auto-stage changes before generating |
| `confirmBeforeCommit` | boolean | `true`     | Prompt before committing             |

#### Diff Settings (`diff`)

| Option                         | Type    | Default   | Description                   |
| ------------------------------ | ------- | --------- | ----------------------------- |
| `truncateStrategy`             | string  | `"smart"` | `"smart"` or `"byFile"`       |
| `includeFileList`              | boolean | `true`    | Include list of changed files |
| `maxFiles`                     | number  | `200`     | Maximum files to include      |
| `smart.maxAddedLinesPerHunk`   | number  | `12`      | Max added lines per hunk      |
| `smart.maxRemovedLinesPerHunk` | number  | `12`      | Max removed lines per hunk    |

## Supported Providers

zencommit supports any provider compatible with the Vercel AI SDK:

| Provider          | Model Format                      | Example                                            |
| ----------------- | --------------------------------- | -------------------------------------------------- |
| OpenAI            | `openai/<model>`                  | `openai/gpt-4o`                                    |
| Anthropic         | `anthropic/<model>`               | `anthropic/claude-sonnet-4-20250514`               |
| Google            | `google/<model>`                  | `google/gemini-2.5-pro`                            |
| Azure OpenAI      | `azure/<deployment>`              | `azure/gpt-4o-deployment`                          |
| AWS Bedrock       | `amazon-bedrock/<model>`          | `amazon-bedrock/anthropic.claude-3-5-sonnet`       |
| Google Vertex     | `google-vertex/<model>`           | `google-vertex/gemini-2.0-flash`                   |
| Vertex Anthropic  | `google-vertex-anthropic/<model>` | `google-vertex-anthropic/claude-sonnet-4-20250514` |
| Groq              | `groq/<model>`                    | `groq/llama-3.3-70b-versatile`                     |
| Mistral           | `mistral/<model>`                 | `mistral/mistral-large-latest`                     |
| xAI               | `xai/<model>`                     | `xai/grok-2`                                       |
| OpenRouter        | `openrouter/<model>`              | `openrouter/anthropic/claude-3-opus`               |
| Together AI       | `togetherai/<model>`              | `togetherai/meta-llama/Meta-Llama-3-70B`           |
| Perplexity        | `perplexity/<model>`              | `perplexity/llama-3.1-sonar-large-128k`            |
| Cohere            | `cohere/<model>`                  | `cohere/command-r-plus`                            |
| Cerebras          | `cerebras/<model>`                | `cerebras/llama3.1-70b`                            |
| DeepInfra         | `deepinfra/<model>`               | `deepinfra/meta-llama/Llama-2-70b`                 |
| GitLab            | `gitlab/<model>`                  | `gitlab/claude-3-5-sonnet`                         |
| Vercel            | `vercel/<model>`                  | `vercel/v0-1.0-md`                                 |
| AI Gateway        | `gateway/<model>`                 | `gateway/openai/gpt-4o`                            |
| OpenAI Compatible | `openai-compatible/<model>`       | `openai-compatible/my-model`                       |

### Migration note

Provider ids now have exactly one accepted spelling, matching [models.dev](https://models.dev) provider keys. Three ids were renamed: `bedrock` → `amazon-bedrock`, `vertex` → `google-vertex`, `vertex-anthropic` → `google-vertex-anthropic`. Former aliases (e.g. `gemini`, `aws-bedrock`, `open-router`) are no longer accepted and produce an error listing the supported providers. Ids shown by `zencommit models search` are now always valid `--model` values.

## Model Discovery

Explore available models using the `models` command. Model metadata is fetched from [models.dev](https://models.dev) and cached locally.

```bash
# Search for models
zencommit models search gpt-4

# Limit the number of displayed search/autocomplete results
zencommit models search gpt-4 --max-items 5

# Get detailed model info
zencommit models info <modelId>
zencommit models info openai/gpt-5
```

## Smart Diff Truncation

zencommit automatically caps diff content to fit within model token limits:

### `smart` Strategy (default)

1. **File Summary** - Includes compact `name-status` and `numstat` output
2. **Compact Diff** - Uses `--unified=0` to minimize context lines
3. **Hunk Prioritization** - Scores and selects most informative hunks:
   - Prioritizes source code over generated files
   - Boosts hunks with definitions (functions, classes, types)
   - Prefers smaller, more focused hunks
4. **Graceful Degradation** - Falls back to summary-only when needed

### `byFile` Strategy

Distributes token budget proportionally across files, ensuring each file gets a minimum allocation before distributing remaining tokens by size.

## Exit Codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | Success                               |
| `2`  | Configuration or authentication error |
| `3`  | Git error or no diff available        |
| `4`  | Model/LLM call error                  |

## Development

### Prerequisites

- Node.js >= 22.14.0
- npm >= 10

### Commands

```bash
# Install dependencies from lockfile
npm ci

# Check types before building
npm run typecheck

# Build distributable artifacts
npm run build

# Run compiled CLI
node dist/index.js --help

# Lint with Oxlint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check

# Run tests
npm test

# Run the low-threshold dependency security audit
npm audit --audit-level=low

# Validate packed npm installs across global, npx, and local dependency modes
npm run smoke:install-matrix
```

### Project Structure

```
zencommit/
├── src/
│   ├── index.ts           # CLI entry point (yargs)
│   ├── commands/          # Command implementations
│   │   ├── default.ts     # Main commit generation
│   │   ├── auth.ts        # Authentication commands
│   │   ├── config.ts      # Configuration commands
│   │   └── models.ts      # Model discovery commands
│   ├── config/            # Configuration loading/merging
│   ├── auth/              # Secrets management
│   ├── metadata/          # Model metadata providers
│   ├── git/               # Git operations
│   ├── llm/               # LLM interactions & tokenization
│   ├── ui/                # Interactive prompts
│   └── util/              # Utility functions
├── tests/                 # Test files
└── bin/                   # Executable scripts
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes following the TypeScript/Prettier style
4. Run quality gates: `npm run lint && npm run typecheck && npm test && npm audit --audit-level=low`
5. For packaging-facing changes, also run `npm run smoke:install-matrix`
6. Commit using conventional commits: `feat: add my feature`
7. Push and open a pull request

## License

MIT

## Acknowledgments

- [Vercel AI SDK](https://sdk.vercel.ai/) for unified LLM access
- [models.dev](https://models.dev) for model metadata
- [Node.js](https://nodejs.org/) runtime + npm packaging
- [yargs](https://yargs.js.org/) for CLI parsing
- [@clack/prompts](https://github.com/bombshell-dev/clack) for beautiful prompts
