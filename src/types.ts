// AgentLoop — Type System
// Placeholder — full type definitions will be added in Phase 1

/** Canonical role type across all providers */
export type Role = "system" | "user" | "assistant" | "tool";

/** Normalized finish reason (all 30+ provider values map to one of these) */
export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";

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

/** Normalized usage information */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  details?: UsageDetails;
}

export interface UsageDetails {
  reasoningTokens?: number;
  cachedTokens?: number;
  audioTokens?: number;
  completionTokensByModality?: Record<string, number>;
}
