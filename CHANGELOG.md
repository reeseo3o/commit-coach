# @lizzy_o3o/commit-coach

## 0.3.4

### Patch Changes

- 5073d7d: Improve staged diff analysis for JSX prop removals, including multiline and commented-out attribute changes. Commit suggestions now produce concrete refactor subjects like removing a component attribute instead of falling back to generic file-level summaries.

## 0.3.3

### Patch Changes

- ba7128c: Improve commit suggestion quality by tightening prompt guidance, rejecting vague AI-generated subjects, and preserving real diff context when normalizing AI candidates. This reduces generic outputs like "핵심 동작 개선" and keeps suggestions aligned with staged changes.

## 0.3.2

### Patch Changes

- 5722c92: Improve commit suggestion quality and setup clarity. Commit subjects are now normalized to avoid meta-feedback/junk phrases and low-quality mixed-token output, with safer fallbacks when AI output is weak. The init wizard also explains model-list fallback reasons more clearly (missing API key, rate limit, or provider fetch failure).

## 0.3.1

### Patch Changes

- 49996a1: Improve setup and runtime UX for AI providers. `ccm init` now shows selectable model recommendations even when model fetch fails, `msg`/`pr` require an API key for non-ollama providers, and rate-limit errors now stop execution with clear guidance instead of silently falling back. Also fix `--version` to use the package version dynamically.

## 0.3.0

### Minor Changes

- 98b1f39: Improve the `ccm init` setup flow with interactive select prompts powered by `@inquirer/prompts`. This makes first-time configuration easier to navigate and reduces input mistakes when choosing scope, provider, model, and language.

## 0.2.0

### Minor Changes

- c155945: Add multi-provider support and streamlined init wizard

  - New `ccm init` command for first-time setup
  - Support 7 LLM providers: OpenAI, Groq, Ollama, Gemini, DeepSeek, Mistral, OpenRouter
  - Interactive model selection fetched from provider API
  - API key configurable via setup wizard or `ccm config:set apiKey`
  - Custom provider support via baseURL
