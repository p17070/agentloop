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

## Architecture: Minimal Code, Maximum Coverage

### Project Structure (14 files, ~900 lines)

```
agentloop/
├── src/
│   ├── index.ts                    # Public barrel export (~20 lines)
│   ├── types.ts                    # All types — discriminated unions (~100 lines)
│   ├── client.ts                   # AgentLoop class — routing + middleware (~120 lines)
│   ├── provider.ts                 # OpenAI-compatible provider — fetch + SSE (~150 lines)
│   ├── registry.ts                 # Provider config table + param filters (~80 lines)
│   ├── transforms/
│   │   ├── anthropic.ts            # Anthropic ↔ OpenAI transforms (~180 lines)
│   │   └── google.ts              # Gemini ↔ OpenAI transforms (~180 lines)
│   ├── middleware.ts               # compose() + retry/fallback/cache/logger (~120 lines)
│   └── errors.ts                   # Unified error hierarchy (~50 lines)
├── tests/
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
| `provider.ts` | ~150 | HTTP dispatch + SSE parsing for ALL 9 OpenAI-compat providers |
| `registry.ts` | ~80 | Config + param filters for 9 providers (avg ~8 lines each) |
| `transforms/anthropic.ts` | ~180 | Full Anthropic Messages API mapping |
| `transforms/google.ts` | ~180 | Full Gemini generateContent mapping |
| `types.ts` | ~100 | Complete type system |
| `client.ts` | ~120 | Routing + middleware + structured output |
| `middleware.ts` | ~120 | 5 middleware functions |
| `errors.ts` | ~50 | Error normalization |
| **Total** | **~900** | **11 providers, full feature set** |

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

## Implementation Phases (unchanged, still 4)

### Phase 1: Core (~400 lines, 4 files)
- `types.ts` — complete type system
- `provider.ts` — OpenAI-compat provider (fetch + SSE streaming)
- `registry.ts` — all 9 compat providers as config entries
- `errors.ts` — error mapping

**Delivers:** Chat + streaming + tools for OpenAI, Groq, Together, Mistral, DeepSeek, Fireworks, Perplexity, Ollama, Cohere.

### Phase 2: Transforms (~360 lines, 2 files)
- `transforms/anthropic.ts` — request/response/stream mapping
- `transforms/google.ts` — request/response/stream mapping

**Delivers:** Full 11-provider coverage.

### Phase 3: Client + Middleware (~240 lines, 2 files)
- `client.ts` — AgentLoop class, routing, structured output
- `middleware.ts` — retry, fallback, cache, logger, cost tracker

**Delivers:** Production-ready SDK with middleware.

### Phase 4: Polish
- `index.ts` — barrel export
- Tests, build config, package.json

---

## Summary: What Changed from v1

| Aspect | Ultraplan v1 | Ultraplan v2 |
|---|---|---|
| Provider research | Assumed | Verified against actual API docs |
| Cohere handling | Separate adapter needed | OpenAI-compat endpoint — config only |
| Param compatibility | Assumed uniform | Per-provider param filter config |
| Mistral `seed` | Assumed compatible | Renamed to `random_seed` |
| Temperature ranges | Assumed uniform | Mistral/Cohere clamped to 0-1 |
| Perplexity tools | Assumed supported | Not supported — auto-stripped |
| Ollama tool_choice | Assumed supported | Not supported — auto-stripped |
| Design patterns | Adapter only | Strategy + Chain of Resp + Proxy + Registry + Discriminated Unions |
| Files | 12 | 14 (added tests) |
| Lines | ~800 | ~900 (more precise transforms) |
