/**
 * Integration tests against the real Google Gemini API.
 *
 * Uses the official @google/generative-ai SDK — no hand-rolled clients.
 *
 * Run: GEMINI_API_KEY=... npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  SchemaType,
  type GenerativeModel,
  type GenerateContentResult,
  type EnhancedGenerateContentResponse,
} from "@google/generative-ai";

const MODEL_NAME = "gemini-2.0-flash";

let client: GoogleGenerativeAI;

beforeAll(() => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required for integration tests");
  }
  client = new GoogleGenerativeAI(apiKey);
});

function getModel(options?: {
  tools?: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0]["tools"];
  toolConfig?: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0]["toolConfig"];
  generationConfig?: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0]["generationConfig"];
  systemInstruction?: Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0]["systemInstruction"];
}): GenerativeModel {
  return client.getGenerativeModel({
    model: MODEL_NAME,
    ...options,
  });
}

// ─── Basic Chat ──────────────────────────────────────────────────────────────

describe("Gemini API — basic chat", () => {
  let result: GenerateContentResult;

  beforeAll(async () => {
    const model = getModel({
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });
    result = await model.generateContent("Say exactly: hello");
  });

  it("returns a response with text", () => {
    const text = result.response.text();
    expect(typeof text).toBe("string");
    expect(text.toLowerCase()).toContain("hello");
  });

  it("response has candidates array", () => {
    expect(Array.isArray(result.response.candidates)).toBe(true);
    expect(result.response.candidates!.length).toBeGreaterThanOrEqual(1);
  });

  it("candidate has content with role 'model'", () => {
    const candidate = result.response.candidates![0];
    expect(candidate.content.role).toBe("model");
  });

  it("candidate content has parts array with text", () => {
    const parts = result.response.candidates![0].content.parts;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(typeof parts[0].text).toBe("string");
  });

  it("returns finishReason 'STOP'", () => {
    expect(result.response.candidates![0].finishReason).toBe("STOP");
  });

  it("returns usageMetadata with token counts", () => {
    const usage = result.response.usageMetadata;
    expect(usage).toBeDefined();
    expect(typeof usage!.promptTokenCount).toBe("number");
    expect(typeof usage!.candidatesTokenCount).toBe("number");
    expect(typeof usage!.totalTokenCount).toBe("number");
    expect(usage!.promptTokenCount).toBeGreaterThan(0);
    expect(usage!.candidatesTokenCount).toBeGreaterThan(0);
    expect(usage!.totalTokenCount).toBeGreaterThan(0);
  });

  it("totalTokenCount equals prompt + candidates", () => {
    const { promptTokenCount, candidatesTokenCount, totalTokenCount } =
      result.response.usageMetadata!;
    expect(totalTokenCount).toBe(promptTokenCount + candidatesTokenCount);
  });
});

// ─── Tool Calling (functionCall) ─────────────────────────────────────────────

describe("Gemini API — tool calling", () => {
  let result: GenerateContentResult;

  const weatherTool = {
    functionDeclarations: [
      {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            city: { type: SchemaType.STRING, description: "City name" },
          },
          required: ["city"],
        },
      },
    ],
  };

  beforeAll(async () => {
    const model = getModel({
      tools: [weatherTool],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ["get_weather"],
        },
      },
      generationConfig: { maxOutputTokens: 256, temperature: 0 },
    });
    result = await model.generateContent("What is the weather in Paris?");
  });

  it("returns a functionCall", () => {
    const calls = result.response.functionCalls();
    expect(calls).toBeDefined();
    expect(calls!.length).toBeGreaterThanOrEqual(1);
  });

  it("functionCall has name and args", () => {
    const call = result.response.functionCalls()![0];
    expect(call.name).toBe("get_weather");
    expect(typeof call.args).toBe("object");
    expect(call.args).not.toBeNull();
  });

  it("functionCall args contain the city", () => {
    const call = result.response.functionCalls()![0];
    expect(typeof call.args.city).toBe("string");
    expect((call.args.city as string).toLowerCase()).toContain("paris");
  });

  it("functionCall args can be JSON.stringify'd (for normalization)", () => {
    const call = result.response.functionCalls()![0];
    const json = JSON.stringify(call.args);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(call.args);
  });

  it("finishReason is 'STOP' (Gemini does not have a dedicated tool finish reason)", () => {
    expect(result.response.candidates![0].finishReason).toBe("STOP");
  });
});

// ─── Tool Result Round-Trip (functionResponse) ──────────────────────────────

describe("Gemini API — tool result round-trip", () => {
  let result: GenerateContentResult;

  beforeAll(async () => {
    const model = getModel({
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_weather",
              description: "Get weather for a city",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { city: { type: SchemaType.STRING } },
                required: ["city"],
              },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 128, temperature: 0 },
    });

    result = await model.generateContent({
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
    });
  });

  it("returns a text response incorporating the tool result", () => {
    const text = result.response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("finishReason is 'STOP' after processing tool result", () => {
    expect(result.response.candidates![0].finishReason).toBe("STOP");
  });
});

// ─── Streaming ───────────────────────────────────────────────────────────────

describe("Gemini API — streaming", () => {
  let chunks: EnhancedGenerateContentResponse[];

  beforeAll(async () => {
    const model = getModel({
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });
    const streamResult = await model.generateContentStream("Say exactly: streaming works");
    chunks = [];
    for await (const chunk of streamResult.stream) {
      chunks.push(chunk);
    }
  });

  it("returns multiple chunks", () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("chunks with candidates have text parts", () => {
    const textChunks = chunks.filter(
      (c) => c.candidates?.[0]?.content?.parts?.some((p) => p.text),
    );
    expect(textChunks.length).toBeGreaterThan(0);
  });

  it("concatenated text from all chunks forms the complete response", () => {
    const fullText = chunks
      .flatMap((c) => c.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text)
      .map((p) => p.text!)
      .join("");

    expect(fullText.toLowerCase()).toContain("streaming");
    expect(fullText.toLowerCase()).toContain("works");
  });

  it("last chunk has usageMetadata", () => {
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.usageMetadata).toBeDefined();
    expect(typeof lastChunk.usageMetadata!.promptTokenCount).toBe("number");
    expect(typeof lastChunk.usageMetadata!.candidatesTokenCount).toBe("number");
    expect(typeof lastChunk.usageMetadata!.totalTokenCount).toBe("number");
  });

  it("final chunk has finishReason 'STOP'", () => {
    const chunksWithFinish = chunks.filter(
      (c) => c.candidates?.[0]?.finishReason,
    );
    expect(chunksWithFinish.length).toBeGreaterThan(0);
    const last = chunksWithFinish[chunksWithFinish.length - 1];
    expect(last.candidates![0].finishReason).toBe("STOP");
  });
});

// ─── Streaming with Tool Calls ───────────────────────────────────────────────

describe("Gemini API — streaming tool calls", () => {
  let chunks: EnhancedGenerateContentResponse[];

  beforeAll(async () => {
    const model = getModel({
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_weather",
              description: "Get weather for a city",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { city: { type: SchemaType.STRING } },
                required: ["city"],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ["get_weather"],
        },
      },
      generationConfig: { maxOutputTokens: 256, temperature: 0 },
    });

    const streamResult = await model.generateContentStream(
      "What is the weather in Tokyo?",
    );
    chunks = [];
    for await (const chunk of streamResult.stream) {
      chunks.push(chunk);
    }
  });

  it("at least one chunk contains a functionCall", () => {
    const fnChunks = chunks.filter((c) => c.functionCalls()?.length);
    expect(fnChunks.length).toBeGreaterThan(0);
  });

  it("functionCall in stream has name and args", () => {
    const fnChunk = chunks.find((c) => c.functionCalls()?.length)!;
    const call = fnChunk.functionCalls()![0];
    expect(call.name).toBe("get_weather");
    expect(typeof call.args).toBe("object");
    expect((call.args.city as string).toLowerCase()).toContain("tokyo");
  });
});

// ─── Finish Reason: MAX_TOKENS ───────────────────────────────────────────────

describe("Gemini API — finishReason MAX_TOKENS", () => {
  it("returns finishReason 'MAX_TOKENS' when output is truncated", async () => {
    const model = getModel({
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });
    const result = await model.generateContent(
      "Write a very long essay about the history of computing. Be extremely verbose.",
    );

    expect(result.response.candidates![0].finishReason).toBe("MAX_TOKENS");
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────

describe("Gemini API — error responses", () => {
  it("throws for invalid model", async () => {
    const badModel = client.getGenerativeModel({ model: "nonexistent-model-xyz" });
    await expect(
      badModel.generateContent("Hello"),
    ).rejects.toThrow();
  });

  it("throws for invalid API key", async () => {
    const badClient = new GoogleGenerativeAI("invalid-key-xyz");
    const badModel = badClient.getGenerativeModel({ model: MODEL_NAME });
    await expect(
      badModel.generateContent("Hello"),
    ).rejects.toThrow();
  });
});

// ─── Multi-turn Conversation ─────────────────────────────────────────────────

describe("Gemini API — multi-turn conversation", () => {
  it("maintains context across turns", async () => {
    const model = getModel({
      generationConfig: { maxOutputTokens: 64, temperature: 0 },
    });

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: "My name is AgentLoopTestUser." }] },
        { role: "model", parts: [{ text: "Nice to meet you, AgentLoopTestUser!" }] },
        { role: "user", parts: [{ text: "What is my name?" }] },
      ],
    });

    expect(result.response.text()).toContain("AgentLoopTestUser");
  });
});

// ─── System Instruction ──────────────────────────────────────────────────────

describe("Gemini API — system instruction", () => {
  it("accepts systemInstruction as a model parameter", async () => {
    const model = getModel({
      systemInstruction: {
        role: "user",
        parts: [{ text: "You must respond with exactly the word PINEAPPLE and nothing else." }],
      },
      generationConfig: { maxOutputTokens: 32, temperature: 0 },
    });

    const result = await model.generateContent("Say something.");
    expect(result.response.text().trim()).toContain("PINEAPPLE");
  });
});

// ─── JSON Mode ───────────────────────────────────────────────────────────────

describe("Gemini API — JSON mode", () => {
  it("returns valid JSON when responseMimeType is application/json", async () => {
    const model = getModel({
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(
      "Return a JSON object with keys: name (string) and age (number). Use name 'Alice' and age 30.",
    );

    const parsed = JSON.parse(result.response.text());
    expect(parsed.name).toBe("Alice");
    expect(parsed.age).toBe(30);
  });
});
