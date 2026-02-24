/**
 * Minimal Google Gemini API client for integration testing.
 * Uses native fetch() — no SDK dependency.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required for integration tests");
  }
  return key;
}

function headers(apiKey: string): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    "content-type": "application/json",
  };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
  executableCode?: { language: string; code: string };
  codeExecutionResult?: { outcome: string; output: string };
  thought?: boolean;
  [key: string]: unknown;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: { functionDeclarations: GeminiFunctionDeclaration[] }[];
  toolConfig?: { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    candidateCount?: number;
    responseMimeType?: string;
  };
}

export interface GeminiCandidate {
  content: { role: string; parts: GeminiPart[] };
  finishReason: string;
  safetyRatings?: unknown[];
  groundingMetadata?: Record<string, unknown>;
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    promptTokensDetails?: { modality: string; tokenCount: number }[];
    candidatesTokensDetails?: { modality: string; tokenCount: number }[];
  };
  modelVersion?: string;
}

/** Send a non-streaming request to Gemini generateContent */
export async function generateContent(
  apiKey: string,
  model: string,
  request: GeminiRequest,
): Promise<GeminiResponse> {
  const url = `${BASE_URL}/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body}`);
  }

  return res.json() as Promise<GeminiResponse>;
}

/** SSE event parsed from the stream */
export interface SSEChunk {
  data: GeminiResponse;
}

/** Send a streaming request and collect all SSE chunks */
export async function generateContentStream(
  apiKey: string,
  model: string,
  request: GeminiRequest,
): Promise<SSEChunk[]> {
  const url = `${BASE_URL}/models/${model}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body}`);
  }

  const chunks: SSEChunk[] = [];
  const text = await res.text();

  // Gemini SSE format: "data: <json>\n\n" (no named events)
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      chunks.push({ data });
    }
  }

  return chunks;
}
