# AgentLoop — ULTRAPLAN v2 (Research-Backed)

## Key Insight (Validated by API Research)

Every provider was researched against actual API docs. Result:

- **10 of 10 providers** support OpenAI-compatible `/v1/chat/completions`
- **Only 2** need real transforms (Anthropic, Google Gemini)
- **Cohere** now has an OpenAI-compatible endpoint — eliminating the need for a native adapter
- The OpenAI wire format truly is the universal lingua franca

---

## Architecture: Parameter-Filtered Strategy Pattern

The original ultraplan proposed 3 tiers. Research revealed a subtlety: OpenAI-compatible
providers aren't *identically* compatible — each supports a different subset of parameters.
This demands a **parameter filter** layer, not just a baseURL swap.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          AgentLoop Client                                │
│                                                                          │
│   chat("provider/model", ...) ──→ resolve provider                      │
│                                      │                                   │
│                           ┌──────────┴──────────┐                       │
│                           ▼                      ▼                       │
│                   OpenAI-Compatible         Transform Layer               │
│                   (direct dispatch)         (Anthropic / Gemini)          │
│                           │                      │                       │
│                    ┌──────┴──────┐          ┌────┴─────┐                 │
│                    ▼             ▼          ▼          ▼                  │
│              param filter   fetch()    toNative()   fromNative()         │
│              (strip unsup-             (pure fn)    (pure fn)            │
│               ported keys)                                               │
│                    │                       │                              │
│                    ▼                       ▼                              │
│              provider endpoint        provider endpoint                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Design Patterns Used

| Pattern | Where | Why |
|---|---|---|
| **Strategy** | Transform functions per provider | Swap request/response mapping without changing client |
| **Chain of Responsibility** | Middleware pipeline | Composable cross-cutting concerns (retry, cache, fallback) |
| **Adapter** | Anthropic/Gemini transforms | Convert between incompatible interfaces |
| **Proxy** | Parameter filter | Transparently strip unsupported params before dispatch |
| **Registry** | Provider config table | Decouple provider identity from implementation |
| **Template Method** | Base provider with hooks | Common HTTP/SSE logic, customizable per-provider |
| **Discriminated Union** | Content parts, stream events | Type-safe exhaustive matching |
| **Builder** | Config construction | Fluent, validatable provider setup |

---

## Provider Compatibility Matrix (from API research)

### Parameter Support

| Parameter | OpenAI | Groq | Together | Mistral | DeepSeek | Fireworks | Perplexity | Ollama | Cohere (compat) |
|---|---|---|---|---|---|---|---|---|---|
| `temperature` | 0-2 | 0-2 | 0-2 | 0-1 | 0-2 | 0-2 | 0-2 | 0-2 | 0-1 |
| `top_p` | Y | Y | Y | Y | Y | Y | - | Y | Y |
| `max_tokens` | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| `stop` | 4 seq | 4 seq | Y | Y | 16 seq | 4 seq | Y | Y | Y |
| `stream` | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| `tools` | Y | Y(128) | Y | Y | Y(128) | Y | **N** | Y | Y |
| `tool_choice` | Y | Y | Y | Y | Y | Y | **N** | **N** | Y |
| `parallel_tool_calls` | Y | Y | Y | Y | - | Y | **N** | - | **N** |
| `response_format` | all | all | all | all | json | all | schema | json | Y |
| `n` | Y | **1 only** | Y(128) | Y | **N** | Y(128) | **N** | **N** | **N** |
| `frequency_penalty` | Y | **N** | Y | Y | Y | Y | **N** | Y | Y |
| `presence_penalty` | Y | **N** | Y | Y | Y | Y | **N** | Y | Y |
| `logprobs` | Y | **N** | Y | - | Y | Y(0-5) | **N** | **N** | **N** |
| `logit_bias` | Y | **N** | Y | - | **N** | Y | **N** | **N** | **N** |
| `seed` | Y | Y | Y | `random_seed` | **N** | Y | **N** | Y | Y |
| `user` | Y | - | - | - | **N** | Y | **N** | **N** | **N** |

