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
  completionTokensByModality?: Record<string, number>;
}
