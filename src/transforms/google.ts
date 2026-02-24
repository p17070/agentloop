// AgentLoop — Google Gemini Request Transform
//
// Converts a unified ChatRequest (OpenAI format) into a Gemini generateContent
// request body. See SPEC.md §5.1 for the full transformation rules.

import type { ChatMessage, ChatRequest, ContentPart, ToolDefinition } from "../types.js";

// ─── Gemini-specific Types ──────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  [key: string]: unknown;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  responseLogprobs?: boolean;
  logprobs?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

interface GeminiFunctionCallingConfig {
  mode: "AUTO" | "ANY" | "NONE";
  allowedFunctionNames?: string[];
}

export interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: GeminiFunctionCallingConfig };
  generationConfig?: GeminiGenerationConfig;
}

// ─── Request Transform ──────────────────────────────────────────────────────

export function toGeminiRequest(
  request: ChatRequest,
  _model: string
): GeminiRequestBody {
  // 1. Extract system messages
  const systemMessages: ChatMessage[] = [];
  const nonSystemMessages: ChatMessage[] = [];

  for (const msg of request.messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  const body: GeminiRequestBody = {
    contents: convertContents(nonSystemMessages),
  };

  // System instruction
  if (systemMessages.length > 0) {
    const systemText = systemMessages
      .map((msg) => {
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .filter((p) => p.type === "text")
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("\n");
        }
        return "";
      })
      .join("\n\n");

    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }
  }

  // Tools
  if (request.tools?.length) {
    body.tools = [{ functionDeclarations: convertToolDeclarations(request.tools) }];
  }

  // Tool choice → toolConfig
  if (request.tool_choice !== undefined) {
    const config = convertToolConfig(request.tool_choice);
    if (config) {
      body.toolConfig = { functionCallingConfig: config };
    }
  }

  // Generation config
  const genConfig = buildGenerationConfig(request);
  if (Object.keys(genConfig).length > 0) {
    body.generationConfig = genConfig;
  }

  return body;
}

/**
 * Returns the Gemini API endpoint path for a given model.
 * Streaming uses a different endpoint suffix.
 */
export function geminiEndpoint(baseURL: string, model: string, stream: boolean): string {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `${baseURL}/models/${model}:${action}`;
}

// ─── Contents Conversion ────────────────────────────────────────────────────

function convertContents(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = [];

  // Build a tool_call_id → function_name map for tool result resolution
  const toolCallIdToName = buildToolCallMap(messages);

  for (const msg of messages) {
    const converted = convertSingleContent(msg, toolCallIdToName);
    if (converted === null) continue;
    result.push(converted);
  }

  return result;
}

function convertSingleContent(
  msg: ChatMessage,
  toolCallIdToName: Map<string, string>
): GeminiContent | null {
  switch (msg.role) {
    case "user":
      return { role: "user", parts: convertParts(msg.content) };

    case "assistant":
      return convertModelContent(msg);

    case "tool":
      return convertToolResponse(msg, toolCallIdToName);

    default:
      return null;
  }
}

function convertModelContent(msg: ChatMessage): GeminiContent {
  const parts: GeminiPart[] = [];

  // Text content
  if (typeof msg.content === "string" && msg.content) {
    parts.push({ text: msg.content });
  } else if (Array.isArray(msg.content)) {
    parts.push(...convertParts(msg.content));
  }

  // Tool calls → functionCall parts
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      parts.push({
        functionCall: {
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        },
      });
    }
  }

  return { role: "model", parts: parts.length > 0 ? parts : [{ text: "" }] };
}

function convertToolResponse(
  msg: ChatMessage,
  toolCallIdToName: Map<string, string>
): GeminiContent {
  // Gemini matches tool results by name, not by ID
  const name = msg.tool_call_id
    ? toolCallIdToName.get(msg.tool_call_id) ?? msg.name ?? "unknown"
    : msg.name ?? "unknown";

  let response: unknown;
  if (typeof msg.content === "string") {
    try {
      response = JSON.parse(msg.content);
    } catch {
      response = { result: msg.content };
    }
  } else {
    response = msg.content;
  }

  return {
    role: "user",
    parts: [{ functionResponse: { name, response } }],
  };
}

