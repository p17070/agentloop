# AgentLoop — Technical Specification

## 1. Type System

All types use the OpenAI wire format as the canonical shape. Discriminated unions
ensure exhaustive type checking at compile time.

### 1.1 Messages

```typescript
type Role = "system" | "user" | "assistant" | "tool";

// Discriminated union — exhaustive via `type` field
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } };

interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### 1.2 Tools

```typescript
interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;  // JSON Schema
    strict?: boolean;
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;  // JSON string (always string, even though some providers use objects)
  };
}
```

### 1.3 Request

```typescript
interface ChatRequest {
  model: string;                          // "provider/model-id"
  messages: ChatMessage[];

  // Generation params
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  seed?: number;
  n?: number;

  // Penalties
  frequency_penalty?: number;
  presence_penalty?: number;

  // Tools
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } };
  parallel_tool_calls?: boolean;

  // Output format
  response_format?: ResponseFormat;

  // Observability
  logprobs?: boolean;
  top_logprobs?: number;
  logit_bias?: Record<string, number>;

  // Streaming
  stream?: boolean;
  stream_options?: { include_usage: boolean };

  // Metadata
  user?: string;
  metadata?: Record<string, unknown>;     // pass-through to provider
}

type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } };
```

### 1.4 Unified Response (Normalized)

The response format is the core innovation. Every provider's response — whether OpenAI, Anthropic,
Gemini, or any OpenAI-compatible provider — is normalized into this **single shape**. Users never
see provider-specific response formats.

**Design principle:** Content is always an **array of typed parts** (discriminated union).
This naturally models all modalities: text, tool calls, reasoning, images, audio, code execution,
citations, and server tools. Simple text responses are just `[{ type: "text", text: "..." }]`.

```typescript
// ─── Response ───────────────────────────────────────────────────────────

interface ChatResponse {
  id: string;
  provider: string;                               // e.g. "openai", "anthropic", "google"
  model: string;                                   // e.g. "gpt-4o", "claude-sonnet-4-20250514"
  choices: Choice[];
  usage: Usage;
  providerMetadata?: Record<string, unknown>;     // provider-specific extras (pass-through)
}

interface Choice {
  index: number;
  content: ResponsePart[];                         // ← ALWAYS an array of content parts
  finishReason: FinishReason;
}

type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";

// ─── Content Parts (Discriminated Union) ────────────────────────────────
//
// This union covers ALL content types from ALL providers:
//   OpenAI:    text, tool_call, audio, annotations (citations)
//   Anthropic: text, tool_use, thinking, redacted_thinking, server_tool_use, web_search_tool_result, citations
//   Gemini:    text, functionCall, inlineData (image/audio), executableCode, codeExecutionResult, thought
//   DeepSeek/Groq/Together/Mistral/Fireworks: text, tool_call, reasoning_content/reasoning
//   Perplexity: text + citations/search_results

type ResponsePart =
  // ── Text (all providers) ──
  | TextPart

  // ── Tool Calling (most providers) ──
  | ToolCallPart

  // ── Reasoning / Thinking ──
  | ThinkingPart
  | RedactedThinkingPart

  // ── Multimodal Output ──
  | ImagePart
  | AudioPart

  // ── Code Execution (Gemini) ──
  | CodeExecutionPart
  | CodeResultPart

  // ── Server Tools (Anthropic) ──
  | ServerToolCallPart
  | ServerToolResultPart;

interface TextPart {
  type: "text";
  text: string;
  citations?: Citation[];                          // Normalized from all providers' citation formats
}

interface ToolCallPart {
  type: "tool_call";
  id: string;                                      // Call ID (generated for Gemini if absent)
  name: string;
  arguments: string;                               // ALWAYS JSON string (coerced from Fireworks objects)
}

interface ThinkingPart {
  type: "thinking";
  thinking: string;                                // Reasoning text
  signature?: string;                              // Anthropic: verification signature. Gemini: thoughtSignature
}

interface RedactedThinkingPart {
  type: "redacted_thinking";
  data: string;                                    // Anthropic: encrypted opaque data
}

interface ImagePart {
  type: "image";
  mimeType: string;                                // e.g. "image/png", "image/jpeg"
  data: string;                                    // Base64-encoded image bytes
}

interface AudioPart {
  type: "audio";
  mimeType: string;                                // e.g. "audio/wav", "audio/L16;rate=24000"
  data: string;                                    // Base64-encoded audio bytes
  transcript?: string;                             // OpenAI: text transcript of generated audio
  expiresAt?: number;                              // OpenAI: Unix timestamp for multi-turn reference
}

interface CodeExecutionPart {
  type: "code_execution";
  language: string;                                // e.g. "python"
  code: string;                                    // The generated code
}

interface CodeResultPart {
  type: "code_result";
  outcome: "ok" | "error" | "timeout";
  output: string;                                  // stdout (success) or stderr (error)
}

interface ServerToolCallPart {
  type: "server_tool_call";
  id: string;                                      // Anthropic: "srvtoolu_..." prefix
  name: string;                                    // e.g. "web_search"
  arguments: Record<string, unknown>;
}

interface ServerToolResultPart {
  type: "server_tool_result";
  toolCallId: string;                              // Matches server_tool_call.id
  content: unknown;                                // Anthropic: web_search_result[] or error object
}

// ─── Citations (Normalized from 5 different provider formats) ───────────

type Citation =
  | UrlCitation
  | DocumentCitation
  | PageCitation;

interface UrlCitation {
  type: "url";
  url: string;
  title?: string;
  citedText?: string;
  startIndex?: number;                             // Character offset in response text
  endIndex?: number;
}

interface DocumentCitation {
  type: "document";
  documentIndex: number;
  documentTitle?: string;
  citedText?: string;
  startCharIndex?: number;
  endCharIndex?: number;
}

interface PageCitation {
  type: "page";
  documentIndex: number;
  documentTitle?: string;
  citedText?: string;
  startPage?: number;                              // 1-indexed
  endPage?: number;                                // 1-indexed, exclusive
}

// ─── Usage (Normalized) ─────────────────────────────────────────────────

interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  details?: UsageDetails;
}

interface UsageDetails {
  // Reasoning tokens (OpenAI o-series, DeepSeek, Gemini thoughtsTokenCount)
  reasoningTokens?: number;

  // Cached/read tokens (OpenAI cached_tokens, Anthropic cache_read, DeepSeek cache_hit)
  cachedTokens?: number;

  // Cache write tokens (Anthropic cache_creation_input_tokens)
  cacheWriteTokens?: number;

  // Audio tokens (OpenAI prompt + completion audio_tokens)
  audioPromptTokens?: number;
  audioCompletionTokens?: number;

  // Per-modality breakdown (Gemini)
  promptTokensByModality?: Record<string, number>;      // e.g. { TEXT: 100, IMAGE: 200 }
  completionTokensByModality?: Record<string, number>;
}

// ─── Convenience Accessors (on Choice) ──────────────────────────────────
//
// These are getter methods/computed properties for ergonomic access:
//
//   choice.text         → concatenated text from all TextParts
//   choice.toolCalls    → array of ToolCallParts
//   choice.thinking     → concatenated thinking from all ThinkingParts
//   choice.images       → array of ImageParts
//   choice.audio        → first AudioPart or undefined
```

### 1.5 Unified Streaming (Normalized)

Streaming events follow a **content-part lifecycle** model inspired by Anthropic's SSE design
(the most granular of all providers). Every provider's stream events are normalized into this
single event taxonomy.

```typescript
// ─── Stream Events (Discriminated Union) ────────────────────────────────

type ChatStreamEvent =
  // Content part lifecycle
  | ContentStartEvent
  | ContentDeltaEvent
  | ContentDoneEvent

  // Message lifecycle
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageDoneEvent

  // Meta
  | UsageEvent
  | ErrorEvent;

