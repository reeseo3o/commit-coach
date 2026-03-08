# @lizzy_o3o/commit-coach

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
