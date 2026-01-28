---
applyTo: "**"
---

# Skill: Turning prompts into implementation plans (Cline repo)

When asked to "add a provider" or similar:
- Ask for missing requirements first (auth, endpoint, streaming, tool calling).
- Produce a step-by-step plan tied to repo locations:
  - files to touch
  - interfaces to implement
  - config additions
  - UI wiring
  - docs/tests
- For each step, include acceptance criteria and how to verify.

Prefer:
- concrete diffs and file-level changes
- minimal viable implementation first
- follow-up enhancements as a separate list
