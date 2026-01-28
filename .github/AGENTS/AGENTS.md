# Agents

This repository uses specialized agents. When working in this repo, select the smallest agent that matches the task.

## Global rules (applies to all agents)
- Follow existing architecture and conventions; do not introduce new patterns unless requested.
- Prefer small, reviewable changes; avoid drive-by refactors.
- Never log secrets (API keys, tokens, Authorization headers, cookies).
- No `any` in TypeScript; use `unknown` + narrowing.
- Always propagate cancellation via AbortSignal when doing network/streaming work.
- Add/adjust tests for behavior changes.
- Update docs when configuration or user-visible behavior changes.

## Available agents
- `provider-implementer` — adds new model/API providers end-to-end.
- `streaming-specialist` — focuses on SSE/chunk parsing, abort, backpressure.
- `security-reviewer` — checks secrets handling, logging, threat model.
- `test-engineer` — adds tests/fixtures and reduces flakiness.
- `docs-writer` — produces setup + troubleshooting docs aligned with the UI.

## Working style
- Before coding: identify existing similar implementations and list the files to mirror.
- During coding: keep changes localized; reuse shared utilities.
- Before finishing: run through the acceptance checklist in the relevant skill file(s).