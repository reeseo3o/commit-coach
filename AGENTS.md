# AGENTS.md

This file guides coding agents working in the `commit-coach` repository.
It is intentionally practical and focused on this codebase.

## Repository Summary

- Type: Node.js CLI project
- Language: TypeScript (strict)
- Module system: ESM (`type: module`, NodeNext)
- Entry point: `src/cli.ts`
- Output: `dist/`
- Binaries: `commit-coach`, `ccoach`, `ccm`, `cc`

## Environment

- Node.js `>=18.0.0`
- npm
- git available on PATH
- Optional: `OPENAI_API_KEY` for AI generation mode

## Install / Run

```bash
npm install
npm run dev -- --help
```

## Build / Typecheck / Test

```bash
npm run build
npm run typecheck
npm run test
```

### Single Test File

```bash
npx tsx --test src/core/llm.test.ts
```

### Single Test by Name

```bash
npx tsx --test src/core/llm.test.ts -t "buildHeuristicCommitSuggestions"
```

## Linting

- There is currently **no lint script** in `package.json`.
- Do not assume ESLint/Prettier commands exist unless you add them.

## Important Scripts (`package.json`)

- `build`: `tsc -p tsconfig.json`
- `dev`: `tsx src/cli.ts`
- `start`: `tsx src/cli.ts`
- `typecheck`: `tsc --noEmit -p tsconfig.json`
- `test`: `tsx --test src/**/*.test.ts`
- `prepublishOnly`: typecheck + build

## CLI Smoke Test Checklist

Run these after CLI behavior changes:

```bash
npm link
ccm --help
ccm msg
ccm pr --base main
ccm config:init
ccm config:set language ko
ccm config:set -g language en
```

## Config Rules (Must Know)

Effective config precedence:

1. built-in defaults
2. global config (`~/.commit-coach.json`)
3. local config (`./.commit-coach.json`)

Notes:

- Local file is optional.
- Global can be overridden with `COMMIT_COACH_HOME` for tests.
- Local config overrides global config.

## Project Layout

- `src/cli.ts` — command registration and global CLI options
- `src/commands/*.ts` — command handlers
- `src/core/*.ts` — core logic (config, git, llm, prompt, types)
- `src/ui/brand.ts` — branding/banners
- `src/core/*.test.ts` — tests

## TypeScript / Style Conventions

- Keep strict typing; avoid `any`
- Use ESM imports with `.js` extension for local modules
- Use `node:` prefix for built-ins (`node:path`, `node:fs/promises`)
- Use double quotes and semicolons
- Use 2-space indentation
- Follow existing trailing comma style

## Naming Conventions

- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Command handlers: `runXxxCommand`
- Keep domain naming consistent (`reason`, `focus`, `fallback`, `brandTheme`)

## Error Handling Conventions

- Show user-friendly CLI error text
- For command failures, set `process.exitCode = 1`
- Keep AI failure behavior graceful (fallback to heuristic)
- Do not silently swallow unexpected errors

## Testing Conventions

- Co-locate tests under `src/core/*.test.ts`
- Use `node:test` + `assert/strict`
- Add regression tests when changing heuristics
- Add precedence/parse tests when changing config behavior

## Security Notes

- `.env` may exist; never print or commit secrets
- Never commit API keys or credentials
- Avoid logging sensitive environment values
- Keep bilingual output consistent (`ko`, `en`)
- `msg` should output one recommended commit message
- Re-run `npm link` after binary/CLI changes

## Existing Agent Rule Files

Checked and not found:

- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Therefore this `AGENTS.md` is the primary agent instruction file.

## Recommended Change Workflow

1. Read the relevant command/core files first.
2. Implement focused minimal changes.
3. Add or update tests with the change.
4. Run: `npm run test && npm run typecheck && npm run build`.
5. Smoke-test changed CLI behavior.
6. Update `README.md` for user-visible changes.

## Do / Don't

Do:

- Preserve config precedence behavior.
- Keep fallback deterministic.
- Keep help text and examples current.

Don't:

- Break bin aliases without doc updates.
- Add unrelated refactors during focused tasks.
- Introduce hidden global side effects.
