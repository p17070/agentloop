# AgentLoop — ULTRAPLAN

## The Key Insight

**~80% of LLM providers already speak the OpenAI wire format.** Groq, Together, Ollama, Mistral, DeepSeek, Fireworks, Perplexity, vLLM, LMStudio, Azure OpenAI — they all expose `/v1/chat/completions` with identical request/response shapes.

Writing a separate adapter for each is wasted code. Instead:

> **Use the OpenAI format as the internal lingua franca.**
> Only write transform code for providers that are genuinely different.

---

## Architecture: 3 Tiers

```
┌─────────────────────────────────────────────────────────┐
│                     AgentLoop Client                     │
│            chat() / stream() / embed()                   │
│         parse "provider/model" → route to tier           │
├──────────┬──────────────────────────┬────────────────────┤
│  Tier 1  │        Tier 2           │      Tier 3        │
│  Native  │   OpenAI-Compatible     │    Transforms      │
│          │                         │                    │
│  OpenAI  │  Just a baseURL swap:   │  Real adapters:    │
│  (zero   │  • Groq                 │  • Anthropic       │
│   code)  │  • Together             │  • Google Gemini   │
│          │  • Ollama               │                    │
│          │  • Mistral              │  ~150 lines each   │
│          │  • DeepSeek             │  (request map +    │
│          │  • Fireworks            │   response map +   │
│          │  • Perplexity           │   stream map)      │
│          │  • Azure OpenAI         │                    │
│          │  • vLLM / LMStudio      │                    │
│          │  • ANY custom endpoint  │                    │
│          │                         │                    │
│  0 lines │  0 lines per provider   │  ~300 lines total  │
│  of code │  (just config entries)  │                    │
└──────────┴──────────────────────────┴────────────────────┘
```

**Total provider code: ~300 lines** (Anthropic + Google transforms only).
Everything else is config.

---

## Project Structure (12 files)

```
agentloop/
├── src/
│   ├── index.ts              # Public API barrel export
│   ├── types.ts              # ALL types in one file (~120 lines)
│   ├── client.ts             # AgentLoop class + model routing (~100 lines)
│   ├── provider.ts           # OpenAI-compat base provider (~120 lines)
│   ├── registry.ts           # Provider config table + lazy init (~60 lines)
│   ├── transforms/
│   │   ├── anthropic.ts      # ChatRequest ↔ Anthropic Messages API (~150 lines)
│   │   └── google.ts         # ChatRequest ↔ Gemini API (~150 lines)
│   ├── middleware.ts          # compose() + all built-in middleware (~150 lines)
│   └── errors.ts             # Unified error mapping (~50 lines)
├── tests/
│   ├── client.test.ts
│   ├── provider.test.ts
│   ├── transforms.test.ts
│   └── middleware.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

**~12 source files. ~800 lines of actual code.**

Compare to original plan: ~40+ files, thousands of lines, separate adapter per provider.

---

## How It Works

### Step 1: The OpenAI-compatible base does all the heavy lifting

One class handles chat, streaming, embeddings, tool calling for ANY provider
that speaks the OpenAI format. This is the only "provider" implementation:

```typescript
class OpenAIProvider {
  constructor(private config: { baseURL: string; apiKey: string }) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Direct fetch to baseURL/chat/completions
    // Request IS already in OpenAI format — no mapping needed
    // Response IS already in our format — no mapping needed
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    // SSE parsing of OpenAI-format stream
    // Delta events are already in our format
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    // Direct fetch to baseURL/embeddings
  }
}
```

### Step 2: Adding a new OpenAI-compatible provider = 3 lines of config

```typescript
// registry.ts — this is ALL the code needed per compatible provider
const PROVIDERS: Record<string, ProviderEntry> = {
  openai:     { baseURL: "https://api.openai.com/v1" },
  groq:       { baseURL: "https://api.groq.com/openai/v1" },
  together:   { baseURL: "https://api.together.xyz/v1" },
  mistral:    { baseURL: "https://api.mistral.ai/v1" },
  deepseek:   { baseURL: "https://api.deepseek.com/v1" },
  fireworks:  { baseURL: "https://api.fireworks.ai/inference/v1" },
  perplexity: { baseURL: "https://api.perplexity.ai" },
  ollama:     { baseURL: "http://localhost:11434/v1", apiKey: "ollama" },
  // Users can add their own:
  // custom: { baseURL: "https://my-vllm-server.com/v1" }
};
```

**Zero per-provider adapter code.** 8+ providers from a lookup table.

### Step 3: Only Anthropic and Google need real transforms

These two have genuinely different APIs. Each transform is a pair of pure functions:

```typescript
// transforms/anthropic.ts
export function toAnthropicRequest(req: ChatRequest): AnthropicNativeRequest {
  // Extract system message → top-level system param
  // Convert content parts → Anthropic content blocks
  // Map tool definitions → Anthropic tool format
  // Map tool_choice → Anthropic tool_choice
}