### Feature Support

| Feature | OpenAI | Groq | Together | Mistral | DeepSeek | Fireworks | Perplexity | Ollama | Cohere | Anthropic | Google |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Chat | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Streaming | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Tool calling | Y | Y | Y | Y | Y | Y | N | Y* | Y | Y | Y |
| Vision | Y | Y | Y | Y | N | Y | Y | Y* | Y | Y | Y |
| JSON mode | Y | Y | Y | Y | Y | Y | schema | Y | Y | N** | Y |
| Structured output | Y | Y | Y | Y | N | Y | Y | Y | Y | N** | Y |
| Embeddings | Y | - | - | Y | - | - | N | Y | Y | N | Y |

*Ollama: tool calling without tool_choice; vision base64-only
**Anthropic: no native JSON mode — achieved via tool_use trick or prompt instruction

### Authentication Methods

| Provider | Method | Header |
|---|---|---|
| OpenAI | Bearer | `Authorization: Bearer sk-...` |
| Groq | Bearer | `Authorization: Bearer gsk_...` |
| Together | Bearer | `Authorization: Bearer ...` |
| Mistral | Bearer | `Authorization: Bearer ...` |
| DeepSeek | Bearer | `Authorization: Bearer sk-...` |
| Fireworks | Bearer | `Authorization: Bearer fw_...` |
| Perplexity | Bearer | `Authorization: Bearer pplx-...` |
| Ollama | None (ignored) | `Authorization: Bearer ollama` (placeholder) |
| Cohere (compat) | Bearer | `Authorization: Bearer ...` |
| **Anthropic** | **Custom** | **`x-api-key: sk-ant-...`** + `anthropic-version: 2023-06-01` |
| **Google** | **Custom** | **`x-goog-api-key: ...`** (or `?key=` query param) |

### Base URLs

| Provider | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together | `https://api.together.xyz/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| DeepSeek | `https://api.deepseek.com` |
| Fireworks | `https://api.fireworks.ai/inference/v1` |
| Perplexity | `https://api.perplexity.ai` |
| Ollama | `http://localhost:11434/v1` |
| Cohere | `https://api.cohere.ai/compatibility/v1` |
| Anthropic | `https://api.anthropic.com/v1` (non-OpenAI) |
| Google | `https://generativelanguage.googleapis.com/v1beta` (non-OpenAI) |

---

## Response Normalization (Key Finding from v3 Research)

**The original spec treated responses as flat `{ text, tool_calls }` — this was wrong.**

Research revealed that providers return 10+ distinct content types in responses:

| Content Type | Providers |
|---|---|
| Text | All 11 |
| Tool calls | 10 (not Perplexity) |
| Reasoning/thinking | 8 (3 different field names: `reasoning`, `reasoning_content`, `<think>` tags) |
| Citations | 5 (5 completely different formats) |
| Image output | 1 (Gemini only, inline in chat) |
| Audio output | 2 (OpenAI, Gemini — different formats) |
| Code execution | 1 (Gemini only) |
| Server tools | 1 (Anthropic only) |
| Search results | 3 (Perplexity, Gemini, Anthropic — all different) |

### The Solution: Content-Part Discriminated Union

Every response is normalized to `content: ResponsePart[]` — an array of typed parts:

```typescript
type ResponsePart =
  | { type: "text"; text: string; citations?: Citation[] }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "redacted_thinking"; data: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "audio"; mimeType: string; data: string; transcript?: string }
  | { type: "code_execution"; language: string; code: string }
  | { type: "code_result"; outcome: "ok" | "error" | "timeout"; output: string }
  | { type: "server_tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "server_tool_result"; toolCallId: string; content: unknown };
```

### Critical Normalization Quirks Discovered