interface MessageStartEvent {
  type: "message.start";
  id: string;
  model: string;
}

interface ContentStartEvent {
  type: "content.start";
  choiceIndex: number;
  partIndex: number;
  part: ResponsePartStart;                         // Metadata about what kind of part is starting
}

interface ContentDeltaEvent {
  type: "content.delta";
  choiceIndex: number;
  partIndex: number;
  delta: ResponsePartDelta;                        // Incremental data for the current part
}

interface ContentDoneEvent {
  type: "content.done";
  choiceIndex: number;
  partIndex: number;
  part: ResponsePart;                              // The fully assembled part
}

interface MessageDeltaEvent {
  type: "message.delta";
  choiceIndex: number;
  finishReason: FinishReason;
}

interface MessageDoneEvent {
  type: "message.done";
  response: ChatResponse;                          // The fully assembled response
}

interface UsageEvent {
  type: "usage";
  usage: Usage;
}

interface ErrorEvent {
  type: "error";
  error: LLMError;
}

// ─── Part Start (what kind of content is beginning) ─────────────────────

type ResponsePartStart =
  | { type: "text" }
  | { type: "tool_call"; id: string; name: string }
  | { type: "thinking" }
  | { type: "image"; mimeType: string }
  | { type: "audio"; mimeType: string }
  | { type: "code_execution"; language: string }
  | { type: "server_tool_call"; id: string; name: string };

// ─── Part Delta (incremental content) ───────────────────────────────────

type ResponsePartDelta =
  | { type: "text"; text: string }
  | { type: "tool_call.arguments"; arguments: string }
  | { type: "thinking"; thinking: string }
  | { type: "thinking.signature"; signature: string }
  | { type: "image"; data: string }                // Base64 chunk
  | { type: "audio"; data: string }                // Base64 chunk
  | { type: "audio.transcript"; transcript: string }
  | { type: "citation"; citation: Citation };
