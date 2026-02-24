// AgentLoop — Anthropic Request Transform
//
// Converts a unified ChatRequest (OpenAI format) into an Anthropic Messages API
// request body. See SPEC.md §4.1 for the full transformation rules.

import type { ChatMessage, ChatRequest, ContentPart, ProviderEntry, ToolDefinition } from "../types.js";

// ─── Anthropic-specific Types ───────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string;
  [key: string]: unknown;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
}

type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

export interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string | AnthropicContentBlock[];
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicToolDefinition[];
  tool_choice?: AnthropicToolChoice;
  metadata?: { user_id: string };
}

// ─── Request Transform ──────────────────────────────────────────────────────

export function toAnthropicRequest(
  request: ChatRequest,
  model: string,
  entry: ProviderEntry
): AnthropicRequestBody {
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

  // Build system parameter
  const system = buildSystem(systemMessages, request.response_format);

  // 2. Convert messages (user, assistant, tool → user/assistant)
  const messages = convertMessages(nonSystemMessages);

  // 3. Build request body
  const body: AnthropicRequestBody = {
    model,
    messages,
    max_tokens: request.max_tokens
      ?? (entry.defaults?.max_tokens as number | undefined)
      ?? 4096,
  };

  // System prompt
  if (system !== undefined) {
    body.system = system;
  }

  // Generation params
  if (request.temperature !== undefined) {
    body.temperature = Math.min(Math.max(request.temperature, 0), 1);
  }
  if (request.top_p !== undefined) {
    body.top_p = request.top_p;
  }
  if (request.stop !== undefined) {
    body.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
  }
  if (request.stream !== undefined) {
    body.stream = request.stream;
  }

  // Tools
  if (request.tools?.length) {
    body.tools = convertToolDefinitions(request.tools);
  }

  // Tool choice
  if (request.tool_choice !== undefined) {
    body.tool_choice = convertToolChoice(request.tool_choice);
  }

  // user → metadata.user_id
  if (request.user) {
    body.metadata = { user_id: request.user };
  }

  return body;
}

// ─── System Message Handling ────────────────────────────────────────────────

function buildSystem(
  systemMessages: ChatMessage[],
  responseFormat?: ChatRequest["response_format"]
): string | AnthropicContentBlock[] | undefined {
  const parts: string[] = [];

  // Collect text from system messages
  for (const msg of systemMessages) {
    if (typeof msg.content === "string") {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push(part.text);
        }
      }
    }
  }

  // Append response_format instructions (Anthropic has no native json_schema)
  if (responseFormat?.type === "json_schema") {
    const schema = (responseFormat as { type: "json_schema"; json_schema: { schema: Record<string, unknown> } }).json_schema.schema;
    parts.push(`Respond with JSON matching this schema: ${JSON.stringify(schema)}`);
  } else if (responseFormat?.type === "json_object") {
    parts.push("Respond with valid JSON only.");
  }

  if (parts.length === 0) return undefined;

  const text = parts.join("\n\n");

  // Check if any system message has cache control — need array-of-blocks format
  const hasCacheControl = systemMessages.some((msg) => msg.cache === "ephemeral");
  if (hasCacheControl) {
    return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
  }

  return text;
}

// ─── Message Conversion ─────────────────────────────────────────────────────

function convertMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    const converted = convertSingleMessage(msg);
    if (converted === null) continue;

    // Merge adjacent same-role messages (Anthropic requires alternation)
    const last = result[result.length - 1];
    if (last && last.role === converted.role) {
      last.content = mergeContent(last.content, converted.content);
    } else {
      result.push(converted);
    }
  }

  return result;
}

function convertSingleMessage(msg: ChatMessage): AnthropicMessage | null {
  switch (msg.role) {
    case "user":
      return { role: "user", content: convertContent(msg.content, msg.cache) };

    case "assistant":
      return convertAssistantMessage(msg);

    case "tool":
      return convertToolResultMessage(msg);

    default:
      return null;
  }
}

