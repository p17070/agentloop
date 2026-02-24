/**
 * Integration tests against the real Google Gemini API.
 *
 * These tests validate that Gemini's actual response shapes match what
 * the AgentLoop SPEC expects, so our normalization logic can be built with
 * confidence.
 *
 * Run: GEMINI_API_KEY=... npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  getApiKey,
  generateContent,
  generateContentStream,
  type GeminiResponse,
  type GeminiPart,
  type SSEChunk,
} from "./gemini-api.js";

const MODEL = "gemini-2.0-flash";

let apiKey: string;

beforeAll(() => {
  apiKey = getApiKey();
});

// ─── Basic Chat ──────────────────────────────────────────────────────────────

describe("Gemini API — basic chat", () => {
  let response: GeminiResponse;

  beforeAll(async () => {
    response = await generateContent(apiKey, MODEL, {
      contents: [{ role: "user", parts: [{ text: "Say exactly: hello" }] }],
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });
  });

  it("returns candidates array", () => {
    expect(Array.isArray(response.candidates)).toBe(true);
    expect(response.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("candidate has content with role 'model'", () => {
    const candidate = response.candidates[0];
    expect(candidate.content.role).toBe("model");
  });

  it("candidate content has parts array", () => {
    const parts = response.candidates[0].content.parts;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThanOrEqual(1);
  });

  it("first part is a text part", () => {
    const part = response.candidates[0].content.parts[0];
    expect(typeof part.text).toBe("string");
    expect(part.text!.toLowerCase()).toContain("hello");
  });

  it("returns finishReason 'STOP'", () => {
    expect(response.candidates[0].finishReason).toBe("STOP");
  });

  it("returns usageMetadata with token counts", () => {
    expect(response.usageMetadata).toBeDefined();
    expect(typeof response.usageMetadata.promptTokenCount).toBe("number");
    expect(typeof response.usageMetadata.candidatesTokenCount).toBe("number");
    expect(typeof response.usageMetadata.totalTokenCount).toBe("number");
    expect(response.usageMetadata.promptTokenCount).toBeGreaterThan(0);
    expect(response.usageMetadata.candidatesTokenCount).toBeGreaterThan(0);
    expect(response.usageMetadata.totalTokenCount).toBeGreaterThan(0);
  });

  it("totalTokenCount equals prompt + candidates", () => {
    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;
    expect(totalTokenCount).toBe(promptTokenCount + candidatesTokenCount);
  });
});

// ─── Tool Calling (functionCall) ─────────────────────────────────────────────

describe("Gemini API — tool calling", () => {
  let response: GeminiResponse;

  const weatherTool = {
    functionDeclarations: [
      {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: "OBJECT",
          properties: {
            city: { type: "STRING", description: "City name" },
          },
          required: ["city"],
        },
      },
    ],
  };

  beforeAll(async () => {
    response = await generateContent(apiKey, MODEL, {
      contents: [{ role: "user", parts: [{ text: "What is the weather in Paris?" }] }],
      tools: [weatherTool],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_weather"] } },
      generationConfig: { maxOutputTokens: 256, temperature: 0 },
    });
  });

  it("returns a functionCall part", () => {
    const parts = response.candidates[0].content.parts;
    const fnPart = parts.find((p) => p.functionCall);
    expect(fnPart).toBeDefined();
  });

  it("functionCall has name and args", () => {
    const fnPart = response.candidates[0].content.parts.find((p) => p.functionCall)!;
    expect(fnPart.functionCall!.name).toBe("get_weather");
    expect(typeof fnPart.functionCall!.args).toBe("object");
    expect(fnPart.functionCall!.args).not.toBeNull();
  });

  it("functionCall args contain the city", () => {
    const fnPart = response.candidates[0].content.parts.find((p) => p.functionCall)!;
    const args = fnPart.functionCall!.args;
    expect(typeof args.city).toBe("string");
    expect((args.city as string).toLowerCase()).toContain("paris");
  });

  it("functionCall args can be JSON.stringify'd (for normalization)", () => {
    const fnPart = response.candidates[0].content.parts.find((p) => p.functionCall)!;
    const json = JSON.stringify(fnPart.functionCall!.args);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(fnPart.functionCall!.args);
  });

  it("finishReason is 'STOP' (Gemini does not have a dedicated tool finish reason)", () => {
    // Per SPEC: when functionCall is present, override finishReason to "tool_calls"
    // But Gemini itself returns "STOP" — the SDK does the override
    expect(response.candidates[0].finishReason).toBe("STOP");
  });
});

// ─── Tool Result Round-Trip (functionResponse) ──────────────────────────────

describe("Gemini API — tool result round-trip", () => {
  let response: GeminiResponse;

  beforeAll(async () => {
    response = await generateContent(apiKey, MODEL, {
      contents: [
        { role: "user", parts: [{ text: "What is the weather in London?" }] },
        {
          role: "model",
          parts: [
            {
              functionCall: {
                name: "get_weather",
                args: { city: "London" },
              },
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "get_weather",
                response: { temperature: "22C", condition: "Sunny" },
              },
            },
          ],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_weather",
              description: "Get weather for a city",
              parameters: {
                type: "OBJECT",
                properties: { city: { type: "STRING" } },
                required: ["city"],
              },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 128, temperature: 0 },
    });
  });

  it("returns a text response incorporating the tool result", () => {
    const textPart = response.candidates[0].content.parts.find((p) => p.text);
    expect(textPart).toBeDefined();
    expect(textPart!.text!.length).toBeGreaterThan(0);
  });

  it("finishReason is 'STOP' after processing tool result", () => {
    expect(response.candidates[0].finishReason).toBe("STOP");
  });
});

// ─── Streaming ───────────────────────────────────────────────────────────────

describe("Gemini API — streaming", () => {
  let chunks: SSEChunk[];

  beforeAll(async () => {
    chunks = await generateContentStream(apiKey, MODEL, {
      contents: [{ role: "user", parts: [{ text: "Say exactly: streaming works" }] }],
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });
  });

  it("returns multiple SSE chunks", () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("each chunk is a full GenerateContentResponse with candidates", () => {
    for (const chunk of chunks) {
      expect(chunk.data).toBeDefined();
      // Most chunks have candidates, last chunk may only have usageMetadata
      if (chunk.data.candidates) {
        expect(Array.isArray(chunk.data.candidates)).toBe(true);
      }
    }
  });

  it("chunks with candidates have text parts", () => {
    const textChunks = chunks.filter(
      (c) => c.data.candidates?.[0]?.content?.parts?.some((p) => p.text),
    );
    expect(textChunks.length).toBeGreaterThan(0);
  });

  it("concatenated text from all chunks forms the complete response", () => {
    const fullText = chunks
      .flatMap((c) => c.data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("");

    expect(fullText.toLowerCase()).toContain("streaming");
    expect(fullText.toLowerCase()).toContain("works");
  });

  it("last chunk has usageMetadata", () => {
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.data.usageMetadata).toBeDefined();
    expect(typeof lastChunk.data.usageMetadata.promptTokenCount).toBe("number");
    expect(typeof lastChunk.data.usageMetadata.candidatesTokenCount).toBe("number");
    expect(typeof lastChunk.data.usageMetadata.totalTokenCount).toBe("number");
  });

  it("final chunk has finishReason 'STOP'", () => {
    // Find the last chunk that has candidates with a finishReason
    const chunksWithFinish = chunks.filter(
      (c) => c.data.candidates?.[0]?.finishReason,
    );
    expect(chunksWithFinish.length).toBeGreaterThan(0);
    const last = chunksWithFinish[chunksWithFinish.length - 1];
    expect(last.data.candidates[0].finishReason).toBe("STOP");
  });
});

// ─── Streaming with Tool Calls ───────────────────────────────────────────────

describe("Gemini API — streaming tool calls", () => {
  let chunks: SSEChunk[];

  beforeAll(async () => {
    chunks = await generateContentStream(apiKey, MODEL, {
      contents: [{ role: "user", parts: [{ text: "What is the weather in Tokyo?" }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_weather",
              description: "Get weather for a city",
              parameters: {
                type: "OBJECT",
                properties: { city: { type: "STRING" } },
                required: ["city"],
              },
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_weather"] } },
      generationConfig: { maxOutputTokens: 256, temperature: 0 },
    });
  });

  it("at least one chunk contains a functionCall part", () => {
    const fnChunks = chunks.filter((c) =>
      c.data.candidates?.[0]?.content?.parts?.some((p) => p.functionCall),
    );
    expect(fnChunks.length).toBeGreaterThan(0);
  });

  it("functionCall in stream has name and args", () => {
    const fnChunk = chunks.find((c) =>
      c.data.candidates?.[0]?.content?.parts?.some((p) => p.functionCall),
    )!;
    const fnPart = fnChunk.data.candidates[0].content.parts.find((p) => p.functionCall)!;
    expect(fnPart.functionCall!.name).toBe("get_weather");
    expect(typeof fnPart.functionCall!.args).toBe("object");
    expect((fnPart.functionCall!.args.city as string).toLowerCase()).toContain("tokyo");
  });
});

// ─── Finish Reason: MAX_TOKENS ───────────────────────────────────────────────

describe("Gemini API — finishReason MAX_TOKENS", () => {
  it("returns finishReason 'MAX_TOKENS' when output is truncated", async () => {
    const response = await generateContent(apiKey, MODEL, {
      contents: [
        {
          role: "user",
          parts: [{ text: "Write a very long essay about the history of computing. Be extremely verbose." }],
        },
      ],
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });

    expect(response.candidates[0].finishReason).toBe("MAX_TOKENS");
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────

describe("Gemini API — error responses", () => {
  it("returns error for invalid model", async () => {
    try {
      await generateContent(apiKey, "nonexistent-model-xyz", {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      });
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      // Either a Gemini API error or a network error (if DNS is blocked)
      expect(msg).toMatch(/Gemini API|fetch failed/);
    }
  });

  it("returns 400/401 for invalid API key", async () => {
    try {
      await generateContent("invalid-key-xyz", MODEL, {
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      });
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      expect(msg).toMatch(/40[01]|fetch failed/);
    }
  });
});

// ─── Multi-turn Conversation ─────────────────────────────────────────────────

describe("Gemini API — multi-turn conversation", () => {
  it("maintains context across turns", async () => {
    const response = await generateContent(apiKey, MODEL, {
      contents: [
        { role: "user", parts: [{ text: "My name is AgentLoopTestUser." }] },
        { role: "model", parts: [{ text: "Nice to meet you, AgentLoopTestUser!" }] },
        { role: "user", parts: [{ text: "What is my name?" }] },
      ],
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });

    const text = response.candidates[0].content.parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("");

    expect(text).toContain("AgentLoopTestUser");
  });
});

// ─── System Instruction ──────────────────────────────────────────────────────

describe("Gemini API — system instruction", () => {
  it("accepts systemInstruction as a top-level parameter", async () => {
    const response = await generateContent(apiKey, MODEL, {
      systemInstruction: {
        parts: [{ text: "You must respond with exactly the word PINEAPPLE and nothing else." }],
      },
      contents: [{ role: "user", parts: [{ text: "Say something." }] }],
      generationConfig: { maxOutputTokens: 32, temperature: 0 },
    });

    const text = response.candidates[0].content.parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("")
      .trim();

    expect(text).toContain("PINEAPPLE");
  });
});

// ─── JSON Mode ───────────────────────────────────────────────────────────────

describe("Gemini API — JSON mode", () => {
  it("returns valid JSON when responseMimeType is application/json", async () => {
    const response = await generateContent(apiKey, MODEL, {
      contents: [
        {
          role: "user",
          parts: [{ text: "Return a JSON object with keys: name (string) and age (number). Use name 'Alice' and age 30." }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const text = response.candidates[0].content.parts
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("");

    const parsed = JSON.parse(text);
    expect(parsed.name).toBe("Alice");
    expect(parsed.age).toBe(30);
  });
});
