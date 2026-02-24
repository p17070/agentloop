// AgentLoop — Universal LLM API
// Public barrel export

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  // Roles & Finish Reasons
  Role,
  FinishReason,

  // Request types
  CacheControl,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  AudioContentPart,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  ChatRequest,
  ResponseFormat,

  // Response types
  ResponsePart,
  TextPart,
  ToolCallPart,
  ThinkingPart,
  RedactedThinkingPart,
  ImagePart,
  AudioPart,
  CodeExecutionPart,
  CodeResultPart,
  ServerToolCallPart,
  ServerToolResultPart,
  ChatResponse,
  Choice,

  // Streaming
  ChatStreamEvent,
  ContentStartEvent,
  ContentDeltaEvent,
  ContentDoneEvent,
  MessageStartEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  UsageEvent,
  ErrorEvent,
  ResponsePartStart,
  ResponsePartDelta,

  // Citations
  Citation,
  UrlCitation,
  DocumentCitation,
  CharLocationCitation,

  // Usage
  Usage,
  UsageDetails,

  // Embeddings
  EmbedRequest,
  EmbedResponse,

  // Provider config
  ProviderEntry,

  // Model catalog types
  ProviderId,
  ModelCategory,
  ModelInfo,
  ProviderInfo,
} from "./types.js";

// ─── Errors ─────────────────────────────────────────────────────────────────
export { LLMError, classifyError } from "./errors.js";

// ─── Registry ───────────────────────────────────────────────────────────────
export { PROVIDERS, filterParams, buildHeaders } from "./registry.js";

// ─── Models ────────────────────────────────────────────────────────────────
export {
  PROVIDER_INFO,
  MODEL_CATALOG,
  listProviders,
  getProvider,
  listModels,
  listModelsByProvider,
  listModelsByCategory,
  getDefaultModel,
  resolveModel,
  qualifiedModelId,
  modelsByProvider,
  suggestedModels,
  searchModels,
} from "./models.js";

// ─── Transforms ─────────────────────────────────────────────────────────────
export { toAnthropicRequest } from "./transforms/anthropic.js";
export type { AnthropicRequestBody } from "./transforms/anthropic.js";
export { toGeminiRequest, geminiEndpoint, convertSchemaTypes } from "./transforms/google.js";
export type { GeminiRequestBody } from "./transforms/google.js";
