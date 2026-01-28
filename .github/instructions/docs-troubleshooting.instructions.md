---
applyTo: "docs/**/*.md,docs/**/*.mdx,**/*.md"
---

# Skill: Provider documentation & troubleshooting

Docs must include:
- What the provider is and when to use it
- Setup steps (where to paste credentials)
- Required fields + examples
- How to pick a model/deployment
- Known limitations (tool calling, streaming, vision, etc.)

Troubleshooting table:
- 401/403: credential issue
- 404: wrong endpoint/deployment
- 429: quota/rate limit
- 5xx/timeouts: retry guidance, check region/service health
