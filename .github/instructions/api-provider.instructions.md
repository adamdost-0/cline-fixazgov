---
applyTo: "src/core/api/**/*.ts,src/services/**/*.ts"
---

# Skill: Implementing a new Cline API Provider (TypeScript)

## Goal
Add a new API provider implementation that matches Cline's existing provider architecture, config flow, and streaming model.

## First steps (always)
- Locate existing providers and read them end-to-end before coding.
- Identify the provider interface/type(s) that all providers implement.
- Find where providers are registered/selected (factory/registry/switch).
- Find config storage and UI wiring (settings, secrets, env vars).
- Find streaming/token handling patterns used by the existing providers.

## Implementation constraints
- Follow existing conventions for file locations, naming, and exports.
- Do not introduce new architectural patterns unless necessary.
- Prefer reusing shared HTTP/stream utilities already in the repo.
- Avoid new dependencies unless the repo already uses them for providers.

## Streaming & cancellation
- Support streaming responses if other providers do.
- Propagate cancellation via AbortController/AbortSignal.
- Ensure partial chunks are emitted in the same shape as other providers.
- Handle reconnect/retry only if existing providers do; otherwise keep it simple.

## Error handling & UX
- Normalize provider errors into user-facing messages consistent with other providers.
- Never log secrets or full request payloads containing sensitive data.
- Distinguish between:
  - auth errors (401/403),
  - quota/rate limiting (429),
  - invalid request (400),
  - server errors (5xx),
  - network errors/timeouts.

## Tests
- Add unit tests for:
  - request shaping,
  - response parsing,
  - streaming chunk handling,
  - error mapping.
- Prefer fixture-based tests over live network calls.

## PR readiness
- Ensure provider can be selected, configured, and used end-to-end.
- Add documentation: how to configure Foundry credentials + endpoints.
- Include a minimal example prompt and expected behavior.
