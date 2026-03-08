# commit-coach

AI-powered CLI for generating high-signal commit messages and pull request summaries from `git diff`.

[![npm version](https://img.shields.io/npm/v/%40lizzy_o3o%2Fcommit-coach.svg)](https://www.npmjs.com/package/@lizzy_o3o/commit-coach)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18.0.0-339933)](https://nodejs.org/)

## Why commit-coach?

- Keeps commit messages consistent without forcing templates.
- Works with AI when available and falls back to deterministic heuristics.
- Supports Korean and English output.
- Handles project-local and global defaults with clear precedence.

## Features

- `msg`: generate one recommended commit message from staged changes.
- `pr`: generate PR title/body from branch diff.
- Interactive first-run setup wizard (`config:init`).
- Theme + mascot customization for setup UX.
- Global and local configuration support.
- Safe non-interactive behavior for CI and automation.

## Install

### Global install

```bash
npm install -g @lizzy_o3o/commit-coach
```

### Run without global install

```bash
npx @lizzy_o3o/commit-coach --help
```

### Useful aliases

`@lizzy_o3o/commit-coach` installs these binary names:

- `commit-coach`
- `ccoach`
- `ccm`

Note: `cc` may resolve to `clang` on macOS, so prefer `ccoach` or `ccm`.

## Quick Start

```bash
# 1) inside your git repository
git add .

# 2) first run (starts onboarding wizard if config is missing)
ccm msg

# 3) generate PR summary
ccm pr --base main
```

## Commands

### `msg`

Generate one recommended commit message from staged changes.

```bash
ccm msg
ccm msg --lang ko
ccm msg --style conventional --max 72
ccm msg --verbose
```

### `pr`

Generate PR title/body from branch changes against a base branch.

```bash
ccm pr --base main
ccm pr --lang en
ccm pr --verbose
```

### `config:init`

Create `.commit-coach.json` and run onboarding wizard in TTY mode.

```bash
ccm config:init
ccm config:init -g
ccm config:init --defaults
```

Wizard options include:

- scope: local/global
- language: `ko` / `en`
- theme: `ocean` / `sunset` / `forest`
- mascot: `cat` / `none`

### `config:set`

Update one config key.

```bash
ccm config:set language ko
ccm config:set brandTheme sunset
ccm config:set mascotStyle cat
ccm config:set -g language en
```

### `hook:install`

Install a `prepare-commit-msg` hook that shows recommendations.

```bash
ccm hook:install
```

## Global Options

```bash
ccm --no-brand msg
ccm --theme sunset config:init
```

## Configuration

### Precedence

Effective configuration order:

1. built-in defaults
2. global config: `~/.commit-coach.json`
3. local config: `./.commit-coach.json`

Local overrides global.

### Example config

```json
{
  "language": "ko",
  "commitStyle": "conventional",
  "maxSubjectLength": 72,
  "scopes": ["core", "api", "web", "docs"],
  "model": "gpt-4.1-mini",
  "brandTheme": "ocean",
  "mascotStyle": "cat"
}
```

## AI vs Fallback

- If `OPENAI_API_KEY` is available and API call succeeds, AI output is used.
- If not, commit-coach falls back to local heuristics.
- Use `--verbose` to see generation source details.

Set API key:

```bash
export OPENAI_API_KEY="your-key"
```

## First-run onboarding behavior

For `msg`/`pr`, commit-coach checks whether user config exists.

- Interactive terminal + no config: onboarding wizard is triggered automatically.
- CI/non-TTY: onboarding is skipped and command runs with defaults.

To skip onboarding explicitly:

```bash
COMMIT_COACH_SKIP_ONBOARDING=1 ccm msg
```

## CI / Automation

Recommended flags/env for deterministic output:

```bash
COMMIT_COACH_BRAND=0 COMMIT_COACH_ANIMATE=0 ccm msg
```

Use `config:init --defaults` for non-interactive setup.

## Development

```bash
npm install
npm run test
npm run typecheck
npm run build
npm run dev -- --help
```

Run a single test file:

```bash
npx tsx --test src/core/llm.test.ts
```

## Release (Changesets + GitHub Actions)

This repository is configured for automated releases with Changesets.

### 1) Create a changeset

```bash
npm run changeset
```

Select bump type (`patch`/`minor`/`major`) and write a summary.

### 2) Open PR and merge to `main`

- The `Release` workflow will either:
  - open/update a release PR (`chore: release`), or
  - publish to npm when release changes are present on `main`.

### 3) Required repository secret

Set this in GitHub repository settings:

- `NPM_TOKEN`: npm automation token with publish access for `@lizzy_o3o/commit-coach`

### 4) Local manual release (optional)

```bash
npm run version-packages
npm run build
npm run release
```


## Reinstall Global CLI (clean reset)

```bash
npm unlink -g @lizzy_o3o/commit-coach || true
npm uninstall -g @lizzy_o3o/commit-coach || true
npm run build
npm link
ccm --help
```

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Add/update tests
4. Run `npm run test && npm run typecheck && npm run build`
5. Open a pull request

## Security

- Never commit secrets (API keys, credentials, `.env` values).
- Keep local credentials out of tracked files.

## License

MIT - see [LICENSE](LICENSE)
