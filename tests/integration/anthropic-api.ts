/**
 * Minimal Anthropic API client for integration testing.
 * Uses native fetch() — no SDK dependency.
 */

const BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

export function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for integration tests");
  }
  return key;
}

function headers(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "content-type": "application/json",
    ...extra,
  };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  tools?: AnthropicTool[];
  tool_choice?: { type: string; name?: string };
  stream?: boolean;
  temperature?: number;
}

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Send a non-streaming request to Anthropic Messages API */
export async function createMessage(
  apiKey: string,
  request: AnthropicRequest,
): Promise<AnthropicResponse> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  return res.json() as Promise<AnthropicResponse>;
}

/** SSE event parsed from the stream */
export interface SSEEvent {
  event: string;
  data: unknown;
}

/** Send a streaming request and collect all SSE events */
export async function createMessageStream(
  apiKey: string,
  request: AnthropicRequest,
): Promise<SSEEvent[]> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const events: SSEEvent[] = [];
  const text = await res.text();

  // Parse SSE format: "event: <type>\ndata: <json>\n\n"
  let currentEvent = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      events.push({ event: currentEvent, data });
    }
  }

  return events;
}