export function fromAnthropicResponse(res: AnthropicNativeResponse): ChatResponse {
  // Map content blocks → ChatMessage
  // Map tool_use blocks → ToolCall[]
  // Map stop_reason → finish_reason
  // Extract usage
}

export function fromAnthropicStream(event: AnthropicStreamEvent): ChatStreamEvent {
  // Map content_block_delta → content_delta
  // Map tool_use delta → tool_call_delta
  // Map message_stop → done
}
```

Same pattern for Google. **Pure functions, no classes, no inheritance, fully testable.**

### Step 4: Client routing is trivial

```typescript
class AgentLoop {
  chat(request: ChatRequest): Promise<ChatResponse> {
    const [providerName, model] = parseModel(request.model); // "anthropic/claude-sonnet-4-20250514" → ["anthropic", "claude-sonnet-4-20250514"]
    const provider = this.resolve(providerName);

    if (provider.transform) {
      // Tier 3: transform request → call provider API → transform response
      const nativeReq = provider.transform.toRequest({ ...request, model });
      const nativeRes = await provider.transport.post(nativeReq);
      return provider.transform.fromResponse(nativeRes);
    }

    // Tier 1 & 2: send directly (already OpenAI format)
    return this.openai.chat({ ...request, model }, provider.baseURL, provider.apiKey);
  }
}
```

---

## Unified Types (single file)

Our types ARE the OpenAI types (with minor extensions). No translation layer needed
for 80% of providers. This is the entire type surface:

```typescript
// types.ts — everything in one file

export type Role = "system" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } };
  response_format?: { type: "text" | "json_object" | "json_schema"; json_schema?: { name: string; schema: Record<string, unknown> } };
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  provider: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }[];
  usage: Usage;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatStreamEvent {
  type: "delta" | "usage" | "done" | "error";
  delta?: { content?: string; tool_calls?: Partial<ToolCall>[] };
  usage?: Usage;
  finish_reason?: string;
  error?: Error;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
}

export interface AgentLoopConfig {
  providers?: Record<string, ProviderConfig>;
  defaultProvider?: string;
  defaultModel?: string;
  middleware?: Middleware[];
}
```

That's it. ~80 lines. One file. The OpenAI format IS our format.

---

## Middleware (single file)

All middleware in one file. Each is a small higher-order function:

```typescript
// middleware.ts

export type Middleware = (ctx: MiddlewareContext, next: () => Promise<ChatResponse>) => Promise<ChatResponse>;

export interface MiddlewareContext {
  request: ChatRequest;
  provider: string;
  model: string;
  attempt: number;
}

// compose([m1, m2, m3], handler) → m1(m2(m3(handler)))
export function compose(middleware: Middleware[], handler: (ctx: MiddlewareContext) => Promise<ChatResponse>) {
  return middleware.reduceRight(
    (next, mw) => (ctx) => mw(ctx, () => next(ctx)),
    handler
  );
}

// --- Built-in middleware (each ~15-25 lines) ---

export function retry(opts: { maxRetries?: number; backoff?: number } = {}): Middleware {
  const { maxRetries = 3, backoff = 1000 } = opts;
  return async (ctx, next) => {
    for (let i = 0; i <= maxRetries; i++) {
      try { return await next(); }
      catch (e: any) {
        if (i === maxRetries || !e.retryable) throw e;
        ctx.attempt = i + 1;
        await sleep(backoff * 2 ** i + Math.random() * 100);
      }
    }
    throw new Error("unreachable");
  };
}

export function fallback(models: string[]): Middleware {
  return async (ctx, next) => {
    for (const model of models) {
      try {
        ctx.request = { ...ctx.request, model };
        return await next();
      } catch (e: any) {
        if (model === models[models.length - 1]) throw e;
      }
    }
    throw new Error("unreachable");
  };
}

export function cache(store: Map<string, ChatResponse> = new Map(), ttl = 300_000): Middleware {
  return async (ctx, next) => {
    const key = JSON.stringify(ctx.request);
    const cached = store.get(key);
    if (cached) return cached;
    const res = await next();
    store.set(key, res);
    setTimeout(() => store.delete(key), ttl);
    return res;
  };
}

