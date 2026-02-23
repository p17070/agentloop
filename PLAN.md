# AgentLoop — Universal LLM API Abstraction (TypeScript)

## Overview

A TypeScript SDK that provides a single, unified interface over every major LLM provider. One API shape, any backend — swap providers without changing application code.

---

## 1. Core Design Principles

| Principle | Detail |
|---|---|
| **Provider-agnostic** | Application code never imports provider-specific types |
| **Adapter pattern** | Each provider is a thin adapter that maps unified types ↔ provider-native types |
| **Middleware pipeline** | Cross-cutting concerns (retry, cache, logging, rate-limiting) compose as middleware |
| **Streaming-first** | All chat methods return `AsyncIterable`; non-streaming is sugar on top |
| **Type-safe structured output** | Generic `chat<T>()` with Zod schema validation for structured responses |
| **Zero required dependencies** | Provider SDKs are peer/optional deps — only install what you use |

---

## 2. Project Structure

```
agentloop/
├── src/
│   ├── index.ts                        # Public API re-exports
│   ├── client.ts                       # Main AgentLoop client class
│   │
│   ├── types/
│   │   ├── index.ts                    # Barrel export
│   │   ├── messages.ts                 # ChatMessage, Role, ContentPart (text/image/audio)
│   │   ├── request.ts                  # ChatRequest (model, messages, tools, config)
│   │   ├── response.ts                 # ChatResponse, Usage, FinishReason
│   │   ├── stream.ts                   # ChatStreamEvent, StreamDelta
│   │   ├── tools.ts                    # ToolDefinition, ToolCall, ToolResult
│   │   ├── embeddings.ts              # EmbedRequest, EmbedResponse
│   │   ├── structured.ts              # StructuredChatRequest<T>
│   │   ├── models.ts                   # ModelInfo, ProviderCapabilities
│   │   └── errors.ts                   # LLMError, RateLimitError, AuthError, etc.
│   │
│   ├── providers/
│   │   ├── base.ts                     # LLMProvider interface + BaseProvider abstract class
│   │   ├── registry.ts                 # Provider registry (lazy-load, auto-discover)
│   │   ├── openai/
│   │   │   ├── index.ts
│   │   │   ├── adapter.ts             # Maps unified ↔ OpenAI types
│   │   │   └── models.ts              # GPT-4o, GPT-4o-mini, o1, o3, etc.
│   │   ├── anthropic/
│   │   │   ├── index.ts
│   │   │   ├── adapter.ts             # Maps unified ↔ Anthropic Messages API
│   │   │   └── models.ts              # Claude Opus, Sonnet, Haiku
│   │   ├── google/
│   │   │   ├── index.ts
│   │   │   ├── adapter.ts             # Maps unified ↔ Gemini API
│   │   │   └── models.ts              # Gemini 2.0 Flash, Pro, etc.
│   │   ├── mistral/
│   │   │   ├── index.ts
│   │   │   └── adapter.ts
│   │   ├── groq/
│   │   │   ├── index.ts
│   │   │   └── adapter.ts
│   │   ├── cohere/
│   │   │   ├── index.ts
│   │   │   └── adapter.ts
│   │   ├── together/
│   │   │   ├── index.ts
│   │   │   └── adapter.ts
│   │   ├── ollama/
│   │   │   ├── index.ts
│   │   │   └── adapter.ts
│   │   └── openai-compatible/
│   │       ├── index.ts                # Generic adapter for any OpenAI-compat endpoint
│   │       └── adapter.ts
│   │
│   ├── middleware/
│   │   ├── types.ts                    # Middleware interface
│   │   ├── retry.ts                    # Exponential backoff + jitter
│   │   ├── fallback.ts                 # Provider/model fallback chain
│   │   ├── cache.ts                    # Pluggable cache (in-memory, Redis, etc.)
│   │   ├── rate-limit.ts              # Token bucket / sliding window
│   │   ├── logging.ts                  # Structured request/response logging
│   │   └── cost-tracker.ts            # Accumulate token costs per request
│   │
│   ├── utils/
│   │   ├── tokens.ts                   # Token counting (tiktoken / provider estimates)
│   │   ├── cost.ts                     # Pricing table + cost calculation
│   │   ├── schema.ts                   # Zod → JSON Schema conversion
│   │   └── stream-helpers.ts           # AsyncIterable utilities
│   │
│   └── batch/
│       └── batch.ts                    # Batch API (OpenAI-style file-based + generic)
│
├── tests/
│   ├── unit/
│   │   ├── providers/                  # Per-provider adapter tests (mocked)
│   │   ├── middleware/                 # Middleware unit tests
│   │   └── utils/                      # Utility tests
│   └── integration/                    # Live API tests (CI-gated by env vars)
│
├── package.json
├── tsconfig.json
├── tsup.config.ts                      # Build config (ESM + CJS dual output)
├── vitest.config.ts
├── .eslintrc.cjs
└── .gitignore
```

