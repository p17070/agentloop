# AgentLoop — Testing Guide

## Overview

AgentLoop uses a two-tier testing strategy:

1. **Unit tests** — Fast, no network, run on every commit. Validate normalization logic, parameter filtering, transforms, middleware, and client routing.
2. **Integration tests** — Hit real provider APIs. Validate that actual response shapes match our SPEC so normalization code can be built with confidence.

## Framework & Tools

| Tool | Purpose |
|---|---|
| [Vitest 2.0+](https://vitest.dev/) | Test runner and assertion library |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | Code coverage via V8 |
| [tsup](https://tsup.egoist.dev/) | Build (ESM + CJS) |
| [TypeScript 5.5+](https://www.typescriptlang.org/) | Type checking |
| GitHub Actions | CI pipeline |

## Running Tests

```bash
# Unit tests — watch mode (default)
npm test

# Unit tests — single run (CI)
npm run test:ci

# Unit tests — with coverage report
npm run test:coverage

# Integration tests (requires API keys)
ANTHROPIC_API_KEY=sk-... npm run test:integration

# Type check only
npm run typecheck

# Build
npm run build
```

## Configuration Files

| File | Purpose |
|---|---|
| `vitest.config.ts` | Unit test config — includes `tests/**/*.test.ts`, excludes `tests/integration/**` |
| `vitest.integration.config.ts` | Integration test config — includes `tests/integration/**/*.test.ts`, 30s timeout |
| `tsconfig.json` | TypeScript strict config — ES2022, NodeNext, strict mode |
| `.github/workflows/ci.yml` | CI pipeline — typecheck + test + build on Node 18/20/22 |

## Test Structure

```
tests/
├── normalize.test.ts          # Response normalization (finish reasons, type coercion, reasoning, citations, usage)
├── provider.test.ts           # OpenAI-compatible provider (param filtering, HTTP dispatch, SSE streaming)
├── transforms.test.ts         # Anthropic + Gemini transforms (request/response/stream mapping)
├── middleware.test.ts          # Middleware (compose, retry, fallback, cache, logger)
├── client.test.ts             # AgentLoop client (routing, structured output, errors)
├── fixtures/                  # JSON fixtures for provider response shapes
└── integration/
    ├── anthropic-api.ts       # Minimal Anthropic API client (native fetch, no SDK)
    └── anthropic.test.ts      # 30 tests against real Anthropic Messages API
```

## Unit Tests

Unit tests are scaffolded with `it.todo()` test cases that map directly to the SPEC. As each module is implemented, the corresponding tests are filled in.

### Coverage Thresholds

Configured in `vitest.config.ts`:

| Metric | Threshold |
|---|---|
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

Coverage excludes `src/index.ts` (barrel export, no logic).

### Test Plan by Module

#### `normalize.test.ts` — Response Normalization

Tests all provider-specific quirks discovered during API research:

| Test Area | Cases | What's Validated |
|---|---|---|
| Finish reason mapping | 4 | `eos` → `stop`, `insufficient_system_resource` → `error`, standard passthrough, all 30+ values |
| Type coercion | 2 | String `choices[].index` → number (Mistral), object `function.arguments` → JSON string (Fireworks) |
| Reasoning extraction | 4 | `reasoning` field, `reasoning_content` field, `<think>` tag parsing, text preservation |
| Citation normalization | 4 | Perplexity, OpenAI, Anthropic (4 types), Gemini grounding |
| Usage extraction | 3 | Standard fields, Groq `x_groq.usage`, field name normalization |

#### `provider.test.ts` — OpenAI-Compatible Provider

| Test Area | Cases | What's Validated |
|---|---|---|
| Parameter filtering | 7 | Strip (Groq, Perplexity, Ollama), rename (Mistral `seed`→`random_seed`), clamp (Mistral temp, Groq n), passthrough (OpenAI) |
| HTTP dispatch | 4 | Correct baseURL, Bearer auth, Ollama no-auth, error responses |
| SSE streaming | 3 | SSE parsing, `[DONE]` sentinel, content-part lifecycle events |

#### `transforms.test.ts` — Anthropic & Gemini Transforms

| Test Area | Cases | What's Validated |
|---|---|---|
| Anthropic request | 4 | Message format, system extraction, tool definitions, tool_choice mapping |
| Anthropic response | 7 | All 7 content block types (text, tool_use, thinking, redacted_thinking, server_tool_use, web_search_tool_result, citations), stop_reason mapping |
| Anthropic streaming | 4 | content_block_start/delta/stop, message_delta/stop event mapping |
| Gemini request | 3 | Contents format, systemInstruction, function declarations |
| Gemini response | 9 | All 7 part types, grounding metadata, finishReason, usageMetadata |
| Gemini streaming | 2 | Chunk diffing, lifecycle events |

#### `middleware.test.ts` — Middleware

| Test Area | Cases | What's Validated |
|---|---|---|
| compose() | 3 | Chaining, sequential pass-through, empty array |
| retry() | 5 | Max attempts, exponential backoff, immediate success, exhaustion, retryable status codes |
| fallback() | 4 | Primary success, failover, ordered tries, all-fail |
| cache() | 4 | Cache hit, cache miss, key generation, streaming skip |
| logger() | 3 | Request/response logging, timing, no mutation |

#### `client.test.ts` — AgentLoop Client

| Test Area | Cases | What's Validated |
|---|---|---|
| Routing | 5 | Provider prefix dispatch (openai/, anthropic/, google/, groq/), unknown provider error |
| chat() | 2 | Non-streaming response, streaming AsyncIterable |
| chatStructured() | 3 | Zod validation, schema injection, typed return |
| Middleware integration | 3 | Config application, request modification, response modification |
| Error handling | 3 | AgentLoopError wrapping, provider/status in error, network errors |

## Integration Tests

Integration tests call real provider APIs to validate that actual response shapes match the SPEC. They are **excluded from the default test run** and require API keys.

### Anthropic Integration Tests (35 tests)

Tests are in `tests/integration/anthropic.test.ts` and use a minimal API client in `tests/integration/anthropic-api.ts` (native `fetch()`, no SDK dependency).

| Suite | Tests | What's Validated |
|---|---|---|
| Basic chat | 8 | Response shape (`type: "message"`, `role: "assistant"`), `msg_` id prefix, text content blocks, `end_turn` stop_reason, usage with `input_tokens`/`output_tokens` |
| Tool calling | 5 | `tool_use` content blocks, `toolu_` id prefix, `input` as parsed object (not string), `get_weather` name match, JSON.stringify round-trip |
| Tool result round-trip | 2 | Multi-turn with `tool_result` block, assistant processes tool output |
| Streaming | 5 | SSE event lifecycle (`message_start` → `content_block_start` → `content_block_delta` → `content_block_stop` → `message_delta` → `message_stop`), text delta reassembly, usage in `message_delta` |
| Streaming tool calls | 4 | `content_block_start` with `tool_use` type, `input_json_delta` events, partial JSON reassembly, `tool_use` stop_reason |
| max_tokens stop | 1 | `stop_reason: "max_tokens"` on truncation |
| Error handling | 2 | Invalid model error, invalid API key 401/403 |
| Multi-turn | 1 | Context preserved across conversation turns |
| System message | 1 | Top-level `system` parameter respected |
| Prompt caching | 5 | System block with `cache_control`, `cache_creation_input_tokens` on write, `cache_read_input_tokens` on hit, `cache_control` on user content blocks, `cache_control` on tool definitions |

### Gemini Integration Tests (28 tests)

Tests are in `tests/integration/gemini.test.ts` and use a minimal API client in `tests/integration/gemini-api.ts` (native `fetch()`, no SDK dependency).

| Suite | Tests | What's Validated |
|---|---|---|
| Basic chat | 8 | `candidates[]` array, `role: "model"`, text parts, `finishReason: "STOP"`, `usageMetadata` with `promptTokenCount`/`candidatesTokenCount`/`totalTokenCount`, total = prompt + candidates |
| Tool calling | 5 | `functionCall` parts, `name` and `args` (parsed object), JSON.stringify round-trip, finishReason behavior |
| Tool result round-trip | 2 | Multi-turn with `functionResponse` part (matched by name), model incorporates result |
| Streaming | 6 | Full `GenerateContentResponse` per chunk (not deltas), text parts in chunks, text concatenation, `usageMetadata` in last chunk, `finishReason` in final chunk |
| Streaming tool calls | 2 | `functionCall` in stream chunks, `name` and `args` present |
| MAX_TOKENS finish | 1 | `finishReason: "MAX_TOKENS"` on truncation |
| Error handling | 2 | Invalid model error, invalid API key error |
| Multi-turn | 1 | Context preserved across conversation turns |
| System instruction | 1 | Top-level `systemInstruction` parameter respected |
| JSON mode | 1 | `responseMimeType: "application/json"` returns parseable JSON |

### Adding Integration Tests for Other Providers

Follow the pattern established by the Anthropic and Gemini tests:

1. Create `tests/integration/<provider>-api.ts` — minimal API client using native `fetch()`
2. Create `tests/integration/<provider>.test.ts` — tests that validate response shapes
3. Tests run with: `<PROVIDER>_API_KEY=... npm run test:integration`

Focus integration tests on **response shape validation** — confirming that real API responses have the fields and structures the SPEC expects for normalization.

## CI Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR:

```
Node 18 / 20 / 22
  ├── npm ci
  ├── npm run typecheck
  ├── npm run test:ci
  └── npm run build
```

Integration tests are **not** run in CI (require API keys). They are intended for local validation during development.

## Test Fixtures

The `tests/fixtures/` directory is for JSON files representing raw provider responses. As normalization code is implemented, add fixture files:

```
tests/fixtures/
├── openai/
│   ├── chat-response.json
│   └── stream-events.json
├── anthropic/
│   ├── message-response.json
│   ├── tool-use-response.json
│   └── stream-events.json
├── google/
│   ├── generate-response.json
│   └── grounding-response.json
└── ...
```

Fixtures should be captured from real API responses and committed to the repo, providing deterministic test data without needing network access.
