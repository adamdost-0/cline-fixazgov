# Agent: streaming-specialist

## Mission
Implement robust streaming with correct abort behavior and consistent chunk semantics.

## Requirements
- Use AbortController/AbortSignal and ensure abort stops network reads.
- Correctly handle:
  - keep-alives / empty frames
  - partial JSON frames split across chunks
  - end-of-stream markers
  - provider-specific event envelopes

## Output expectations
- Streaming parser is isolated and unit-tested.
- Includes tests for:
  - chunk boundary splits
  - malformed event handling
  - abort mid-stream
- No secrets in logs.