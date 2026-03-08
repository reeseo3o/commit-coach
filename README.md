# commit-coach

AI-powered CLI for generating high-signal commit messages and pull request summaries from `git diff`.

[![npm version](https://img.shields.io/npm/v/%40lizzy_o3o%2Fcommit-coach.svg)](https://www.npmjs.com/package/@lizzy_o3o/commit-coach)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18.0.0-339933)](https://nodejs.org/)

<img width="796" height="369" alt="image" src="https://github.com/user-attachments/assets/44d47393-dfa7-456d-99ac-46fd9789cf90" />

## Why commit-coach?

- Keeps commit messages consistent without forcing templates.
- Works with AI when available and falls back to deterministic heuristics.
- Multi-provider LLM support: OpenAI, Groq, Ollama, Gemini, DeepSeek, Mistral, OpenRouter.
- Supports Korean and English output.

## Install

### Global install

```bash
# npm
npm install -g @lizzy_o3o/commit-coach

# pnpm
pnpm add -g @lizzy_o3o/commit-coach

# yarn
yarn global add @lizzy_o3o/commit-coach

# bun
bun add -g @lizzy_o3o/commit-coach
```

### Run without installing

```bash
npx @lizzy_o3o/commit-coach --help
# or
pnpx @lizzy_o3o/commit-coach --help
```

### Available aliases

After install, these commands are all equivalent:

```bash
commit-coach --help
ccoach --help
ccm --help
```

> `cc` is also registered but may conflict with `clang` on macOS. Prefer `ccm`.

## Quick Start

```bash
# 1) install
npm install -g @lizzy_o3o/commit-coach

# 2) first-time setup (choose provider, API key, model, language)
ccm init

# 3) generate commit message
git add .
ccm msg

# 4) generate PR summary
ccm pr --base main
```

## Usage

### `ccm msg` — Commit message

Generate one recommended commit message from staged changes.

```bash
ccm msg
ccm msg --lang ko
ccm msg --style conventional --max 72
ccm msg --verbose
```

### `ccm pr` — PR summary

Generate PR title/body from branch diff.

```bash
ccm pr --base main
ccm pr --lang en
ccm pr --verbose
```

PR summaries include file-level change highlights:

```text
## 변경 요약
- src/app/page.tsx: ContentRow 제거, footer 텍스트 변경
```

### `ccm init` — Setup wizard

Interactive setup for first-time use. This is the recommended entry point.

```bash
ccm init          # local config
ccm init -g       # global config
ccm init --defaults  # skip wizard, use defaults
```

The wizard walks you through:

1. **Scope** — local (`.commit-coach.json`) or global (`~/.commit-coach.json`)
2. **Provider** — openai, groq, ollama, gemini, deepseek, mistral, openrouter, or custom
3. **API key** — skipped for ollama (runs locally)
4. **Model** — fetched from provider API, or enter manually
5. **Language** — `ko` / `en`

### `ccm config:set` — Update config

```bash
ccm config:set language ko
ccm config:set provider groq
ccm config:set model llama-3.3-70b-versatile
ccm config:set apiKey gsk_...
ccm config:set -g language en    # update global config
```

### `ccm hook:install` — Git hook

Install a `prepare-commit-msg` hook that shows recommendations on every commit.

```bash
ccm hook:install
```

## Supported Providers

| Provider | API key required | Notes |
|---|---|---|
| OpenAI | Yes | Default provider |
| Groq | Yes | Fast inference |
| Ollama | No | Local, no API key needed |
| Gemini | Yes | Google AI |
| DeepSeek | Yes | |
| Mistral | Yes | |
| OpenRouter | Yes | Access 300+ models |
| Custom | Yes | Any OpenAI-compatible API via `baseURL` |

## Configuration

### Precedence

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
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "apiKey": "gsk_..."
}
```

### AI vs Fallback

- If a provider and API key are configured, AI output is used.
- If not, commit-coach falls back to local heuristics.
- Use `--verbose` to see which mode was used.

You can also set API key via environment variable (fallback):

```bash
export OPENAI_API_KEY="your-key"
```

## CI / Automation

`msg`/`pr` require config to exist. In CI, either:

```bash
# option 1: create config non-interactively
ccm init --defaults

# option 2: skip the config check
COMMIT_COACH_SKIP_ONBOARDING=1 ccm msg

# option 3: disable branding/animation
COMMIT_COACH_BRAND=0 COMMIT_COACH_ANIMATE=0 ccm msg
```

## Global Options

```bash
ccm --no-brand msg               # hide banner
ccm --theme sunset config:init   # change brand theme
```

---

## Contributing

Contributions are welcome.

```bash
git clone https://github.com/reeseo3o/commit-coach.git
cd commit-coach
npm install
npm run test && npm run typecheck && npm run build
```

1. Fork the repository
2. Create a feature branch
3. Add/update tests
4. Run `npm run test && npm run typecheck && npm run build`
5. Open a pull request

## Security

- Never commit secrets (API keys, credentials, `.env` values).
- Keep local credentials out of tracked files.
- `.commit-coach.json` is in `.gitignore` by default.

## License

MIT — see [LICENSE](LICENSE)
