---
applyTo: "**/config*.ts,**/secrets*.ts,**/*.env*,src/core/config/**/*.ts"
---

# Skill: Config & secret handling for providers (Cline)

- Provider config must support:
  - required fields (endpoint, key/token, model/deployment)
  - optional fields (api version, org/project, region)
- Store secrets in the repo's existing secret storage mechanism.
- Never persist secrets in plaintext config files.
- Add validation with clear UI messages:
  - "Missing API key"
  - "Invalid endpoint URL"
  - "Model/deployment required"
- Add redaction helpers for logs and error reporting.