export function logger(log: (msg: string) => void = console.log): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    log(`→ ${ctx.provider}/${ctx.model}`);
    const res = await next();
    log(`← ${ctx.provider}/${ctx.model} ${Date.now() - start}ms ${res.usage.total_tokens}tok`);
    return res;
  };
}
```

~100 lines total. All middleware in one file. No separate directories.

---

## Error Mapping (single file)

```typescript
// errors.ts
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public status?: number,
    public retryable = false,
    public raw?: unknown
  ) { super(message); }
}

export function mapError(provider: string, error: unknown): LLMError {
  // Normalize HTTP status codes across all providers into typed errors
  const status = (error as any)?.status;
  const msg = (error as any)?.message ?? String(error);

  if (status === 401) return new LLMError(msg, provider, 401, false, error);
  if (status === 429) return new LLMError(msg, provider, 429, true, error);
  if (status === 500 || status === 502 || status === 503)
    return new LLMError(msg, provider, status, true, error);
  return new LLMError(msg, provider, status, false, error);
}
```

~25 lines. Done.

---

## Structured Output (built into client, not a separate module)

```typescript
// Inside client.ts — 15 lines, not a separate file
async chatStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T> {
  const jsonSchema = zodToJsonSchema(schema);
  const res = await this.chat({
    ...request,
    response_format: { type: "json_schema", json_schema: { name: "response", schema: jsonSchema } },
  });
  const text = res.choices[0].message.content as string;
  return schema.parse(JSON.parse(text));
}
```

For providers that don't support `json_schema` natively, the transform layer
injects "Respond in JSON matching this schema: ..." into the system prompt.
Fallback costs ~5 lines in each transform.

---

## Code Reuse Strategy: Why This Works

| Technique | Lines Saved |
|---|---|
| OpenAI format as lingua franca | Eliminates type mapping for 8+ providers |
| Config table instead of per-provider classes | ~100 lines/provider × 8 = ~800 lines |
| Pure transform functions (not classes) | No inheritance hierarchy, no base class ceremony |
| Single middleware file | No directory, no barrel exports, no types file |
| Built-in structured output | No separate module |
| `fetch()` directly instead of SDK wrappers | No SDK adapter layer for OpenAI-compat providers |

**Original plan: ~40 files, ~2500+ lines estimated.**
**Ultraplan: ~12 files, ~800 lines.**

---

## Implementation Order

### Phase 1: Working in 4 files (~400 lines)
1. `types.ts` — unified types
2. `provider.ts` — OpenAI-compatible provider (fetch-based, chat + stream + embed)
3. `registry.ts` — provider config table (OpenAI, Groq, Together, Ollama, Mistral, DeepSeek, Fireworks, Perplexity)
4. `client.ts` — AgentLoop class with model routing
5. `errors.ts` — error mapping

**Result:** Chat, streaming, embeddings, tool calling working across 8+ providers.

### Phase 2: The two real adapters (~300 lines)
6. `transforms/anthropic.ts` — request/response/stream transforms
7. `transforms/google.ts` — request/response/stream transforms

**Result:** Full provider coverage including Anthropic + Google.

### Phase 3: Middleware + structured output (~150 lines)
8. `middleware.ts` — compose + retry + fallback + cache + logger

**Result:** Production-ready with retry, fallback, caching.

### Phase 4: Package + tests
9. `index.ts` — public API
10. Tests
11. Build config (tsup, tsconfig)
12. package.json with optional peer deps

---

## Usage (unchanged from original — same DX)

```typescript
import { AgentLoop } from "agentloop";

const ai = new AgentLoop({
  providers: {
    openai:    { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    groq:      { apiKey: process.env.GROQ_API_KEY },
    ollama:    { baseURL: "http://localhost:11434/v1" },
  },
});

// Works identically across ALL providers:
const res = await ai.chat({
  model: "groq/llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
});

// Swap provider by changing one string:
const res2 = await ai.chat({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

## Summary

| Aspect | Original Plan | Ultraplan |
|---|---|---|
| Source files | ~40+ | 12 |
| Lines of code | ~2500+ | ~800 |
| Provider adapters | 9 separate classes | 1 base + 2 transforms |
| Adding a new OAI-compat provider | New file + class | 1 line in config table |
| Type files | 8 | 1 |
| Middleware files | 7 | 1 |
| External dependencies | Multiple SDKs | Just `openai` SDK (optional) |
| Complexity | High | Minimal |
| Same user-facing API? | Yes | Yes |