| Issue | Provider | Fix |
|---|---|---|
| `finish_reason: "eos"` | Together AI | Map to `"stop"` |
| `finish_reason: "insufficient_system_resource"` | DeepSeek | Map to `"error"` |
| `choices[].index` is string | Mistral | Coerce `Number(index)` |
| `function.arguments` is object | Fireworks | Coerce `JSON.stringify(args)` |
| Streaming usage in `x_groq.usage` | Groq | Extract from nested object |
| Reasoning as `<think>` tags in content | Together, Fireworks (DeepSeek R1) | Parse tags, split into ThinkingPart |
| Reasoning field: `reasoning` | Groq, Together | Normalize to ThinkingPart |
| Reasoning field: `reasoning_content` | DeepSeek, Mistral, Fireworks | Normalize to ThinkingPart |
| Perplexity `citations[]` at top level | Perplexity | Map to UrlCitation on TextPart |
| Anthropic citations in text blocks | Anthropic | Map 4 types to unified Citation |
| Gemini grounding in candidate metadata | Google | Map groundingSupports to UrlCitation |
| OpenAI annotations on message | OpenAI | Map url_citation to UrlCitation |

### Streaming: Content-Part Lifecycle Events

Streaming uses a **content-part lifecycle model** instead of raw deltas:

```
message.start → content.start → content.delta* → content.done → ... → message.delta → message.done
```

This maps cleanly from all providers:
- **OpenAI/compat**: SSE `data:` lines with `delta` objects → lifecycle events
- **Anthropic**: Named SSE events (content_block_start/delta/stop) → direct mapping
- **Gemini**: Full response chunks → diff against previous to generate deltas

---

## Architecture: Minimal Code, Maximum Coverage

### Project Structure (16 files, ~1400 lines)

