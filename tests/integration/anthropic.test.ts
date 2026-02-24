/**
 * Integration tests against the real Anthropic Messages API.
 *
 * These tests validate that Anthropic's actual response shapes match what
 * the AgentLoop SPEC expects, so our normalization logic can be built with
 * confidence.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  getApiKey,
  createMessage,
  createMessageStream,
  type AnthropicResponse,
  type AnthropicContentBlock,
  type SSEEvent,
} from "./anthropic-api.js";

const MODEL = "claude-sonnet-4-20250514";

let apiKey: string;

beforeAll(() => {
  apiKey = getApiKey();
});

// ─── Basic Chat ──────────────────────────────────────────────────────────────

describe("Anthropic Messages API — basic chat", () => {
  let response: AnthropicResponse;

  beforeAll(async () => {
    response = await createMessage(apiKey, {
      model: MODEL,
      messages: [{ role: "user", content: "Say exactly: hello" }],
      max_tokens: 64,
      temperature: 0,
    });
  });

  it("returns type 'message'", () => {
    expect(response.type).toBe("message");
  });

  it("returns role 'assistant'", () => {
    expect(response.role).toBe("assistant");
  });

  it("returns a msg_ prefixed id", () => {
    expect(response.id).toMatch(/^msg_/);
  });

  it("returns the requested model", () => {
    expect(response.model).toContain("claude");
  });

  it("returns content as array of blocks", () => {
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThanOrEqual(1);
  });

  it("first content block is type 'text'", () => {
    expect(response.content[0].type).toBe("text");
    expect(typeof response.content[0].text).toBe("string");
    expect((response.content[0].text as string).toLowerCase()).toContain("hello");
  });

  it("returns stop_reason 'end_turn'", () => {
    expect(response.stop_reason).toBe("end_turn");
  });

  it("returns usage with input_tokens and output_tokens", () => {
    expect(response.usage).toBeDefined();
    expect(typeof response.usage.input_tokens).toBe("number");
    expect(typeof response.usage.output_tokens).toBe("number");
    expect(response.usage.input_tokens).toBeGreaterThan(0);
    expect(response.usage.output_tokens).toBeGreaterThan(0);
  });
});

// ─── Tool Calling ────────────────────────────────────────────────────────────

describe("Anthropic Messages API — tool calling", () => {
  let response: AnthropicResponse;

  const weatherTool = {
    name: "get_weather",
    description: "Get weather for a city",
    input_schema: {
      type: "object" as const,
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  };

  beforeAll(async () => {
    response = await createMessage(apiKey, {
      model: MODEL,
      messages: [{ role: "user", content: "What is the weather in Paris?" }],
      max_tokens: 256,
      tools: [weatherTool],
      tool_choice: { type: "tool", name: "get_weather" },
      temperature: 0,
    });
  });

  it("returns stop_reason 'tool_use'", () => {
    expect(response.stop_reason).toBe("tool_use");
  });

  it("returns at least one tool_use content block", () => {
    const toolBlocks = response.content.filter((b) => b.type === "tool_use");
    expect(toolBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it("tool_use block has correct shape", () => {
    const block = response.content.find((b) => b.type === "tool_use")!;
    expect(block).toBeDefined();

    // id is a string prefixed with "toolu_"
    expect(typeof block.id).toBe("string");
    expect(block.id as string).toMatch(/^toolu_/);

    // name matches the tool we defined
    expect(block.name).toBe("get_weather");

    // input is an object (not a JSON string — Anthropic returns parsed objects)
    expect(typeof block.input).toBe("object");
    expect(block.input).not.toBeNull();
  });

  it("tool_use input contains the city argument", () => {
    const block = response.content.find((b) => b.type === "tool_use")!;
    const input = block.input as Record<string, unknown>;
    expect(typeof input.city).toBe("string");
    expect((input.city as string).toLowerCase()).toContain("paris");
  });

  it("tool call input can be JSON.stringify'd (for normalization to arguments string)", () => {
    const block = response.content.find((b) => b.type === "tool_use")!;
    const json = JSON.stringify(block.input);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(block.input);
  });
});

// ─── Tool Result Round-Trip ──────────────────────────────────────────────────

describe("Anthropic Messages API — tool result round-trip", () => {
  let response: AnthropicResponse;

  beforeAll(async () => {
    // First turn: assistant calls the tool
    // Second turn: we provide the tool result
    response = await createMessage(apiKey, {
      model: MODEL,
      messages: [
        { role: "user", content: "What is the weather in London?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_test123",
              name: "get_weather",
              input: { city: "London" },
            } as unknown as AnthropicContentBlock,
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_test123",
              content: "Sunny, 22°C",
            } as unknown as AnthropicContentBlock,
          ],
        },
      ],
      max_tokens: 128,
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a city",
          input_schema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ],
      temperature: 0,
    });
  });

  it("returns a text response incorporating the tool result", () => {
    const textBlock = response.content.find((b) => b.type === "text");
    expect(textBlock).toBeDefined();
    expect(typeof textBlock!.text).toBe("string");
    expect((textBlock!.text as string).length).toBeGreaterThan(0);
  });

  it("stop_reason is 'end_turn' after processing tool result", () => {
    expect(response.stop_reason).toBe("end_turn");
  });
});

// ─── Streaming ───────────────────────────────────────────────────────────────

describe("Anthropic Messages API — streaming", () => {
  let events: SSEEvent[];

  beforeAll(async () => {
    events = await createMessageStream(apiKey, {
      model: MODEL,
      messages: [{ role: "user", content: "Say exactly: streaming works" }],
      max_tokens: 64,
      temperature: 0,
    });
  });

  it("returns events in the expected lifecycle order", () => {
    const eventTypes = events.map((e) => e.event);

    // Must start with message_start
    expect(eventTypes[0]).toBe("message_start");

    // Must end with message_stop
    expect(eventTypes[eventTypes.length - 1]).toBe("message_stop");

    // Must contain content_block_start, content_block_delta, content_block_stop
    expect(eventTypes).toContain("content_block_start");
    expect(eventTypes).toContain("content_block_delta");
    expect(eventTypes).toContain("content_block_stop");

    // Must contain message_delta (with stop_reason)
    expect(eventTypes).toContain("message_delta");
  });

  it("message_start contains message metadata", () => {
    const start = events.find((e) => e.event === "message_start")!;
    const data = start.data as Record<string, unknown>;
    const msg = data.message as Record<string, unknown>;

    expect(msg.id).toMatch(/^msg_/);
    expect(msg.role).toBe("assistant");
    expect(msg.model).toContain("claude");

    // Usage in message_start has input_tokens
    const usage = msg.usage as Record<string, number>;
    expect(typeof usage.input_tokens).toBe("number");
  });

  it("content_block_start has index and type", () => {
    const blockStart = events.find((e) => e.event === "content_block_start")!;
    const data = blockStart.data as Record<string, unknown>;

    expect(typeof data.index).toBe("number");
    const block = data.content_block as Record<string, unknown>;
    expect(block.type).toBe("text");
  });

  it("content_block_delta delivers text_delta chunks", () => {
    const deltas = events.filter((e) => e.event === "content_block_delta");
    expect(deltas.length).toBeGreaterThan(0);

    // Each delta should have a delta.text field
    for (const d of deltas) {
      const data = d.data as Record<string, unknown>;
      const delta = data.delta as Record<string, unknown>;
      expect(delta.type).toBe("text_delta");
      expect(typeof delta.text).toBe("string");
    }
  });

  it("concatenated deltas form the complete response text", () => {
    const deltas = events.filter((e) => e.event === "content_block_delta");
    const fullText = deltas
      .map((d) => {
        const data = d.data as Record<string, unknown>;
        const delta = data.delta as Record<string, unknown>;
        return delta.text as string;
      })
      .join("");

    expect(fullText.toLowerCase()).toContain("streaming");
    expect(fullText.toLowerCase()).toContain("works");
  });

  it("message_delta contains stop_reason and usage", () => {
    const msgDelta = events.find((e) => e.event === "message_delta")!;
    const data = msgDelta.data as Record<string, unknown>;
    const delta = data.delta as Record<string, unknown>;

    expect(delta.stop_reason).toBe("end_turn");

    // usage in message_delta has output_tokens
    const usage = data.usage as Record<string, number>;
    expect(typeof usage.output_tokens).toBe("number");
    expect(usage.output_tokens).toBeGreaterThan(0);
  });
});

// ─── Streaming with Tool Calls ───────────────────────────────────────────────

describe("Anthropic Messages API — streaming tool calls", () => {
  let events: SSEEvent[];

  beforeAll(async () => {
    events = await createMessageStream(apiKey, {
      model: MODEL,
      messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
      max_tokens: 256,
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a city",
          input_schema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "get_weather" },
      temperature: 0,
    });
  });

  it("emits content_block_start with tool_use type", () => {
    const toolStart = events.find((e) => {
      if (e.event !== "content_block_start") return false;
      const data = e.data as Record<string, unknown>;
      const block = data.content_block as Record<string, unknown>;
      return block.type === "tool_use";
    });

    expect(toolStart).toBeDefined();
    const data = toolStart!.data as Record<string, unknown>;
    const block = data.content_block as Record<string, unknown>;
    expect(block.id).toMatch(/^toolu_/);
    expect(block.name).toBe("get_weather");
  });

  it("streams tool input as input_json_delta events", () => {
    const jsonDeltas = events.filter((e) => {
      if (e.event !== "content_block_delta") return false;
      const data = e.data as Record<string, unknown>;
      const delta = data.delta as Record<string, unknown>;
      return delta.type === "input_json_delta";
    });

    expect(jsonDeltas.length).toBeGreaterThan(0);

    // Each delta has partial_json string
    for (const d of jsonDeltas) {
      const data = d.data as Record<string, unknown>;
      const delta = data.delta as Record<string, unknown>;
      expect(typeof delta.partial_json).toBe("string");
    }
  });

  it("concatenated input_json_delta forms valid JSON with city argument", () => {
    const jsonDeltas = events.filter((e) => {
      if (e.event !== "content_block_delta") return false;
      const data = e.data as Record<string, unknown>;
      const delta = data.delta as Record<string, unknown>;
      return delta.type === "input_json_delta";
    });

    const fullJson = jsonDeltas
      .map((d) => {
        const data = d.data as Record<string, unknown>;
        const delta = data.delta as Record<string, unknown>;
        return delta.partial_json as string;
      })
      .join("");

    const parsed = JSON.parse(fullJson);
    expect(typeof parsed.city).toBe("string");
    expect(parsed.city.toLowerCase()).toContain("tokyo");
  });

  it("message_delta has stop_reason 'tool_use'", () => {
    const msgDelta = events.find((e) => e.event === "message_delta")!;
    const data = msgDelta.data as Record<string, unknown>;
    const delta = data.delta as Record<string, unknown>;
    expect(delta.stop_reason).toBe("tool_use");
  });
});

// ─── Stop Reason: max_tokens ─────────────────────────────────────────────────

describe("Anthropic Messages API — stop_reason max_tokens", () => {
  it("returns stop_reason 'max_tokens' when output is truncated", async () => {
    const response = await createMessage(apiKey, {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: "Write a very long essay about the history of computing. Be extremely verbose.",
        },
      ],
      max_tokens: 5,
      temperature: 0,
    });

    expect(response.stop_reason).toBe("max_tokens");
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────

describe("Anthropic Messages API — error responses", () => {
  it("returns error for invalid model", async () => {
    try {
      await createMessage(apiKey, {
        model: "claude-nonexistent-model",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(String(err)).toContain("Anthropic API");
    }
  });

  it("returns 401 for invalid API key", async () => {
    try {
      await createMessage("sk-ant-invalid-key", {
        model: MODEL,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(String(err)).toMatch(/40[13]/);
    }
  });
});

// ─── Multi-turn Conversation ─────────────────────────────────────────────────

describe("Anthropic Messages API — multi-turn conversation", () => {
  it("maintains context across turns", async () => {
    const response = await createMessage(apiKey, {
      model: MODEL,
      messages: [
        { role: "user", content: "My name is AgentLoopTestUser." },
        { role: "assistant", content: "Nice to meet you, AgentLoopTestUser!" },
        { role: "user", content: "What is my name?" },
      ],
      max_tokens: 64,
      temperature: 0,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("");

    expect(text).toContain("AgentLoopTestUser");
  });
});

// ─── System Message ──────────────────────────────────────────────────────────

describe("Anthropic Messages API — system message", () => {
  it("accepts system as a top-level parameter", async () => {
    const response = await createMessage(apiKey, {
      model: MODEL,
      system: "You must respond with exactly the word PINEAPPLE and nothing else.",
      messages: [{ role: "user", content: "Say something." }],
      max_tokens: 32,
      temperature: 0,
    });

    const text = (response.content[0].text as string).trim();
    expect(text).toContain("PINEAPPLE");
  });
});