```

### 1.6 Embeddings

```typescript
interface EmbedRequest {
  model: string;                          // "provider/model-id"
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

### 1.7 Errors

```typescript
class LLMError extends Error {
  constructor(
    message: string,
    public provider: string,
    public status?: number,
    public retryable: boolean = false,
    public raw?: unknown
  ) { super(message); this.name = "LLMError"; }
}

// Status-based classification (works for ALL providers)
function classifyError(provider: string, status: number, body: unknown): LLMError {
  const msg = extractMessage(body);
  switch (status) {
    case 401: case 403: return new LLMError(msg, provider, status, false, body);
    case 404:           return new LLMError(msg, provider, status, false, body);
    case 429:           return new LLMError(msg, provider, status, true, body);
    case 400: case 422: return new LLMError(msg, provider, status, false, body);
    default:            return new LLMError(msg, provider, status, status >= 500, body);
  }
}

// Extract error message from any provider's error shape
function extractMessage(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    // OpenAI/Groq/Together/etc: { error: { message: "..." } }
    if ("error" in body) {
      const err = (body as any).error;
      return typeof err === "string" ? err : err?.message ?? JSON.stringify(err);
    }
    // Anthropic: { error: { message: "..." }, type: "error" }
    // Google: { error: { message: "...", status: "..." } }
    // Both handled by the above
    if ("message" in body) return (body as any).message;
  }
  return String(body);
}
```

---

## 2. Provider Registry

### 2.1 Config Schema

```typescript
interface ProviderEntry {
  baseURL: string;
  auth: "bearer" | "x-api-key" | "x-goog-api-key" | "none";
  transform?: "anthropic" | "google";    // if set, use transform layer instead of direct dispatch
  strip?: string[];                      // request params to remove before sending
  rename?: Record<string, string>;       // request params to rename (e.g. seed → random_seed)
  clamp?: Record<string, number | [number, number]>;  // clamp param values or force max
  defaults?: Record<string, unknown>;    // inject defaults (e.g. max_tokens for Anthropic)
  headers?: Record<string, string>;      // extra headers (e.g. anthropic-version)
  streamTerminator?: string;             // how streaming ends: "[DONE]" (default) | "message_stop" | null (close)
}
```

### 2.2 Provider Table

```typescript
const PROVIDERS: Record<string, ProviderEntry> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    auth: "bearer",
  },

  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    auth: "bearer",
    strip: ["frequency_penalty", "presence_penalty", "logprobs", "top_logprobs", "logit_bias"],
    clamp: { n: 1 },
  },

  together: {
    baseURL: "https://api.together.xyz/v1",
    auth: "bearer",
  },

  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    auth: "bearer",
    rename: { seed: "random_seed" },
    clamp: { temperature: [0, 1] },
  },

  deepseek: {
    baseURL: "https://api.deepseek.com",
    auth: "bearer",
    strip: ["n", "seed", "user", "logit_bias"],
  },

  fireworks: {
    baseURL: "https://api.fireworks.ai/inference/v1",
    auth: "bearer",
  },

  perplexity: {
    baseURL: "https://api.perplexity.ai",
    auth: "bearer",
    strip: ["tools", "tool_choice", "parallel_tool_calls", "frequency_penalty",
            "presence_penalty", "logprobs", "top_logprobs", "logit_bias",
            "seed", "n", "user"],
  },

  ollama: {
    baseURL: "http://localhost:11434/v1",
    auth: "none",
    strip: ["tool_choice", "logprobs", "top_logprobs", "logit_bias", "n", "user"],
  },

  cohere: {
    baseURL: "https://api.cohere.ai/compatibility/v1",
    auth: "bearer",
    strip: ["logit_bias", "top_logprobs", "n", "user", "parallel_tool_calls"],
    clamp: { temperature: [0, 1] },
  },

  anthropic: {
    baseURL: "https://api.anthropic.com/v1",
    auth: "x-api-key",
    transform: "anthropic",
    headers: { "anthropic-version": "2023-06-01" },
    defaults: { max_tokens: 4096 },
  },

  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    auth: "x-goog-api-key",
    transform: "google",
  },
};
```

### 2.3 Parameter Filter Function

```typescript
function filterParams(request: ChatRequest, entry: ProviderEntry): Record<string, unknown> {
  const body: Record<string, unknown> = { ...request };
  delete body.model;      // handled separately
  delete body.metadata;   // internal

  // Strip unsupported params
  for (const key of entry.strip ?? []) {
    delete body[key];
  }

  // Rename params
  for (const [from, to] of Object.entries(entry.rename ?? {})) {
    if (from in body) {
      body[to] = body[from];
      delete body[from];
    }
  }

  // Clamp values
  for (const [key, constraint] of Object.entries(entry.clamp ?? {})) {
    if (key in body && body[key] != null) {
      if (typeof constraint === "number") {
        body[key] = constraint;  // force value (e.g. n: 1)
      } else if (Array.isArray(constraint)) {
        const [min, max] = constraint;
        body[key] = Math.min(Math.max(body[key] as number, min), max);
      }
    }
  }

  // Inject defaults
  for (const [key, value] of Object.entries(entry.defaults ?? {})) {
    if (!(key in body) || body[key] == null) {
      body[key] = value;
    }
  }

  return body;
}
```

---

## 3. OpenAI-Compatible Provider (Single Implementation)

### 3.1 Non-Streaming Chat

```typescript
async function chat(
  entry: ProviderEntry,
  apiKey: string,
  model: string,
  request: ChatRequest
): Promise<ChatResponse> {
  const body = filterParams(request, entry);
  body.model = model;
  body.stream = false;

  const res = await fetch(`${entry.baseURL}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(entry, apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => res.statusText);
    throw classifyError(entry.baseURL, res.status, errorBody);
  }

  const data = await res.json();
  return normalizeResponse(data, providerName(entry));
}
```

### 3.2 Streaming Chat (SSE Parser)

```typescript
async function* chatStream(
  entry: ProviderEntry,
  apiKey: string,
  model: string,
  request: ChatRequest
): AsyncIterable<ChatStreamEvent> {
  const body = filterParams(request, entry);
  body.model = model;
  body.stream = true;
  body.stream_options = { include_usage: true };

  const res = await fetch(`${entry.baseURL}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(entry, apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => res.statusText);
    throw classifyError(entry.baseURL, res.status, errorBody);
  }

  // Parse SSE stream
  for await (const line of readSSELines(res.body!)) {
    if (line === "[DONE]") {
      yield { type: "done" };
      return;
    }

    const chunk = JSON.parse(line);

    // Emit deltas
    for (const choice of chunk.choices ?? []) {
      yield {
        type: "delta",
        index: choice.index,
        delta: choice.delta,
        finish_reason: choice.finish_reason,
      };
    }

    // Emit usage (final chunk)
    if (chunk.usage) {
      yield { type: "usage", usage: normalizeUsage(chunk.usage) };
    }
  }
}
```

### 3.3 SSE Line Reader

```typescript
async function* readSSELines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data.length > 0) yield data;
      }
    }
  }
}
```

### 3.4 Header Builder

```typescript
function buildHeaders(entry: ProviderEntry, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  switch (entry.auth) {
    case "bearer":
      headers["authorization"] = `Bearer ${apiKey}`;
      break;
    case "x-api-key":
      headers["x-api-key"] = apiKey;
      break;
    case "x-goog-api-key":
      headers["x-goog-api-key"] = apiKey;
      break;
    case "none":
      break;
  }

  // Merge extra headers (e.g. anthropic-version)
  Object.assign(headers, entry.headers ?? {});

  return headers;
}
```

---

## 4. Anthropic Transform (Full Specification)

### 4.1 Request Transform: OpenAI → Anthropic

```
INPUT: ChatRequest (OpenAI format)
OUTPUT: Anthropic Messages API request body

RULES:
1. SYSTEM MESSAGES
   - Extract ALL messages where role === "system"
   - Concatenate their content with "\n\n"
   - Place as top-level `system` string parameter
   - Remove system messages from the messages array

2. MESSAGES
   - Only "user" and "assistant" roles in messages array
   - "tool" role messages → convert to "user" role with tool_result content blocks:
     { role: "user", content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }] }
   - Adjacent same-role messages must be merged (Anthropic requires alternation)

3. CONTENT
   - String content → pass through as string
   - ContentPart[] → map each part:
     - { type: "text", text } → { type: "text", text }
     - { type: "image_url", image_url: { url } } →
       If url starts with "data:": parse media_type and base64 →
         { type: "image", source: { type: "base64", media_type, data } }
       Else:
         { type: "image", source: { type: "url", url } }

4. TOOL CALLS (in assistant messages)
   - message.tool_calls[] → convert to content blocks:
     [{ type: "tool_use", id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) }]
   - If message also has text content, prepend a text block

5. TOOL DEFINITIONS
   - tools[].function → flatten to:
     { name, description, input_schema: parameters }
   - Remove the { type: "function", function: { ... } } wrapper

6. TOOL_CHOICE
   - "auto" → { type: "auto" }
   - "required" → { type: "any" }
   - "none" → { type: "none" }  (or omit tools entirely)
   - { type: "function", function: { name: N } } → { type: "tool", name: N }

7. PARAMETERS
   - max_tokens: REQUIRED. Use request.max_tokens ?? entry.defaults.max_tokens ?? 4096
   - temperature: clamp to [0, 1] (Anthropic range)
   - stop → stop_sequences
   - Remove: frequency_penalty, presence_penalty, logprobs, top_logprobs,
             logit_bias, n, seed, stream_options, response_format, user
   - user → metadata.user_id (if present)

8. RESPONSE_FORMAT (structured output workaround)
   - Anthropic has no native json_schema mode
   - If response_format.type === "json_schema":
     Inject schema description into system prompt:
     "Respond with JSON matching this schema: ${JSON.stringify(schema)}"
   - If response_format.type === "json_object":
     Append to system prompt: "Respond with valid JSON only."

9. ENDPOINT
   - POST ${baseURL}/messages
   - NOT /chat/completions
```

### 4.2 Response Transform: Anthropic → Unified

See **Section 11.3** for the complete normalization rules. Key points:

- Content blocks map 1:1 to ResponsePart union types
- All 7 Anthropic block types handled: text, tool_use, thinking, redacted_thinking, server_tool_use, web_search_tool_result
- Citations (4 types) normalized to unified Citation union
- Stop reasons (7 values including pause_turn, refusal) mapped to 4 FinishReason values
- Usage includes cache_creation and cache_read details

### 4.3 Stream Transform: Anthropic SSE → OpenAI-format events

```
INPUT: Anthropic SSE events (named events with typed payloads)
OUTPUT: ChatStreamEvent (our unified format)

EVENT MAPPING:
  message_start →
    Extract usage.input_tokens → store for later
    No emit (wait for content)

  content_block_start →
    If block.type === "text": prepare text accumulator for this index
    If block.type === "tool_use": emit delta with tool call metadata
      { type: "delta", delta: { tool_calls: [{ index, id: block.id, type: "function", function: { name: block.name } }] } }

  content_block_delta →
    If delta.type === "text_delta":
      { type: "delta", delta: { content: delta.text } }
    If delta.type === "input_json_delta":
      { type: "delta", delta: { tool_calls: [{ index, function: { arguments: delta.partial_json } }] } }

  content_block_stop →
    No emit (content already streamed)

  message_delta →
    Map stop_reason → finish_reason
    { type: "delta", finish_reason: mapped_reason }

  message_stop →
    Emit usage event with accumulated input_tokens + output_tokens from message_delta
    { type: "usage", usage: { prompt_tokens, completion_tokens, total_tokens } }
    { type: "done" }

  ping →
    Ignore

  error →
    { type: "error", error: classifyError(...) }
```

---

## 5. Google Gemini Transform (Full Specification)

### 5.1 Request Transform: OpenAI → Gemini

```
INPUT: ChatRequest (OpenAI format)
OUTPUT: Gemini generateContent request body

RULES:
1. SYSTEM MESSAGES
   - Extract role === "system" messages
   - Place as: systemInstruction: { parts: [{ text: joined_content }] }
   - Remove from messages array

2. MESSAGES → contents
   - "user" → role: "user"
   - "assistant" → role: "model"
   - "tool" → role: "user" with functionResponse parts (see #5)

3. CONTENT → parts
   - String content → [{ text: content }]
   - ContentPart[] → map each:
     - { type: "text", text } → { text }
     - { type: "image_url", image_url: { url } } →
       If url starts with "data:": parse →
         { inlineData: { mimeType, data: base64 } }
       Else:
         { inlineData: { mimeType: "image/jpeg", data: ... } }
         Note: Gemini doesn't support image URLs directly — would need download or error

4. TOOL CALLS (in assistant/model messages)
   - tool_calls[] → parts[]:
     { functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } }

5. TOOL RESULT MESSAGES
   - role: "tool" messages → role: "user" with:
     { functionResponse: { name: <matched_function_name>, response: JSON.parse(content) } }
   - Note: Gemini matches by name, not by ID. Must resolve tool_call_id → function name
     from the preceding assistant message's tool_calls

6. TOOL DEFINITIONS
   - tools[].function → functionDeclarations[]:
     { name, description, parameters: convertSchemaTypes(parameters) }
   - Schema type conversion: lowercase → UPPERCASE
     "string" → "STRING", "number" → "NUMBER", "integer" → "INTEGER",
     "boolean" → "BOOLEAN", "array" → "ARRAY", "object" → "OBJECT"
   - Wrap in: tools: [{ functionDeclarations: [...] }]

7. TOOL_CHOICE → toolConfig
   - "auto" → { functionCallingConfig: { mode: "AUTO" } }
   - "required" → { functionCallingConfig: { mode: "ANY" } }
   - "none" → { functionCallingConfig: { mode: "NONE" } }
   - { function: { name: N } } → { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [N] } }

8. GENERATION PARAMS → generationConfig
   - temperature → temperature (pass through, same 0-2 range)
   - top_p → topP
   - max_tokens → maxOutputTokens
   - stop → stopSequences
   - n → candidateCount
   - frequency_penalty → frequencyPenalty
   - presence_penalty → presencePenalty
   - seed → seed
   - logprobs → responseLogprobs (boolean)
   - top_logprobs → logprobs (number)

9. RESPONSE_FORMAT → generationConfig
   - { type: "json_object" } → responseMimeType: "application/json"
   - { type: "json_schema", json_schema: { schema } } →
     responseMimeType: "application/json" + responseSchema: convertSchemaTypes(schema)

10. ENDPOINT
    - POST ${baseURL}/models/${model}:generateContent
    - Stream: POST ${baseURL}/models/${model}:streamGenerateContent?alt=sse
    - NOT /chat/completions

11. REMOVE (no Gemini equivalent)
    - logit_bias, user, parallel_tool_calls, stream_options
```

### 5.2 Response Transform: Gemini → Unified

See **Section 11.5** for the complete normalization rules. Key points:

- All 7 Gemini part types handled: text, functionCall, inlineData (image/audio), executableCode, codeExecutionResult, thought parts
- Gemini now has tool call IDs (functionCall.id) — use them when present, generate when absent
- Grounding metadata mapped to UrlCitation array with segment offsets + confidence scores
- 11 finish reasons mapped (including SAFETY, RECITATION, BLOCKLIST, SPII, MALFORMED_FUNCTION_CALL)
- Usage includes thoughtsTokenCount and per-modality breakdowns (TEXT, IMAGE, AUDIO, VIDEO)

### 5.3 Stream Transform: Gemini SSE → OpenAI-format events

```
INPUT: Gemini SSE data lines (each is a full GenerateContentResponse JSON)
OUTPUT: ChatStreamEvent (our unified format)

RULES:
  Each SSE `data:` line:
    Parse JSON as GenerateContentResponse

    For each candidate in candidates[]:
      For each part in content.parts[]:
        If { text: "..." }:
          { type: "delta", index: candidate_index, delta: { content: text }, finish_reason: null }
        If { functionCall: { name, args } }:
          { type: "delta", index: candidate_index, delta: { tool_calls: [{ index: part_index, id: generateId(), type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }

      If finishReason present:
        { type: "delta", index: candidate_index, delta: {}, finish_reason: mapFinishReason(finishReason) }

    If usageMetadata present (final chunk):
      { type: "usage", usage: { prompt_tokens, completion_tokens, total_tokens } }

  On stream close (no [DONE] sentinel for Gemini):
    { type: "done" }
```

---

## 6. Client (AgentLoop)

### 6.1 Model Routing

```typescript
function parseModel(model: string, defaultProvider?: string): [string, string] {
  const slash = model.indexOf("/");
  if (slash === -1) {
    if (!defaultProvider) throw new LLMError("No provider prefix in model string and no default set", "client");
    return [defaultProvider, model];
  }
  return [model.slice(0, slash), model.slice(slash + 1)];
}
```

### 6.2 Dispatch Logic

```typescript
class AgentLoop {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const [providerName, model] = parseModel(request.model, this.config.defaultProvider);
    const entry = this.registry.get(providerName);
    const apiKey = this.config.providers?.[providerName]?.apiKey ?? "";

    // Apply middleware pipeline
    const handler = this.compose((req) => this.dispatch(entry, apiKey, model, req));
    return handler(request);
  }

  private async dispatch(
    entry: ProviderEntry,
    apiKey: string,
    model: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    if (entry.transform === "anthropic") {
      return anthropicChat(entry, apiKey, model, request);
    }
    if (entry.transform === "google") {
      return googleChat(entry, apiKey, model, request);
    }
    return openaiCompatChat(entry, apiKey, model, request);
  }
}
```

### 6.3 Structured Output

```typescript
async chatStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<{ data: T; response: ChatResponse }> {
  const [providerName] = parseModel(request.model, this.config.defaultProvider);
  const entry = this.registry.get(providerName);

  let modifiedRequest = { ...request };

  // Provider-specific structured output strategy
  if (entry.transform === "anthropic") {
    // Anthropic: inject schema into system prompt (no native json_schema)
    const schemaJson = zodToJsonSchema(schema);
    const systemMsg: ChatMessage = {
      role: "system",
      content: `Respond ONLY with valid JSON matching this schema:\n${JSON.stringify(schemaJson, null, 2)}`
    };
    modifiedRequest.messages = [systemMsg, ...modifiedRequest.messages];
  } else {
    // All others: use response_format
    modifiedRequest.response_format = {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: zodToJsonSchema(schema) },
    };
  }

  const response = await this.chat(modifiedRequest);
  const text = response.choices[0].message.content;
  if (!text) throw new LLMError("Empty response for structured output", providerName);

  const data = schema.parse(JSON.parse(text));
  return { data, response };
}
```

---

## 7. Middleware

### 7.1 Compose Function

```typescript
type Middleware = (
  request: ChatRequest,
  next: (request: ChatRequest) => Promise<ChatResponse>
) => Promise<ChatResponse>;

function compose(
  middlewares: Middleware[],
  handler: (request: ChatRequest) => Promise<ChatResponse>
): (request: ChatRequest) => Promise<ChatResponse> {
  return middlewares.reduceRight(
    (next, mw) => (req) => mw(req, next),
    handler
  );
}
```

### 7.2 Retry

```typescript
function retry(opts: { maxRetries?: number; baseDelay?: number } = {}): Middleware {
  const { maxRetries = 3, baseDelay = 1000 } = opts;
  return async (request, next) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await next(request);
      } catch (e) {
        lastError = e;
        if (attempt === maxRetries) break;
        if (e instanceof LLMError && !e.retryable) break;
        const delay = baseDelay * 2 ** attempt + Math.random() * baseDelay * 0.1;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  };
}
```

### 7.3 Fallback

```typescript
function fallback(models: string[]): Middleware {
  return async (request, next) => {
    let lastError: unknown;
    for (const model of models) {
      try {
        return await next({ ...request, model });
      } catch (e) {
        lastError = e;
        continue;
      }
    }
    throw lastError;
  };
}
```

### 7.4 Cache

```typescript
function cache(opts: { store?: Map<string, { response: ChatResponse; expires: number }>; ttl?: number } = {}): Middleware {
  const { store = new Map(), ttl = 300_000 } = opts;
  return async (request, next) => {
    // Don't cache streaming or tool-calling requests
    if (request.stream || request.tools?.length) return next(request);

    const key = stableHash(request);
    const cached = store.get(key);
    if (cached && cached.expires > Date.now()) return cached.response;

    const response = await next(request);
    store.set(key, { response, expires: Date.now() + ttl });
    return response;
  };
}

function stableHash(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}
```

### 7.5 Logger

```typescript
function logger(log: (entry: LogEntry) => void = (e) => console.log(JSON.stringify(e))): Middleware {
  return async (request, next) => {
    const [provider, model] = parseModel(request.model);
    const start = Date.now();
    try {
      const response = await next(request);
      log({ provider, model, latency_ms: Date.now() - start, status: "ok", usage: response.usage });
      return response;
    } catch (e) {
      log({ provider, model, latency_ms: Date.now() - start, status: "error", error: String(e) });
      throw e;
    }
  };
}

interface LogEntry {
  provider: string;
  model: string;
  latency_ms: number;
  status: "ok" | "error";
  usage?: Usage;
  error?: string;
}
```

---

## 8. Embeddings

### 8.1 OpenAI-Compatible Embeddings

```typescript
async function embed(
  entry: ProviderEntry,
  apiKey: string,
  model: string,
  request: EmbedRequest
): Promise<EmbedResponse> {
  const body: Record<string, unknown> = { model, input: request.input };
  if (request.dimensions) body.dimensions = request.dimensions;

  const res = await fetch(`${entry.baseURL}/embeddings`, {
    method: "POST",
    headers: buildHeaders(entry, apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw classifyError(providerName(entry), res.status, await res.json().catch(() => res.statusText));
  }

  const data = await res.json();
  return {
    model: data.model,
    provider: providerName(entry),
    embeddings: data.data.map((d: any) => d.embedding),
    usage: { prompt_tokens: data.usage.prompt_tokens, total_tokens: data.usage.total_tokens },
  };
}
```

### 8.2 Google Gemini Embeddings Transform

```typescript
async function geminiEmbed(
  entry: ProviderEntry,
  apiKey: string,
  model: string,
  request: EmbedRequest
): Promise<EmbedResponse> {
  const inputs = Array.isArray(request.input) ? request.input : [request.input];

  // Use batchEmbedContents for multiple inputs, embedContent for single
  if (inputs.length === 1) {
    const body = {
      model: `models/${model}`,
      content: { parts: [{ text: inputs[0] }] },
      ...(request.dimensions ? { outputDimensionality: request.dimensions } : {}),
    };

    const res = await fetch(`${entry.baseURL}/models/${model}:embedContent`, {
      method: "POST",
      headers: buildHeaders(entry, apiKey),
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return {
      model, provider: "google",
      embeddings: [data.embedding.values],
      usage: { prompt_tokens: 0, total_tokens: 0 },  // Gemini doesn't return token counts for embeddings
    };
  }

  // Batch
  const body = {
    requests: inputs.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      ...(request.dimensions ? { outputDimensionality: request.dimensions } : {}),
    })),
  };

  const res = await fetch(`${entry.baseURL}/models/${model}:batchEmbedContents`, {
    method: "POST",
    headers: buildHeaders(entry, apiKey),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return {
    model, provider: "google",
    embeddings: data.embeddings.map((e: any) => e.values),
    usage: { prompt_tokens: 0, total_tokens: 0 },
  };
}
```

---

## 9. Public API Surface

```typescript
// index.ts
export { AgentLoop } from "./client";
export type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatStreamEvent,
  Choice,
  Usage,
  ContentPart,
  ToolDefinition,
  ToolCall,
  EmbedRequest,
  EmbedResponse,
  ResponseFormat,
  AgentLoopConfig,
  ProviderConfig,
} from "./types";
export { LLMError } from "./errors";
export { retry, fallback, cache, logger } from "./middleware";
export type { Middleware, LogEntry } from "./middleware";
```

### Usage Examples

```typescript
import { AgentLoop, retry, fallback, logger } from "agentloop";
import { z } from "zod";

const ai = new AgentLoop({
  providers: {
    openai:    { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    google:    { apiKey: process.env.GOOGLE_API_KEY },
    groq:      { apiKey: process.env.GROQ_API_KEY },
    ollama:    {},  // no key needed
  },
  middleware: [retry(), logger()],
});

// ── Basic chat (any provider — same response format) ──────────────────

const res = await ai.chat({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
// Convenience accessor — works identically for all 11 providers:
console.log(res.choices[0].text);       // "Hello! How can I help?"
// Or iterate content parts for full control:
for (const part of res.choices[0].content) {
  if (part.type === "text") console.log(part.text);
}

// ── Streaming (content-part lifecycle events) ─────────────────────────

for await (const event of ai.stream({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Write a poem" }],
})) {
  switch (event.type) {
    case "content.delta":
      if (event.delta.type === "text") process.stdout.write(event.delta.text);
      if (event.delta.type === "thinking") process.stderr.write(event.delta.thinking);
      break;
    case "message.done":
      console.log("\nUsage:", event.response.usage);
      break;
  }
}

// ── Reasoning/thinking (normalized from ALL providers) ────────────────

const reasoning = await ai.chat({
  model: "deepseek/deepseek-reasoner",   // or anthropic/claude-sonnet-4-20250514, google/gemini-2.5-flash
  messages: [{ role: "user", content: "Solve: x^2 + 5x + 6 = 0" }],
});
// Same API regardless of provider:
console.log(reasoning.choices[0].thinking);   // "Let me factor... (x+2)(x+3)=0..."
console.log(reasoning.choices[0].text);       // "x = -2 or x = -3"

// ── Tool calling ──────────────────────────────────────────────────────

const res2 = await ai.chat({
  model: "groq/llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Weather in NYC?" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  }],
});
// Convenience accessor:
for (const tc of res2.choices[0].toolCalls) {
  console.log(tc.name, JSON.parse(tc.arguments));
}

// ── Citations (normalized from 5 different provider formats) ──────────

const cited = await ai.chat({
  model: "perplexity/sonar-pro",          // or anthropic/, google/ with grounding
  messages: [{ role: "user", content: "When was Claude Shannon born?" }],
});
for (const part of cited.choices[0].content) {
  if (part.type === "text" && part.citations) {
    for (const c of part.citations) {
      if (c.type === "url") console.log(`Source: ${c.title} — ${c.url}`);
    }
  }
}

// ── Multimodal output (Gemini image/audio/code) ───────────────────────

const creative = await ai.chat({
  model: "google/gemini-2.5-flash",
  messages: [{ role: "user", content: "Generate an image of a sunset and explain it" }],
});
for (const part of creative.choices[0].content) {
  if (part.type === "image") fs.writeFileSync("sunset.png", Buffer.from(part.data, "base64"));
  if (part.type === "text") console.log(part.text);
  if (part.type === "code_execution") console.log("Code:", part.code);
  if (part.type === "code_result") console.log("Output:", part.output);
}

// ── Structured output ─────────────────────────────────────────────────

const { data } = await ai.chatStructured(
  { model: "openai/gpt-4o", messages: [{ role: "user", content: "List 3 colors" }] },
  z.object({ colors: z.array(z.string()) })
);

// ── Embeddings ────────────────────────────────────────────────────────

const emb = await ai.embed({
  model: "openai/text-embedding-3-small",
  input: ["hello world", "goodbye world"],
});

// ── Fallback: try providers in order ──────────────────────────────────

ai.use(fallback(["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514", "groq/llama-3.3-70b"]));

// ── Custom provider (any OpenAI-compatible endpoint) ──────────────────

const ai2 = new AgentLoop({
  providers: {
    custom: { apiKey: "...", baseURL: "https://my-vllm-server.com/v1" },
  },
});
```

---

## 10. Package Configuration

```json
{
  "name": "agentloop",
  "version": "0.1.0",
  "description": "Universal LLM API — one interface, every provider",
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" },
    "./middleware": { "import": "./dist/middleware.js", "types": "./dist/middleware.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "zod": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "zod": { "optional": true }
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "zod": "^3.23.0"
  }
}
```

**Key: zero runtime dependencies.** Uses native `fetch()` (Node 18+). Zod is optional peer dep only needed for `chatStructured()`.

---

## 11. Response Normalization Rules

This section specifies **exactly** how each provider's raw response is transformed into
the unified `ChatResponse` format. The user of AgentLoop never sees provider-specific shapes.

### 11.1 OpenAI Response Normalization

```
INPUT:  OpenAI chat.completion (raw JSON)
OUTPUT: ChatResponse (unified)

RULES:

1. TOP-LEVEL
   - id: pass through
   - model: pass through
   - provider: "openai"
   - providerMetadata: { systemFingerprint, serviceTier } if present

2. CHOICES → choices[]
   For each raw choice:
     parts = []

     A. THINKING (reasoning_content — if present, e.g. o-series via compat providers)
        If message.reasoning_content OR message.reasoning:
          parts.push({ type: "thinking", thinking: content })

     B. TEXT
        If message.content is non-null string:
          textPart = { type: "text", text: message.content }
          If message.annotations:
            textPart.citations = message.annotations
              .filter(a => a.type === "url_citation")
              .map(a => ({
                type: "url",
                url: a.url_citation.url,
                title: a.url_citation.title,
                startIndex: a.url_citation.start_index,
                endIndex: a.url_citation.end_index,
              }))
          parts.push(textPart)

     C. TOOL CALLS
        If message.tool_calls:
          For each tc:
            parts.push({
              type: "tool_call",
              id: tc.id,
              name: tc.function.name,
              arguments: ensureString(tc.function.arguments)  // Fireworks may return object
            })

     D. AUDIO OUTPUT
        If message.audio:
          parts.push({
            type: "audio",
            mimeType: "audio/" + requestedFormat,  // from request.audio.format
            data: message.audio.data,
            transcript: message.audio.transcript,
            expiresAt: message.audio.expires_at,
          })

     E. REFUSAL
        If message.refusal is non-null:
          parts.push({ type: "text", text: message.refusal })
          finishReason = "content_filter"

     finishReason = normalizeFinishReason(choice.finish_reason)
     index = choice.index

3. FINISH REASON NORMALIZATION
   "stop"            → "stop"
   "length"          → "length"
   "tool_calls"      → "tool_calls"
   "content_filter"  → "content_filter"
   "function_call"   → "tool_calls"    (legacy)

4. USAGE
   promptTokens:     usage.prompt_tokens
   completionTokens: usage.completion_tokens
   totalTokens:      usage.total_tokens
   details: {
     reasoningTokens:           usage.completion_tokens_details?.reasoning_tokens,
     cachedTokens:              usage.prompt_tokens_details?.cached_tokens,
     audioPromptTokens:         usage.prompt_tokens_details?.audio_tokens,
     audioCompletionTokens:     usage.completion_tokens_details?.audio_tokens,
   }
```

### 11.2 OpenAI-Compatible Provider Normalization Quirks

All OpenAI-compat providers use the same normalizer as OpenAI (section 11.1),
with these **per-provider patches** applied BEFORE the standard normalization:

```
GROQ:
  - Streaming: extract usage from x_groq.usage in final chunk (not top-level)
  - Reasoning: message.reasoning (not reasoning_content) → ThinkingPart
  - Strip: x_groq, usage_breakdown from providerMetadata

TOGETHER AI:
  - finish_reason "eos" → "stop" (critical — Together returns "eos" for EOS token)
  - Reasoning: message.reasoning (not reasoning_content) → ThinkingPart
  - Inline <think> tags: for DeepSeek R1 models on Together, reasoning is EMBEDDED
    in message.content as "<think>...</think>". Must parse:
      const thinkMatch = content.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
      if (thinkMatch) {
        parts.unshift({ type: "thinking", thinking: thinkMatch[1] });
        textContent = thinkMatch[2];
      }
  - Strip: choices[].seed, warnings from providerMetadata

MISTRAL:
  - choices[].index: MAY be a string ("0") — coerce to number: Number(choice.index)
  - Reasoning: message.reasoning_content → ThinkingPart
  - Strip: usage.prompt_audio_seconds from providerMetadata

DEEPSEEK:
  - Reasoning: message.reasoning_content → ThinkingPart
  - finish_reason "insufficient_system_resource" → "error"
  - Usage: prompt_cache_hit_tokens → details.cachedTokens
  - Usage: completion_tokens_details.reasoning_tokens → details.reasoningTokens
  - Important: reasoning_content must NOT be passed back in multi-turn messages

FIREWORKS:
  - Reasoning: message.reasoning_content → ThinkingPart
  - Inline <think> tags: same parsing as Together (for DeepSeek R1 models)
  - function.arguments: MAY be a pre-parsed object — coerce:
      typeof args === "object" ? JSON.stringify(args) : args
  - Strip: perf_metrics, raw_output, token_ids, prompt_token_ids
  - Usage: prompt_tokens_details.cached_tokens → details.cachedTokens

PERPLEXITY:
  - NO tool calls (tools stripped in request, tool_calls never in response)
  - Extra top-level fields → extract into text citations:
      if raw.citations:
        Map each URL to UrlCitation: { type: "url", url: raw.citations[i] }
        Attach to TextPart.citations
      if raw.search_results:
        Map to UrlCitations with title, url, citedText: snippet
        Store in providerMetadata.searchResults
      if raw.images:
        Store in providerMetadata.images
      if raw.related_questions:
        Store in providerMetadata.relatedQuestions
  - Usage: citation_tokens, reasoning_tokens, num_search_queries → providerMetadata

OLLAMA:
  - system_fingerprint is always "fp_ollama" — do not propagate
  - No additional normalization needed

COHERE (compatibility):
  - Standard OpenAI format via compat endpoint
  - Native API citations NOT available through compat endpoint
  - No additional normalization needed
```

### 11.3 Anthropic Response Normalization

```
INPUT:  Anthropic Message response { id, type, role, content[], model, stop_reason, usage }
OUTPUT: ChatResponse (unified)

RULES:

1. TOP-LEVEL
   - id: pass through (msg_xxx format)
   - model: pass through
   - provider: "anthropic"
   - Wrap in single choice (Anthropic always returns 1 response)

2. CONTENT BLOCKS → ResponsePart[]
   For each block in response.content:

     "text" →
       part = { type: "text", text: block.text }
       if block.citations:
         part.citations = block.citations.map(mapAnthropicCitation)
       → push to parts

     "tool_use" →
       { type: "tool_call", id: block.id, name: block.name,
         arguments: JSON.stringify(block.input) }

     "thinking" →
       { type: "thinking", thinking: block.thinking, signature: block.signature }

     "redacted_thinking" →
       { type: "redacted_thinking", data: block.data }

     "server_tool_use" →
       { type: "server_tool_call", id: block.id, name: block.name,
         arguments: block.input }

     "web_search_tool_result" →
       { type: "server_tool_result", toolCallId: block.tool_use_id,
         content: block.content }

3. CITATION MAPPING (mapAnthropicCitation)
   "char_location" → {
     type: "document", documentIndex: c.document_index, documentTitle: c.document_title,
     citedText: c.cited_text, startCharIndex: c.start_char_index, endCharIndex: c.end_char_index
   }
   "page_location" → {
     type: "page", documentIndex: c.document_index, documentTitle: c.document_title,
     citedText: c.cited_text, startPage: c.start_page_number, endPage: c.end_page_number
   }
   "content_block_location" → {
     type: "document", documentIndex: c.document_index, documentTitle: c.document_title,
     citedText: c.cited_text, startCharIndex: c.start_block_index, endCharIndex: c.end_block_index
   }
   "web_search_result_location" → {
     type: "url", url: c.url, title: c.title, citedText: c.cited_text
   }

4. STOP REASON → finishReason
   "end_turn"                      → "stop"
   "stop_sequence"                 → "stop"
   "max_tokens"                    → "length"
   "tool_use"                      → "tool_calls"
   "pause_turn"                    → "stop"     (server tool iteration limit)
   "refusal"                       → "content_filter"
   "model_context_window_exceeded" → "length"

5. USAGE
   promptTokens:     usage.input_tokens
   completionTokens: usage.output_tokens
   totalTokens:      usage.input_tokens + usage.output_tokens
   details: {
     cachedTokens:    usage.cache_read_input_tokens,
     cacheWriteTokens: usage.cache_creation_input_tokens,
   }
```

### 11.4 Anthropic Stream Normalization

```
INPUT:  Anthropic SSE events (named event types)
OUTPUT: ChatStreamEvent (unified)

STATE: Maintain a partIndex counter, an accumulator per content block

EVENT MAPPING:

  message_start →
    { type: "message.start", id: msg.id, model: msg.model }
    Store usage.input_tokens for later

  content_block_start →
    Map block type to ResponsePartStart:
      "text"                → { type: "text" }
      "tool_use"            → { type: "tool_call", id: block.id, name: block.name }
      "thinking"            → { type: "thinking" }
      "server_tool_use"     → { type: "server_tool_call", id: block.id, name: block.name }
      "web_search_tool_result" → no content.start (emit full part on content_block_stop)
    Emit: { type: "content.start", choiceIndex: 0, partIndex: index, part: mapped }

  content_block_delta →
    Map delta type to ResponsePartDelta:
      "text_delta"          → { type: "text", text: delta.text }
      "input_json_delta"    → { type: "tool_call.arguments", arguments: delta.partial_json }
      "thinking_delta"      → { type: "thinking", thinking: delta.thinking }
      "signature_delta"     → { type: "thinking.signature", signature: delta.signature }
      "citations_delta"     → { type: "citation", citation: mapAnthropicCitation(delta.citation) }
    Emit: { type: "content.delta", choiceIndex: 0, partIndex: index, delta: mapped }

  content_block_stop →
    Emit: { type: "content.done", choiceIndex: 0, partIndex: index, part: assembledPart }

  message_delta →
    finishReason = mapStopReason(delta.stop_reason)
    Accumulate output_tokens from delta.usage
    Emit: { type: "message.delta", choiceIndex: 0, finishReason }

  message_stop →
    Emit: { type: "usage", usage: assembled }
    Emit: { type: "message.done", response: assembledResponse }

  ping → ignore

  error →
    Emit: { type: "error", error: classifyError("anthropic", ...) }
```

### 11.5 Google Gemini Response Normalization

```
INPUT:  Gemini GenerateContentResponse
OUTPUT: ChatResponse (unified)

RULES:

1. TOP-LEVEL
   - id: responseId (or generate if absent)
   - model: modelVersion
   - provider: "google"
   - providerMetadata: { safetyRatings, groundingMetadata (raw), promptFeedback } if present

2. CANDIDATES → choices[]
   For each candidate:
     parts = []

     For each part in candidate.content.parts:

       A. THINKING (thought: true)
          If part.text AND part.thought === true:
            { type: "thinking", thinking: part.text,
              signature: part.thoughtSignature }  // if present

       B. TEXT
          If part.text AND (part.thought !== true):
            textPart = { type: "text", text: part.text }
            If candidate.groundingMetadata?.groundingSupports:
              textPart.citations = mapGeminiGrounding(candidate.groundingMetadata)
            parts.push(textPart)

       C. FUNCTION CALL
          If part.functionCall:
            { type: "tool_call",
              id: part.functionCall.id ?? generateCallId(),
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args) }

       D. IMAGE OUTPUT
          If part.inlineData AND mimeType starts with "image/":
            { type: "image", mimeType: part.inlineData.mimeType,
              data: part.inlineData.data }

       E. AUDIO OUTPUT
          If part.inlineData AND mimeType starts with "audio/":
            { type: "audio", mimeType: part.inlineData.mimeType,
              data: part.inlineData.data }

       F. CODE EXECUTION
          If part.executableCode:
            { type: "code_execution",
              language: part.executableCode.language.toLowerCase(),
              code: part.executableCode.code }

       G. CODE RESULT
          If part.codeExecutionResult:
            { type: "code_result",
              outcome: mapOutcome(part.codeExecutionResult.outcome),
              output: part.codeExecutionResult.output }
            Where mapOutcome:
              "OUTCOME_OK"                → "ok"
              "OUTCOME_FAILED"            → "error"
              "OUTCOME_DEADLINE_EXCEEDED" → "timeout"

     finishReason = mapGeminiFinishReason(candidate.finishReason)
     index = candidate.index ?? 0

3. GROUNDING CITATION MAPPING (mapGeminiGrounding)
   For each support in groundingMetadata.groundingSupports:
     For each chunkIndex in support.groundingChunkIndices:
       chunk = groundingMetadata.groundingChunks[chunkIndex]
       {
         type: "url",
         url: chunk.web?.uri ?? chunk.retrievedContext?.uri,
         title: chunk.web?.title ?? chunk.retrievedContext?.title,
         citedText: support.segment.text,
         startIndex: support.segment.startIndex,
         endIndex: support.segment.endIndex,
       }

4. FINISH REASON
   "STOP"                    → "stop"
   "MAX_TOKENS"              → "length"
   "SAFETY"                  → "content_filter"
   "RECITATION"              → "content_filter"
   "LANGUAGE"                → "content_filter"
   "BLOCKLIST"               → "content_filter"
   "PROHIBITED_CONTENT"      → "content_filter"
   "SPII"                    → "content_filter"
   "MALFORMED_FUNCTION_CALL" → "error"
   "OTHER"                   → "stop"
   Any functionCall present  → "tool_calls" (override)

5. USAGE
   promptTokens:     usageMetadata.promptTokenCount
   completionTokens: usageMetadata.candidatesTokenCount
   totalTokens:      usageMetadata.totalTokenCount
   details: {
     reasoningTokens: usageMetadata.thoughtsTokenCount,
     cachedTokens:    usageMetadata.cachedContentTokenCount,
     promptTokensByModality: fromModalityArray(usageMetadata.promptTokensDetails),
     completionTokensByModality: fromModalityArray(usageMetadata.candidatesTokensDetails),
   }
```

### 11.6 Gemini Stream Normalization

```
INPUT:  Gemini SSE data lines (each is a full GenerateContentResponse)
OUTPUT: ChatStreamEvent (unified)

STATE: Track partIndex per candidate, previous text to compute deltas

RULES:
  Gemini streams FULL responses (not deltas). Each chunk contains the text
  fragment for that chunk, NOT the cumulative text. We convert to content
  lifecycle events:

  First chunk →
    { type: "message.start", id: responseId, model: modelVersion }

  Each chunk, for each candidate:
    For each part in content.parts:

      If this is a NEW part type (text after thinking, or functionCall):
        Emit content.done for previous part
        Emit content.start for new part

      Map part to content.delta:
        text (thought: true) → { type: "thinking", thinking: part.text }
        text               → { type: "text", text: part.text }
        functionCall       → emit as content.start + content.done (not incremental)
        inlineData         → { type: "image" or "audio", data: part.inlineData.data }
        executableCode     → emit as content.start + content.done
        codeExecutionResult → emit as content.start + content.done

    If finishReason present:
      Emit content.done for last part
      { type: "message.delta", choiceIndex, finishReason: mapped }

    If usageMetadata present (final chunk):
      { type: "usage", usage: normalized }

  On stream close:
    Emit: { type: "message.done", response: assembledResponse }
```

### 11.7 OpenAI-Compatible Stream Normalization

```
INPUT:  SSE data lines from any OpenAI-compatible provider
OUTPUT: ChatStreamEvent (unified)

STATE: Track active partIndex, tool call accumulator, text accumulator per choice

RULES:
  First chunk (has delta.role) →
    { type: "message.start", id: chunk.id, model: chunk.model }

  Content delta (delta.content is non-null) →
    If first text delta (no text part started yet):
      { type: "content.start", choiceIndex, partIndex, part: { type: "text" } }
    { type: "content.delta", choiceIndex, partIndex,
      delta: { type: "text", text: delta.content } }

  Reasoning delta (delta.reasoning OR delta.reasoning_content) →
    If first reasoning delta:
      { type: "content.start", choiceIndex, partIndex, part: { type: "thinking" } }
    { type: "content.delta", choiceIndex, partIndex,
      delta: { type: "thinking", thinking: reasoningText } }

  Tool call delta (delta.tool_calls[]) →
    For each tc in delta.tool_calls:
      If tc.id present (first chunk for this tool call):
        If reasoning was active: emit content.done for thinking part
        If text was active: emit content.done for text part
        { type: "content.start", choiceIndex, partIndex,
          part: { type: "tool_call", id: tc.id, name: tc.function.name } }
      If tc.function.arguments:
        { type: "content.delta", choiceIndex, partIndex,
          delta: { type: "tool_call.arguments", arguments: tc.function.arguments } }

  Audio delta (delta.audio) →
    If delta.audio.data:
      { type: "content.delta", choiceIndex, partIndex,
        delta: { type: "audio", data: delta.audio.data } }
    If delta.audio.transcript:
      { type: "content.delta", choiceIndex, partIndex,
        delta: { type: "audio.transcript", transcript: delta.audio.transcript } }

  Finish (choice.finish_reason is non-null) →
    Emit content.done for active part
    { type: "message.delta", choiceIndex,
      finishReason: normalizeFinishReason(choice.finish_reason) }

  Usage chunk (chunk.usage is non-null, choices is empty []) →
    { type: "usage", usage: normalizeUsage(chunk.usage, providerName) }

  [DONE] sentinel →
    Emit: { type: "message.done", response: assembledResponse }

  Groq streaming quirk:
    In final chunk, extract usage from chunk.x_groq.usage instead of chunk.usage
```

---

## 12. Multimodal Capability Matrix

This table summarizes which OUTPUT modalities each provider supports in chat responses.
AgentLoop normalizes all of these into the unified `ResponsePart` union.

### Output Capabilities

| Output Type | OpenAI | Anthropic | Gemini | Groq | Together | Mistral | DeepSeek | Fireworks | Perplexity | Ollama | Cohere |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Text | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Tool calls | Y | Y | Y | Y | Y | Y | Y | Y | N | Y* | Y |
| Thinking/Reasoning | count only | Y (blocks) | Y (parts) | Y (field) | Y (field) | Y (field) | Y (field) | Y (field) | N | N | N |
| Image output | N** | N | Y | N | N | N | N | N | N | N | N |
| Audio output | Y | N | Y | N | N | N | N | N | N | N | N |
| Code execution | N** | N | Y | N | N | N | N | N | N | N | N |
| Citations | Y (annot) | Y (blocks) | Y (ground) | partial | N | N | N | N | Y (array) | N | Y*** |
| Server tools | N | Y | N | N | N | N | N | N | N | N | N |
| Search results | N | Y (web) | Y (ground) | N | N | N | N | N | Y | N | N |

*Ollama: tool calling without tool_choice
**OpenAI: image gen and code execution only in Responses API, not Chat Completions
***Cohere: citations only via native API, not compatibility endpoint

### Reasoning Field Names by Provider

| Provider | Non-streaming field | Streaming field | Format |
|---|---|---|---|
| OpenAI (o-series) | `reasoning_details` | `delta.reasoning_details` | Summary text |
| Anthropic | `content[].type: "thinking"` | `thinking_delta` | Block with signature |
| Gemini | `parts[].thought: true` | Same, per chunk | Part with thoughtSignature |
| DeepSeek | `message.reasoning_content` | `delta.reasoning_content` | Plain string |
| Mistral | `message.reasoning_content` | `delta.reasoning_content` | Plain string |
| Fireworks | `message.reasoning_content` | `delta.reasoning_content` | Plain string, or `<think>` tags |
| Groq | `message.reasoning` | `delta.reasoning` | Plain string |
| Together | `message.reasoning` | `delta.reasoning` | Plain string, or `<think>` tags |

All of these are normalized to `ThinkingPart { type: "thinking"; thinking: string }`.

### Citation Formats by Provider

| Provider | Location | Format | Normalized To |
|---|---|---|---|
| OpenAI | `message.annotations[].url_citation` | URL + title + offsets | `UrlCitation` |
| Anthropic | `content[].citations[]` | 4 types (char, page, block, web) | `UrlCitation`, `DocumentCitation`, `PageCitation` |
| Gemini | `candidate.groundingMetadata.groundingSupports[]` | Segment + chunk indices + confidence | `UrlCitation` |
| Perplexity | Top-level `citations[]` array | Array of URL strings + `[1]` refs in text | `UrlCitation` |
| Cohere (native) | `message.citations[]` | Start/end + sources[] | `UrlCitation` |

### Finish Reason Normalization

| Raw Value | Provider | Normalized To |
|---|---|---|
| `"stop"` | OpenAI, most compat | `"stop"` |
| `"eos"` | Together AI | `"stop"` |
| `"length"` | OpenAI, most compat | `"length"` |
| `"tool_calls"` | OpenAI, most compat | `"tool_calls"` |
| `"function_call"` | OpenAI (legacy) | `"tool_calls"` |
| `"content_filter"` | OpenAI | `"content_filter"` |
| `"insufficient_system_resource"` | DeepSeek | `"error"` |
| `"end_turn"` | Anthropic | `"stop"` |
| `"stop_sequence"` | Anthropic | `"stop"` |
| `"max_tokens"` | Anthropic | `"length"` |
| `"tool_use"` | Anthropic | `"tool_calls"` |
| `"pause_turn"` | Anthropic | `"stop"` |
| `"refusal"` | Anthropic | `"content_filter"` |
| `"model_context_window_exceeded"` | Anthropic | `"length"` |
| `"STOP"` | Gemini | `"stop"` |
| `"MAX_TOKENS"` | Gemini | `"length"` |
| `"SAFETY"` | Gemini | `"content_filter"` |
| `"RECITATION"` | Gemini | `"content_filter"` |
| `"LANGUAGE"` | Gemini | `"content_filter"` |
| `"BLOCKLIST"` | Gemini | `"content_filter"` |
| `"PROHIBITED_CONTENT"` | Gemini | `"content_filter"` |
| `"SPII"` | Gemini | `"content_filter"` |
| `"MALFORMED_FUNCTION_CALL"` | Gemini | `"error"` |
| `"OTHER"` | Gemini | `"stop"` |

### Usage Normalization

| Provider Field | Normalized To |
|---|---|
| `prompt_tokens` / `input_tokens` / `promptTokenCount` | `usage.promptTokens` |
| `completion_tokens` / `output_tokens` / `candidatesTokenCount` | `usage.completionTokens` |
| `total_tokens` / `totalTokenCount` | `usage.totalTokens` |
| `completion_tokens_details.reasoning_tokens` / `thoughtsTokenCount` | `usage.details.reasoningTokens` |
| `prompt_tokens_details.cached_tokens` / `cache_read_input_tokens` / `prompt_cache_hit_tokens` / `cachedContentTokenCount` | `usage.details.cachedTokens` |
| `cache_creation_input_tokens` | `usage.details.cacheWriteTokens` |
| `prompt_tokens_details.audio_tokens` | `usage.details.audioPromptTokens` |
| `completion_tokens_details.audio_tokens` | `usage.details.audioCompletionTokens` |
| `promptTokensDetails[].{modality, tokenCount}` | `usage.details.promptTokensByModality` |
| `candidatesTokensDetails[].{modality, tokenCount}` | `usage.details.completionTokensByModality` |