function convertAssistantMessage(msg: ChatMessage): AnthropicMessage {
  const blocks: AnthropicContentBlock[] = [];

  // Text content
  if (typeof msg.content === "string" && msg.content) {
    blocks.push({ type: "text", text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === "text") {
        const block: AnthropicContentBlock = { type: "text", text: part.text };
        if (part.cache === "ephemeral") {
          block.cache_control = { type: "ephemeral" };
        }
        blocks.push(block);
      }
    }
  }

  // Tool calls → tool_use content blocks
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    }
  }

  // Apply message-level cache to last block
  if (msg.cache === "ephemeral" && blocks.length > 0) {
    blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  }

  if (blocks.length === 0) {
    return { role: "assistant", content: "" };
  }

  return { role: "assistant", content: blocks };
}

function convertToolResultMessage(msg: ChatMessage): AnthropicMessage {
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  const block: AnthropicContentBlock = {
    type: "tool_result",
    tool_use_id: msg.tool_call_id,
    content,
  };
  if (msg.cache === "ephemeral") {
    block.cache_control = { type: "ephemeral" };
  }
  return { role: "user", content: [block] };
}

// ─── Content Conversion ─────────────────────────────────────────────────────

function convertContent(
  content: string | ContentPart[] | null,
  messageCache?: "ephemeral"
): string | AnthropicContentBlock[] {
  if (content === null) return "";

  if (typeof content === "string") {
    if (messageCache === "ephemeral") {
      return [{ type: "text", text: content, cache_control: { type: "ephemeral" } }];
    }
    return content;
  }

  const blocks: AnthropicContentBlock[] = [];
  for (const part of content) {
    blocks.push(convertContentPart(part));
  }

  // Apply message-level cache to last block
  if (messageCache === "ephemeral" && blocks.length > 0) {
    blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  }

  return blocks;
}

function convertContentPart(part: ContentPart): AnthropicContentBlock {
  switch (part.type) {
    case "text": {
      const block: AnthropicContentBlock = { type: "text", text: part.text };
      if (part.cache === "ephemeral") {
        block.cache_control = { type: "ephemeral" };
      }
      return block;
    }

    case "image_url": {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        // Parse data URI: data:image/png;base64,xxxxx
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const block: AnthropicContentBlock = {
            type: "image",
            source: { type: "base64", media_type: match[1], data: match[2] },
          };
          if (part.cache === "ephemeral") {
            block.cache_control = { type: "ephemeral" };
          }
          return block;
        }
      }
      // URL-based image
      const block: AnthropicContentBlock = {
        type: "image",
        source: { type: "url", url },
      };
      if (part.cache === "ephemeral") {
        block.cache_control = { type: "ephemeral" };
      }
      return block;
    }

    case "input_audio":
      // Anthropic does not support audio input — pass through as base64
      return { type: "text", text: "[Audio content not supported by Anthropic]" };
  }
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

function convertToolDefinitions(tools: ToolDefinition[]): AnthropicToolDefinition[] {
  return tools.map((tool) => {
    const def: AnthropicToolDefinition = {
      name: tool.function.name,
    };
    if (tool.function.description) {
      def.description = tool.function.description;
    }
    if (tool.function.parameters) {
      def.input_schema = tool.function.parameters;
    }
    if (tool.cache === "ephemeral") {
      def.cache_control = { type: "ephemeral" };
    }
    return def;
  });
}

// ─── Tool Choice ────────────────────────────────────────────────────────────

function convertToolChoice(
  toolChoice: ChatRequest["tool_choice"]
): AnthropicToolChoice | undefined {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") return { type: "any" };
  if (toolChoice === "none") return { type: "none" };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mergeContent(
  existing: string | AnthropicContentBlock[],
  incoming: string | AnthropicContentBlock[]
): AnthropicContentBlock[] {
  const existingBlocks = typeof existing === "string"
    ? (existing ? [{ type: "text", text: existing }] : [])
    : existing;
  const incomingBlocks = typeof incoming === "string"
    ? (incoming ? [{ type: "text", text: incoming }] : [])
    : incoming;
  return [...existingBlocks, ...incomingBlocks];
}