// ─── Parts Conversion ───────────────────────────────────────────────────────

function convertParts(content: string | ContentPart[] | null): GeminiPart[] {
  if (content === null) return [{ text: "" }];
  if (typeof content === "string") return [{ text: content }];

  return content.map(convertContentPart);
}

function convertContentPart(part: ContentPart): GeminiPart {
  switch (part.type) {
    case "text":
      return { text: part.text };

    case "image_url": {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return { inlineData: { mimeType: match[1], data: match[2] } };
        }
      }
      // Gemini requires inline data — URL images need to be downloaded
      // For now, pass through as inline with a generic mime type
      return { inlineData: { mimeType: "image/jpeg", data: url } };
    }

    case "input_audio":
      return {
        inlineData: {
          mimeType: `audio/${part.input_audio.format}`,
          data: part.input_audio.data,
        },
      };
  }
}

// ─── Tool Declarations ──────────────────────────────────────────────────────

function convertToolDeclarations(tools: ToolDefinition[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => {
    const decl: GeminiFunctionDeclaration = {
      name: tool.function.name,
    };
    if (tool.function.description) {
      decl.description = tool.function.description;
    }
    if (tool.function.parameters) {
      decl.parameters = convertSchemaTypes(tool.function.parameters);
    }
    return decl;
  });
}

/**
 * Recursively converts JSON Schema type strings from lowercase to Gemini's UPPERCASE format.
 * "string" → "STRING", "number" → "NUMBER", etc.
 */
export function convertSchemaTypes(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...schema };

  if (typeof result.type === "string") {
    result.type = result.type.toUpperCase();
  }

  // Recurse into properties
  if (result.properties && typeof result.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      if (typeof value === "object" && value !== null) {
        props[key] = convertSchemaTypes(value as Record<string, unknown>);
      } else {
        props[key] = value;
      }
    }
    result.properties = props;
  }

  // Recurse into items (arrays)
  if (result.items && typeof result.items === "object") {
    result.items = convertSchemaTypes(result.items as Record<string, unknown>);
  }

  // Recurse into additionalProperties
  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = convertSchemaTypes(result.additionalProperties as Record<string, unknown>);
  }

  return result;
}

// ─── Tool Config ────────────────────────────────────────────────────────────

function convertToolConfig(
  toolChoice: ChatRequest["tool_choice"]
): GeminiFunctionCallingConfig | undefined {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto") return { mode: "AUTO" };
  if (toolChoice === "required") return { mode: "ANY" };
  if (toolChoice === "none") return { mode: "NONE" };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { mode: "ANY", allowedFunctionNames: [toolChoice.function.name] };
  }
  return undefined;
}

// ─── Generation Config ──────────────────────────────────────────────────────

function buildGenerationConfig(request: ChatRequest): GeminiGenerationConfig {
  const config: GeminiGenerationConfig = {};

  if (request.temperature !== undefined) config.temperature = request.temperature;
  if (request.top_p !== undefined) config.topP = request.top_p;
  if (request.max_tokens !== undefined) config.maxOutputTokens = request.max_tokens;
  if (request.n !== undefined) config.candidateCount = request.n;
  if (request.frequency_penalty !== undefined) config.frequencyPenalty = request.frequency_penalty;
  if (request.presence_penalty !== undefined) config.presencePenalty = request.presence_penalty;
  if (request.seed !== undefined) config.seed = request.seed;
  if (request.logprobs !== undefined) config.responseLogprobs = request.logprobs;
  if (request.top_logprobs !== undefined) config.logprobs = request.top_logprobs;

  if (request.stop !== undefined) {
    config.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
  }

  // Response format
  if (request.response_format) {
    if (request.response_format.type === "json_object") {
      config.responseMimeType = "application/json";
    } else if (request.response_format.type === "json_schema") {
      config.responseMimeType = "application/json";
      const schema = (request.response_format as { type: "json_schema"; json_schema: { schema: Record<string, unknown> } }).json_schema.schema;
      config.responseSchema = convertSchemaTypes(schema);
    }
  }

  return config;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a map from tool_call_id → function name for resolving Gemini's
 * name-based tool result matching.
 */
function buildToolCallMap(messages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        map.set(tc.id, tc.function.name);
      }
    }
  }
  return map;
}
