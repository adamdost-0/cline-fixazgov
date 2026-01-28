---
applyTo: "src/core/api/providers/**/*.ts,src/**/*foundry*.ts"
---

# Skill: Microsoft Foundry provider specification capture

## Before coding, answer these questions (explicitly)
1) Which "Foundry" product is targeted (exact product name + link)?
2) Auth mechanism:
   - API key? OAuth? AAD token? Managed identity?
   - Required headers and where the secret is stored in Cline.
3) Base URL format and required path parameters.
4) Model identifier format and how models are listed/selected.
5) Request format:
   - Chat messages schema
   - Tool/function calling schema (if supported)
   - Max tokens, temperature, top_p, stop, etc.
6) Response format:
   - Non-streaming response shape
   - Streaming (SSE? chunked JSON? websockets?) and event types
7) Rate limits, quotas, and retry guidance.
8) Any special requirements (region, resource name, project, deployment).

## Output artifact
Produce a mini-spec in markdown:
- Endpoints
- Headers
- Request/response examples (streaming + non-streaming)
- Error mapping table (status -> message/action)
- Compatibility notes vs OpenAI API (what differs)