---

## 3. Core Types (The Unified Schema)

### 3a. Messages

```typescript
type Role = "system" | "user" | "assistant" | "tool";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource }
  | { type: "audio"; source: AudioSource };

type ImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: string; data: string };

interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
  name?: string;                      // for multi-agent / tool disambiguation
  tool_calls?: ToolCall[];            // assistant requesting tool use
  tool_call_id?: string;              // tool result linked to a call
}
```

### 3b. Request

```typescript
interface ChatRequest {
  model: string;                      // "openai/gpt-4o" or "anthropic/claude-sonnet-4-20250514"
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "required" | "none" | { name: string };
  response_format?: ResponseFormat;   // "text" | "json" | { schema: JSONSchema }
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
  metadata?: Record<string, unknown>; // pass-through to provider
}
```

### 3c. Response

```typescript
interface ChatResponse {
  id: string;
  model: string;
  provider: string;
  choices: Choice[];
  usage: Usage;
  latency_ms: number;
  cached: boolean;
}

interface Choice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number;                  // if pricing data available
}
```

### 3d. Streaming

```typescript
interface ChatStreamEvent {
  type: "content_delta" | "tool_call_delta" | "usage" | "done" | "error";
  delta?: {
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  usage?: Usage;
  finish_reason?: string;
  error?: LLMError;
}
```

### 3e. Tools / Function Calling

```typescript
interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;           // JSON Schema object
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;                // JSON string
  };
}
```

### 3f. Embeddings

```typescript
interface EmbedRequest {
  model: string;                      // "openai/text-embedding-3-small"
  input: string | string[];
  dimensions?: number;
}

interface EmbedResponse {
  model: string;
  provider: string;
  embeddings: number[][];
  usage: { prompt_tokens: number; total_tokens: number };
}
```

### 3g. Errors (unified hierarchy)

```typescript
class LLMError extends Error {
  provider: string;
  status?: number;
  retryable: boolean;
  raw?: unknown;                      // original provider error
}

class AuthenticationError extends LLMError { }
class RateLimitError extends LLMError {
  retry_after_ms?: number;
}
class InvalidRequestError extends LLMError { }
class ModelNotFoundError extends LLMError { }
class ContentFilterError extends LLMError { }
class ProviderUnavailableError extends LLMError { }
```

---

## 4. Provider Interface

```typescript
interface LLMProvider {
  readonly name: string;                          // "openai", "anthropic", etc.

  // Core
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;

  // Embeddings (optional — not all providers support it)
  embed?(request: EmbedRequest): Promise<EmbedResponse>;

  // Introspection
  listModels(): Promise<ModelInfo[]>;
  capabilities(): ProviderCapabilities;
}

interface ProviderCapabilities {
  chat: boolean;
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  audio: boolean;
  embeddings: boolean;
  structured_output: boolean;
  batch: boolean;
  json_mode: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_window: number;
  max_output_tokens: number;
  supports_vision: boolean;
  supports_tools: boolean;
  pricing?: { input_per_1m: number; output_per_1m: number };
}
```

---

## 5. Main Client API

