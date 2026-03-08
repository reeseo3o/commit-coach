---
"@lizzy_o3o/commit-coach": patch
---

Improve setup and runtime UX for AI providers. `ccm init` now shows selectable model recommendations even when model fetch fails, `msg`/`pr` require an API key for non-ollama providers, and rate-limit errors now stop execution with clear guidance instead of silently falling back. Also fix `--version` to use the package version dynamically.
