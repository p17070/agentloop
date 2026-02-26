// AgentLoop — Type System

// ─── Roles & Finish Reasons ──────────────────────────────────────────────────

/** Canonical role type across all providers */
export type Role = "system" | "user" | "assistant" | "tool";

/** Normalized finish reason (all 30+ provider values map to one of these) */
export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";

// ─── Request Types ───────────────────────────────────────────────────────────

/**
 * Cache control hint for provider-native prompt caching.
 *
 * - Anthropic: maps to `cache_control: { type: "ephemeral" }` on content blocks,
 *   system blocks, and tool definitions. Content up to the marked block is cached.
 * - OpenAI: ignored (caching is automatic based on prefix matching).
 * - Gemini: ignored (uses separate `cachedContents` API not yet supported).
 * - All other providers: stripped silently.
 */
export type CacheControl = "ephemeral";

/** Input content part (text, image, audio) in a ChatMessage */
export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | AudioContentPart;

export interface TextContentPart {
  type: "text";
  text: string;
  cache?: CacheControl;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
  cache?: CacheControl;
}

export interface AudioContentPart {
  type: "input_audio";
  input_audio: { data: string; format: "wav" | "mp3" };
  cache?: CacheControl;
}

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /**
   * Cache control hint — marks this message as a cache breakpoint.
   * For Anthropic: applied to the last content block in this message.
   * When `content` is a string, it is converted to a single text block with cache_control.
   */
  cache?: CacheControl;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
  /**
   * Cache control hint — marks this tool definition as a cache breakpoint.
   * For Anthropic: sets `cache_control: { type: "ephemeral" }` on this tool.
   */
  cache?: CacheControl;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Response Types ──────────────────────────────────────────────────────────

/** Discriminated union for response content parts */
export type ResponsePart =
  | TextPart
  | ToolCallPart
  | ThinkingPart
  | RedactedThinkingPart
  | ImagePart
  | AudioPart
  | CodeExecutionPart
  | CodeResultPart
  | ServerToolCallPart
  | ServerToolResultPart;

export interface TextPart {
  type: "text";
  text: string;
  citations?: Citation[];
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
}