```typescript
class AgentLoop {
  constructor(config?: AgentLoopConfig);

  // Register providers
  provider(name: string, provider: LLMProvider): this;
  provider(name: string): LLMProvider;            // getter overload

  // Primary API — model string encodes provider: "openai/gpt-4o"
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  // Structured output with type safety
  chatStructured<T>(
    request: ChatRequest,
    schema: ZodType<T>
  ): Promise<{ data: T; response: ChatResponse }>;

  // Batch
  batch(requests: ChatRequest[]): Promise<BatchResult>;

  // Middleware
  use(middleware: Middleware): this;

  // Model routing
  listModels(provider?: string): Promise<ModelInfo[]>;
}

interface AgentLoopConfig {
  providers?: Record<string, ProviderConfig>;     // per-provider API keys + options
  defaultProvider?: string;
  defaultModel?: string;
  middleware?: Middleware[];
  timeout?: number;
  maxRetries?: number;
}
```

### Usage Examples

```typescript
import { AgentLoop } from "agentloop";

const ai = new AgentLoop({
  providers: {
    openai:    { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    ollama:    { baseUrl: "http://localhost:11434" },
  },
});

// Simple chat
const res = await ai.chat({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Hello!" }],
});

// Streaming
for await (const event of ai.chatStream({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Write a poem" }],
})) {
  if (event.type === "content_delta") {
    process.stdout.write(event.delta?.content ?? "");
  }
}

// Structured output with Zod
import { z } from "zod";
const { data } = await ai.chatStructured(
  {
    model: "openai/gpt-4o",
    messages: [{ role: "user", content: "List 3 colors" }],
  },
  z.object({ colors: z.array(z.string()) })
);
// data.colors → ["red", "blue", "green"]  (fully typed)

// Tool use
const res2 = await ai.chat({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  }],
});

// Fallback middleware
import { fallback } from "agentloop/middleware";
ai.use(fallback(["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514", "groq/llama-3.3-70b"]));

// Local models via Ollama
const local = await ai.chat({
  model: "ollama/llama3",
  messages: [{ role: "user", content: "Hello from local!" }],
});
```

---

## 6. Middleware System

```typescript
type Middleware = (
  request: ChatRequest,
  next: (request: ChatRequest) => Promise<ChatResponse>
) => Promise<ChatResponse>;

// Stream-aware variant
type StreamMiddleware = (
  request: ChatRequest,
  next: (request: ChatRequest) => AsyncIterable<ChatStreamEvent>
) => AsyncIterable<ChatStreamEvent>;
```

### Built-in Middleware

| Middleware | Purpose |
|---|---|
| `retry({ maxRetries, backoff })` | Exponential backoff + jitter on retryable errors |
| `fallback(models[])` | Try next model/provider on failure |
| `cache({ store, ttl })` | Cache identical requests (pluggable: memory, Redis, SQLite) |
| `rateLimit({ rpm, tpm })` | Token-bucket rate limiting per provider |
| `logger({ level, sink })` | Structured logging of requests/responses |
| `costTracker({ onUsage })` | Accumulate and report token costs |
| `timeout({ ms })` | Per-request timeout |

---

## 7. Provider Adapter Strategy

Each provider adapter handles these responsibilities:

1. **Request mapping**: Convert `ChatRequest` → provider-native format
2. **Response mapping**: Convert provider-native response → `ChatResponse`
3. **Stream mapping**: Convert provider-native stream → `AsyncIterable<ChatStreamEvent>`
4. **Error mapping**: Convert provider-native errors → unified `LLMError` subclasses
5. **Capability reporting**: Declare what the provider supports
6. **Model resolution**: Strip provider prefix from model string ("openai/gpt-4o" → "gpt-4o")

### Provider-Specific Notes

