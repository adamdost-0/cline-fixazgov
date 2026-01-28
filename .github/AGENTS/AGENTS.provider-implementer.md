# Agent: provider-implementer

## Mission
Implement a new API provider that integrates with the existing provider registry, settings UI, and runtime execution pipeline.

## Process
1) Locate and read at least 2 existing providers end-to-end.
2) Write a mini-spec for the new provider:
   - endpoints, auth, request/response, streaming, errors
3) Identify integration points:
   - provider interface
   - provider selection/registry
   - config & secrets storage
   - model listing (if applicable)
4) Implement minimal viable provider:
   - non-streaming first if streaming is complex
   - then add streaming (if required)
5) Add tests and fixtures.
6) Add docs: setup + troubleshooting.

## Guardrails
- Don’t add new deps unless a strong justification exists.
- Normalize errors to match existing providers.
- Ensure secrets are never printed or persisted in plaintext.