export interface ThinkingPart {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface RedactedThinkingPart {
  type: "redacted_thinking";
  data: string;
}

export interface ImagePart {
  type: "image";
  mimeType: string;
  data: string;
}

export interface AudioPart {
  type: "audio";
  mimeType: string;
  data: string;
  transcript?: string;
}

export interface CodeExecutionPart {
  type: "code_execution";
  language: string;
  code: string;
}

export interface CodeResultPart {
  type: "code_result";
  outcome: "ok" | "error" | "timeout";
  output: string;
}

export interface ServerToolCallPart {
  type: "server_tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ServerToolResultPart {
  type: "server_tool_result";
  toolCallId: string;
  content: unknown;
}

// ─── Citations ───────────────────────────────────────────────────────────────

/** Unified citation types */
export type Citation = UrlCitation | DocumentCitation | CharLocationCitation;

export interface UrlCitation {
  type: "url";
  url: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface DocumentCitation {
  type: "document";
  documentId: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface CharLocationCitation {
  type: "char_location";
  citedText: string;
  documentIndex: number;
  startCharIndex: number;
  endCharIndex: number;
}

// ─── Request ────────────────────────────────────────────────────────────────

/** Output format for structured responses */
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } };

/** Unified chat request — the single format users write, regardless of provider */
export interface ChatRequest {
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

// ─── Response ───────────────────────────────────────────────────────────────

/** Normalized chat response — same shape regardless of provider */
export interface ChatResponse {
  id: string;
  provider: string;
  model: string;
  choices: Choice[];
  usage: Usage;
  providerMetadata?: Record<string, unknown>;
}

export interface Choice {
  index: number;
  content: ResponsePart[];
  finishReason: FinishReason;
}

// ─── Streaming Events ───────────────────────────────────────────────────────

export type ChatStreamEvent =
  | ContentStartEvent
  | ContentDeltaEvent
  | ContentDoneEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | UsageEvent
  | ErrorEvent;

export interface MessageStartEvent {
  type: "message.start";
  id: string;
  model: string;
}

export interface ContentStartEvent {
  type: "content.start";
  choiceIndex: number;
  partIndex: number;
  part: ResponsePartStart;
}

export interface ContentDeltaEvent {
  type: "content.delta";
  choiceIndex: number;
  partIndex: number;
  delta: ResponsePartDelta;
}

export interface ContentDoneEvent {
  type: "content.done";
  choiceIndex: number;
  partIndex: number;
  part: ResponsePart;
}

export interface MessageDeltaEvent {
  type: "message.delta";
  choiceIndex: number;
  finishReason: FinishReason;
}

export interface MessageDoneEvent {
  type: "message.done";
  response: ChatResponse;
}

export interface UsageEvent {
  type: "usage";
  usage: Usage;
}

export interface ErrorEvent {
  type: "error";
  error: unknown;
}

export type ResponsePartStart =
  | { type: "text" }
  | { type: "tool_call"; id: string; name: string }
  | { type: "thinking" }
  | { type: "image"; mimeType: string }
  | { type: "audio"; mimeType: string }
  | { type: "code_execution"; language: string }
  | { type: "server_tool_call"; id: string; name: string };

export type ResponsePartDelta =
  | { type: "text"; text: string }
  | { type: "tool_call.arguments"; arguments: string }
  | { type: "thinking"; thinking: string }
  | { type: "thinking.signature"; signature: string }
  | { type: "image"; data: string }
  | { type: "audio"; data: string }
  | { type: "audio.transcript"; transcript: string }
  | { type: "citation"; citation: Citation };

// ─── Embeddings ─────────────────────────────────────────────────────────────

export interface EmbedRequest {
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface EmbedResponse {
  model: string;
  provider: string;
  embeddings: number[][];
  usage: { prompt_tokens: number; total_tokens: number };
}

// ─── Model Catalog ─────────────────────────────────────────────────────────

/** Provider identifier — matches keys in the PROVIDERS registry */
export type ProviderId =
  | "openai" | "anthropic" | "google" | "groq" | "together"
  | "mistral" | "deepseek" | "fireworks" | "perplexity"
  | "ollama" | "cohere" | "xai" | "moonshot" | "cerebras"
  | "sambanova" | "ai21";

/** Model capability category */
export type ModelCategory =
  | "flagship"    // best overall quality
  | "fast"        // optimized for speed/cost
  | "reasoning"   // chain-of-thought / extended thinking
  | "code"        // optimized for code generation
  | "vision"      // image understanding
  | "search"      // web search / RAG
  | "embedding"   // text embeddings
  | "image"       // image generation
  | "audio";      // speech / audio

/** Metadata about a single model */
export interface ModelInfo {
  /** Full model ID as passed to the API (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  id: string;
  /** Human-readable display name (e.g. "GPT-4o", "Claude Sonnet 4") */
  name: string;
  /** Provider this model belongs to */
  provider: ProviderId;
  /** Primary capability categories */
  categories: ModelCategory[];
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Maximum output tokens (if known) */
  maxOutputTokens?: number;
  /** Whether the model is the recommended default for this provider */
  isDefault?: boolean;
  /** Whether the model is deprecated or approaching retirement */
  deprecated?: boolean;
}

/** Summary info about a provider */
export interface ProviderInfo {
  /** Provider identifier */
  id: ProviderId;
  /** Human-readable display name */
  name: string;
  /** Environment variable name for the API key */
  apiKeyEnv: string;
  /** Website URL */
  website: string;
}

// ─── Provider Config ────────────────────────────────────────────────────────

export interface ProviderEntry {
  baseURL: string;
  auth: "bearer" | "x-api-key" | "x-goog-api-key" | "none";
  transform?: "anthropic" | "google";
  strip?: string[];
  rename?: Record<string, string>;
  clamp?: Record<string, number | [number, number]>;
  defaults?: Record<string, unknown>;
  headers?: Record<string, string>;
  streamTerminator?: string;
}

/**
 * User-supplied overrides for a built-in or custom provider.
 * Any field set here takes precedence over the built-in defaults.
 *
 * Common use cases:
 *  - Point at a custom endpoint (Azure OpenAI, self-hosted proxy, LiteLLM)
 *  - Inject extra headers (auth tokens, org IDs, tracing headers)
 *  - Supply the API key directly instead of reading from env
 */
export interface ProviderOverrides {
  /** Override the provider's base URL (e.g. your Azure OpenAI endpoint). */
  baseURL?: string;
  /** Extra headers merged on top of the provider defaults. */
  headers?: Record<string, string>;
  /** API key — if set, used instead of the key from env / client config. */
  apiKey?: string;
}

// ─── Usage ───────────────────────────────────────────────────────────────────

/** Normalized usage information */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  details?: UsageDetails;
}

export interface UsageDetails {
  reasoningTokens?: number;
  /** Tokens read from cache (Anthropic cache_read, OpenAI cached_tokens, DeepSeek cache_hit, Gemini cachedContentTokenCount) */
  cachedTokens?: number;
  /** Tokens written to cache (Anthropic cache_creation_input_tokens) */
  cacheWriteTokens?: number;
  audioTokens?: number;
  audioPromptTokens?: number;
  audioCompletionTokens?: number;
  promptTokensByModality?: Record<string, number>;
  completionTokensByModality?: Record<string, number>;
}