| Provider | SDK / Transport | Key Differences to Handle |
|---|---|---|
| **OpenAI** | `openai` npm package | Reference implementation — our types align most closely |
| **Anthropic** | `@anthropic-ai/sdk` | Different message format (system as top-level, content blocks), tool_use blocks |
| **Google** | `@google/generative-ai` | `generateContent` API, different tool format, `Part[]` content |
| **Mistral** | `@mistralai/mistralai` | OpenAI-like but with differences in streaming and tool calls |
| **Groq** | OpenAI-compatible | Use `openai-compatible` base with Groq endpoint |
| **Together** | OpenAI-compatible | Use `openai-compatible` base with Together endpoint |
| **Cohere** | `cohere-ai` | Unique chat API (chat_history, preamble), different tool format |
| **Ollama** | REST (OpenAI-compat mode) | Use `openai-compatible` base with local endpoint |
| **OpenAI-Compatible** | `openai` SDK with custom baseURL | Generic adapter for vLLM, LMStudio, LocalAI, etc. |

---

## 8. Implementation Phases

### Phase 1: Foundation (Core types + client + 2 providers)
1. Initialize project: `package.json`, `tsconfig.json`, build tooling (tsup), vitest
2. Define all core types (`types/` directory)
3. Implement `LLMProvider` interface + `BaseProvider` abstract class
4. Implement provider registry with lazy loading
5. Build main `AgentLoop` client with middleware pipeline
6. Implement **OpenAI** adapter (reference implementation)
7. Implement **Anthropic** adapter
8. Implement streaming for both providers
9. Unit tests for type mapping + client logic

### Phase 2: Expand providers + tool calling
10. Implement **Google Gemini** adapter
11. Implement **OpenAI-Compatible** generic adapter
12. Implement **Ollama** adapter (via OpenAI-compat)
13. Implement **Groq** adapter (via OpenAI-compat)
14. Implement **Together** adapter (via OpenAI-compat)
15. Implement **Mistral** adapter
16. Implement **Cohere** adapter
17. Full tool/function calling across all providers
18. Vision (multimodal image input) across supported providers

### Phase 3: Advanced features
19. Structured output with Zod schema validation
20. Embeddings API across providers
21. Retry middleware with exponential backoff
22. Fallback middleware (provider chain)
23. Cache middleware (pluggable store interface)
24. Rate-limit middleware
25. Logging + cost tracking middleware
26. Token counting utility
27. Batch API support

### Phase 4: Polish
28. Comprehensive test suite (unit + integration)
29. Full JSDoc documentation
30. ESM + CJS dual build
31. CI/CD pipeline

---

## 9. Model String Convention

Format: `provider/model-id`

```
openai/gpt-4o
openai/gpt-4o-mini
openai/o3
anthropic/claude-opus-4-20250514
anthropic/claude-sonnet-4-20250514
anthropic/claude-haiku-4-5-20251001
google/gemini-2.0-flash
mistral/mistral-large-latest
groq/llama-3.3-70b-versatile
together/meta-llama/Llama-3.3-70B-Instruct
cohere/command-r-plus
ollama/llama3
```

If no prefix is provided, `defaultProvider` from config is used.

---

## 10. Package Metadata

```json
{
  "name": "agentloop",
  "description": "Universal LLM API abstraction — one interface, every provider",
  "exports": {
    ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs" },
    "./middleware": { "import": "./dist/middleware/index.mjs" },
    "./providers/*": { "import": "./dist/providers/*/index.mjs" }
  },
  "peerDependencies": {
    "openai": ">=4.0.0",
    "@anthropic-ai/sdk": ">=0.30.0",
    "@google/generative-ai": ">=0.20.0",
    "zod": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "openai": { "optional": true },
    "@anthropic-ai/sdk": { "optional": true },
    "@google/generative-ai": { "optional": true },
    "zod": { "optional": true }
  }
}
```

---

## Summary

| Aspect | Decision |
|---|---|
| Language | TypeScript (ESM + CJS) |
| Pattern | Adapter + Middleware pipeline |
| Model routing | `"provider/model"` string convention |
| Streaming | `AsyncIterable<ChatStreamEvent>` |
| Type safety | Generics + Zod for structured output |
| Provider SDKs | Peer/optional dependencies |
| Testing | Vitest (unit: mocked, integration: live) |
| Build | tsup (dual ESM/CJS output) |
| Day-1 providers | OpenAI, Anthropic, Google, Ollama, Groq, Together, Mistral, Cohere + generic OpenAI-compat |
