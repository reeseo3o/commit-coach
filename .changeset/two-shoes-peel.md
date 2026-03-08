---
"@lizzy_o3o/commit-coach": patch
---

Improve commit suggestion quality and setup clarity. Commit subjects are now normalized to avoid meta-feedback/junk phrases and low-quality mixed-token output, with safer fallbacks when AI output is weak. The init wizard also explains model-list fallback reasons more clearly (missing API key, rate limit, or provider fetch failure).
