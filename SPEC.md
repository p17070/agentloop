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

### 1.4 Response

```typescript
interface ChatResponse {
  id: string;
  model: string;
  provider: string;                       // injected by AgentLoop
  choices: Choice[];
  usage: Usage;
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
}
```

### 1.5 Streaming

```typescript
// Discriminated union for stream events
type ChatStreamEvent =
  | { type: "delta"; index: number; delta: StreamDelta; finish_reason: string | null }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; error: LLMError };

interface StreamDelta {
  role?: "assistant";
  content?: string;
  tool_calls?: DeltaToolCall[];
}

interface DeltaToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}
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

### 4.2 Response Transform: Anthropic → OpenAI

```
INPUT: Anthropic response { id, type, role, content[], model, stop_reason, usage }
OUTPUT: ChatResponse (OpenAI format)

RULES:
1. WRAP in choices array (Anthropic returns single response, OpenAI uses choices[])
   { choices: [{ index: 0, message: {...}, finish_reason: "..." }] }

2. CONTENT BLOCKS → message
   - Collect text blocks: join all { type: "text" }.text with ""
   - Collect tool_use blocks → tool_calls[]:
     { id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input) } }
   - message.content = joined text (or null if only tool_use)
   - message.tool_calls = tool calls array (or omit if empty)

3. STOP_REASON → finish_reason
   - "end_turn" → "stop"
   - "stop_sequence" → "stop"
   - "max_tokens" → "length"
   - "tool_use" → "tool_calls"

4. USAGE
   - input_tokens → prompt_tokens
   - output_tokens → completion_tokens
   - total_tokens = input_tokens + output_tokens

5. ID
   - Pass through (msg_xxx format is fine)
```

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

### 5.2 Response Transform: Gemini → OpenAI

```
INPUT: Gemini GenerateContentResponse
OUTPUT: ChatResponse (OpenAI format)

RULES:
1. candidates → choices
   For each candidate:
   - content.parts → extract text and functionCall parts
   - Join all { text } parts → message.content
   - Map { functionCall: { name, args } } →
     tool_calls: [{ id: generateId(), type: "function", function: { name, arguments: JSON.stringify(args) } }]
     Note: Gemini has NO tool call IDs — generate synthetic ones (e.g. "call_" + randomId())

2. finishReason → finish_reason
   - "STOP" → "stop"
   - "MAX_TOKENS" → "length"
   - "SAFETY" → "content_filter"
   - "RECITATION" → "content_filter"
   - Any function call present → "tool_calls"
   - "OTHER" / "LANGUAGE" → "stop" (best approximation)

3. usageMetadata → usage
   - promptTokenCount → prompt_tokens
   - candidatesTokenCount → completion_tokens
   - totalTokenCount → total_tokens

4. ID
   - Use responseId if present, otherwise generate one
```

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

// Chat (any provider)
const res = await ai.chat({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

// Stream
for await (const event of ai.stream({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Write a poem" }],
})) {
  if (event.type === "delta" && event.delta.content) {
    process.stdout.write(event.delta.content);
  }
}

// Structured output
const { data } = await ai.chatStructured(
  { model: "openai/gpt-4o", messages: [{ role: "user", content: "List 3 colors" }] },
  z.object({ colors: z.array(z.string()) })
);

// Tool calling
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

// Embeddings
const emb = await ai.embed({
  model: "openai/text-embedding-3-small",
  input: ["hello world", "goodbye world"],
});

// Fallback: try providers in order
ai.use(fallback(["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514", "groq/llama-3.3-70b"]));

// Custom provider (any OpenAI-compatible endpoint)
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
