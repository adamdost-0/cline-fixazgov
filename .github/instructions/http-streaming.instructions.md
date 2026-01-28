---
applyTo: "src/**/*stream*.ts,src/**/*http*.ts,src/core/api/**/*.ts"
---

# Skill: HTTP + streaming implementation guidance (TypeScript)

- Use the repo's standard HTTP client (fetch/undici/axios) and patterns.
- Always support AbortSignal for cancellation.
- Set explicit timeouts if the repo does (don't invent new global behavior).
- Parse streaming carefully:
  - handle empty lines/keep-alives
  - tolerate partial JSON chunks (buffer until complete)
  - never crash on a single malformed chunk; surface a clear error

Security:
- Redact Authorization headers and keys in logs/errors.
- Do not log raw streaming payloads in production.

Testing:
- Use recorded fixtures or synthetic stream generators.
- Test partial-chunk boundaries (JSON split across chunks).