```
agentloop/
├── src/
│   ├── index.ts                    # Public barrel export (~30 lines)
│   ├── types.ts                    # All types — discriminated unions (~200 lines)
│   ├── client.ts                   # AgentLoop class — routing + middleware (~120 lines)
│   ├── provider.ts                 # OpenAI-compatible provider — fetch + SSE (~150 lines)
│   ├── normalize.ts                # Response normalization — all OpenAI-compat quirks (~150 lines)
│   ├── registry.ts                 # Provider config table + param filters (~80 lines)
│   ├── transforms/
│   │   ├── anthropic.ts            # Anthropic ↔ unified transforms (~220 lines)
│   │   └── google.ts              # Gemini ↔ unified transforms (~250 lines)
│   ├── middleware.ts               # compose() + retry/fallback/cache/logger (~120 lines)
│   └── errors.ts                   # Unified error hierarchy (~50 lines)
├── tests/
│   ├── normalize.test.ts           # Response normalization tests (all quirks)
│   ├── provider.test.ts
│   ├── transforms.test.ts
│   ├── middleware.test.ts
│   └── client.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Code Reuse Breakdown

| Component | Lines | Covers |
|---|---|---|
| `types.ts` | ~200 | All types: ResponsePart (10 variants), Citation (3 variants), Usage, streaming events |
| `provider.ts` | ~150 | HTTP dispatch + SSE parsing for ALL 9 OpenAI-compat providers |
| `normalize.ts` | ~150 | Response normalization: reasoning fields, citations, finish reasons, usage, type coercion |
| `registry.ts` | ~80 | Config + param filters for 9 providers (avg ~8 lines each) |
| `transforms/anthropic.ts` | ~220 | Full Anthropic mapping (7 content block types, 4 citation types, streaming) |
| `transforms/google.ts` | ~250 | Full Gemini mapping (7 part types, grounding, image/audio/code output, streaming) |
| `client.ts` | ~120 | Routing + middleware + structured output |
| `middleware.ts` | ~120 | 5 middleware functions |
| `errors.ts` | ~50 | Error normalization |
| **Total** | **~1400** | **11 providers, all modalities, full normalization** |

---

## The Parameter Filter (Key Innovation)

Instead of per-provider adapter code, each provider declares a **param filter config**:

```typescript
// registry.ts
const PROVIDERS = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    // All params supported — no filter needed
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    strip: ["frequency_penalty", "presence_penalty", "logprobs",
            "top_logprobs", "logit_bias"],
    clamp: { n: 1 },
  },
  perplexity: {
    baseURL: "https://api.perplexity.ai",
    strip: ["tools", "tool_choice", "frequency_penalty", "presence_penalty",
            "logprobs", "top_logprobs", "logit_bias", "seed", "n", "user"],
  },
  ollama: {
    baseURL: "http://localhost:11434/v1",
    auth: "none",
    strip: ["tool_choice", "logprobs", "logit_bias", "n", "user"],
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    rename: { seed: "random_seed" },
    clamp: { temperature: [0, 1] },
  },
  // ... etc
};
```

One generic `filterParams()` function (~20 lines) handles strip/rename/clamp for ALL providers.
Zero per-provider code. Pure config.

---

## Implementation Phases (updated for v3)

### Phase 1: Types + Core (~580 lines, 5 files)
- `types.ts` — complete type system (ResponsePart union, Citation union, Usage, streaming events)
- `provider.ts` — OpenAI-compat provider (fetch + SSE streaming)
- `normalize.ts` — response normalization (reasoning fields, citations, finish reasons, type coercion)
- `registry.ts` — all 9 compat providers as config entries
- `errors.ts` — error mapping

**Delivers:** Chat + streaming + tools + reasoning + citations for OpenAI, Groq, Together, Mistral, DeepSeek, Fireworks, Perplexity, Ollama, Cohere. All response quirks handled.

### Phase 2: Transforms (~470 lines, 2 files)
- `transforms/anthropic.ts` — request/response/stream mapping (7 block types, 4 citation types)
- `transforms/google.ts` — request/response/stream mapping (7 part types, grounding, image/audio/code)

**Delivers:** Full 11-provider coverage including image output, audio output, code execution, server tools.

### Phase 3: Client + Middleware (~240 lines, 2 files)
- `client.ts` — AgentLoop class, routing, structured output
- `middleware.ts` — retry, fallback, cache, logger, cost tracker

**Delivers:** Production-ready SDK with middleware.

### Phase 4: Polish + Tests
- `index.ts` — barrel export
- `normalize.test.ts` — test all provider quirks (eos, string index, parsed args, etc.)
- Other tests, build config, package.json

---

## Summary: What Changed from v1 → v3

| Aspect | v1 (assumed) | v2 (request research) | v3 (response research) |
|---|---|---|---|
| Response format | Flat `{ text, tool_calls }` | Same | `content: ResponsePart[]` — 10 part types |
| Streaming format | Raw deltas | Same | Content-part lifecycle events |
| Reasoning/thinking | Not handled | Not handled | Normalized from 3 field names + `<think>` tags |
| Citations | Not handled | Not handled | Unified from 5 provider formats |
| Image output | Not handled | Not handled | Gemini inlineData → ImagePart |
| Audio output | Not handled | Not handled | OpenAI audio + Gemini PCM → AudioPart |
| Code execution | Not handled | Not handled | Gemini executableCode → CodeExecutionPart |
| Server tools | Not handled | Not handled | Anthropic server_tool_use → ServerToolCallPart |
| finish_reason | 4 values | 4 values | 30+ raw values → 5 normalized |
| Usage details | 3 fields | 3 fields | Reasoning, cache, audio, per-modality breakdowns |
| Provider quirks | None | Request-side only | + Together "eos", Mistral string index, Fireworks parsed args, Groq x_groq, DeepSeek insufficient_system_resource |
| Files | 12 | 14 | 16 |
| Lines | ~800 | ~900 | ~1400 |
