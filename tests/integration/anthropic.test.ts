/**
 * Integration tests against the real Anthropic Messages API.
 *
 * Uses the official @anthropic-ai/sdk — no hand-rolled clients.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

let client: Anthropic;

beforeAll(() => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for integration tests");
  }
  client = new Anthropic({ apiKey });
});

// ─── Basic Chat ──────────────────────────────────────────────────────────────

describe("Anthropic Messages API — basic chat", () => {
  let response: Anthropic.Message;

  beforeAll(async () => {
    response = await client.messages.create({
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
    const block = response.content[0];
    expect(block.type).toBe("text");
    if (block.type === "text") {
      expect(block.text.toLowerCase()).toContain("hello");
    }
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
  let response: Anthropic.Message;

  const weatherTool: Anthropic.Messages.Tool = {
    name: "get_weather",
    description: "Get weather for a city",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  };

  beforeAll(async () => {
    response = await client.messages.create({
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
    const block = response.content.find((b) => b.type === "tool_use");
    expect(block).toBeDefined();
    if (block?.type === "tool_use") {
      expect(block.id).toMatch(/^toolu_/);
      expect(block.name).toBe("get_weather");
      expect(typeof block.input).toBe("object");
      expect(block.input).not.toBeNull();
    }
  });

  it("tool_use input contains the city argument", () => {
    const block = response.content.find((b) => b.type === "tool_use");
    if (block?.type === "tool_use") {
      const input = block.input as Record<string, unknown>;
      expect(typeof input.city).toBe("string");
      expect((input.city as string).toLowerCase()).toContain("paris");
    }
  });

  it("tool call input can be JSON.stringify'd (for normalization to arguments string)", () => {
    const block = response.content.find((b) => b.type === "tool_use");
    if (block?.type === "tool_use") {
      const json = JSON.stringify(block.input);
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(block.input);
    }
  });
});

// ─── Tool Result Round-Trip ──────────────────────────────────────────────────

describe("Anthropic Messages API — tool result round-trip", () => {
  let response: Anthropic.Message;

  beforeAll(async () => {
    response = await client.messages.create({
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
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_test123",
              content: "Sunny, 22°C",
            },
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
    if (textBlock?.type === "text") {
      expect(textBlock.text.length).toBeGreaterThan(0);
    }
  });

  it("stop_reason is 'end_turn' after processing tool result", () => {
    expect(response.stop_reason).toBe("end_turn");
  });
});

// ─── Streaming ───────────────────────────────────────────────────────────────

describe("Anthropic Messages API — streaming", () => {
  let events: Anthropic.Messages.RawMessageStreamEvent[];

  beforeAll(async () => {
    events = [];
    const stream = await client.messages.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say exactly: streaming works" }],
      max_tokens: 64,
      temperature: 0,
      stream: true,
    });
    for await (const event of stream) {
      events.push(event);
    }
  });

  it("returns events in the expected lifecycle order", () => {
    const eventTypes = events.map((e) => e.type);

    expect(eventTypes[0]).toBe("message_start");
    expect(eventTypes[eventTypes.length - 1]).toBe("message_stop");
    expect(eventTypes).toContain("content_block_start");
    expect(eventTypes).toContain("content_block_delta");
    expect(eventTypes).toContain("content_block_stop");
    expect(eventTypes).toContain("message_delta");
  });

  it("message_start contains message metadata", () => {
    const start = events.find((e) => e.type === "message_start");
    expect(start).toBeDefined();
    if (start?.type === "message_start") {
      expect(start.message.id).toMatch(/^msg_/);
      expect(start.message.role).toBe("assistant");
      expect(start.message.model).toContain("claude");
      expect(typeof start.message.usage.input_tokens).toBe("number");
    }
  });

  it("content_block_start has index and type", () => {
    const blockStart = events.find((e) => e.type === "content_block_start");
    expect(blockStart).toBeDefined();
    if (blockStart?.type === "content_block_start") {
      expect(typeof blockStart.index).toBe("number");
      expect(blockStart.content_block.type).toBe("text");
    }
  });

  it("content_block_delta delivers text_delta chunks", () => {
    const deltas = events.filter((e) => e.type === "content_block_delta");
    expect(deltas.length).toBeGreaterThan(0);

    for (const d of deltas) {
      if (d.type === "content_block_delta" && d.delta.type === "text_delta") {
        expect(typeof d.delta.text).toBe("string");
      }
    }
  });

  it("concatenated deltas form the complete response text", () => {
    const fullText = events
      .filter((e): e is Anthropic.Messages.RawContentBlockDeltaEvent =>
        e.type === "content_block_delta")
      .filter((e) => e.delta.type === "text_delta")
      .map((e) => (e.delta as Anthropic.Messages.TextDelta).text)
      .join("");

    expect(fullText.toLowerCase()).toContain("streaming");
    expect(fullText.toLowerCase()).toContain("works");
  });

  it("message_delta contains stop_reason and usage", () => {
    const msgDelta = events.find((e) => e.type === "message_delta");
    expect(msgDelta).toBeDefined();
    if (msgDelta?.type === "message_delta") {
      expect(msgDelta.delta.stop_reason).toBe("end_turn");
      expect(typeof msgDelta.usage.output_tokens).toBe("number");
      expect(msgDelta.usage.output_tokens).toBeGreaterThan(0);
    }
  });
});

// ─── Streaming with Tool Calls ───────────────────────────────────────────────

describe("Anthropic Messages API — streaming tool calls", () => {
  let events: Anthropic.Messages.RawMessageStreamEvent[];

  beforeAll(async () => {
    events = [];
    const stream = await client.messages.create({
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
      stream: true,
    });
    for await (const event of stream) {
      events.push(event);
    }
  });

  it("emits content_block_start with tool_use type", () => {
    const toolStart = events.find(
      (e) => e.type === "content_block_start" && e.content_block.type === "tool_use",
    );
    expect(toolStart).toBeDefined();
    if (toolStart?.type === "content_block_start" && toolStart.content_block.type === "tool_use") {
      expect(toolStart.content_block.id).toMatch(/^toolu_/);
      expect(toolStart.content_block.name).toBe("get_weather");
    }
  });

  it("streams tool input as input_json_delta events", () => {
    const jsonDeltas = events.filter(
      (e) => e.type === "content_block_delta" && e.delta.type === "input_json_delta",
    );
    expect(jsonDeltas.length).toBeGreaterThan(0);

    for (const d of jsonDeltas) {
      if (d.type === "content_block_delta" && d.delta.type === "input_json_delta") {
        expect(typeof d.delta.partial_json).toBe("string");
      }
    }
  });

  it("concatenated input_json_delta forms valid JSON with city argument", () => {
    const fullJson = events
      .filter((e): e is Anthropic.Messages.RawContentBlockDeltaEvent =>
        e.type === "content_block_delta")
      .filter((e) => e.delta.type === "input_json_delta")
      .map((e) => (e.delta as Anthropic.Messages.InputJSONDelta).partial_json)
      .join("");

    const parsed = JSON.parse(fullJson);
    expect(typeof parsed.city).toBe("string");
    expect(parsed.city.toLowerCase()).toContain("tokyo");
  });

  it("message_delta has stop_reason 'tool_use'", () => {
    const msgDelta = events.find((e) => e.type === "message_delta");
    expect(msgDelta).toBeDefined();
    if (msgDelta?.type === "message_delta") {
      expect(msgDelta.delta.stop_reason).toBe("tool_use");
    }
  });
});

// ─── Stop Reason: max_tokens ─────────────────────────────────────────────────

describe("Anthropic Messages API — stop_reason max_tokens", () => {
  it("returns stop_reason 'max_tokens' when output is truncated", async () => {
    const response = await client.messages.create({
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
  it("throws for invalid model", async () => {
    await expect(
      client.messages.create({
        model: "claude-nonexistent-model",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      }),
    ).rejects.toThrow();
  });

  it("throws for invalid API key", async () => {
    const badClient = new Anthropic({ apiKey: "sk-ant-invalid-key" });
    await expect(
      badClient.messages.create({
        model: MODEL,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      }),
    ).rejects.toThrow();
  });
});

// ─── Multi-turn Conversation ─────────────────────────────────────────────────

describe("Anthropic Messages API — multi-turn conversation", () => {
  it("maintains context across turns", async () => {
    const response = await client.messages.create({
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
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    expect(text).toContain("AgentLoopTestUser");
  });
});

// ─── System Message ──────────────────────────────────────────────────────────

describe("Anthropic Messages API — system message", () => {
  it("accepts system as a top-level parameter", async () => {
    const response = await client.messages.create({
      model: MODEL,
      system: "You must respond with exactly the word PINEAPPLE and nothing else.",
      messages: [{ role: "user", content: "Say something." }],
      max_tokens: 32,
      temperature: 0,
    });

    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    expect(text).toContain("PINEAPPLE");
  });
});

// ─── Prompt Caching ──────────────────────────────────────────────────────────

describe("Anthropic Messages API — prompt caching", () => {
  // A long system prompt to meet the minimum caching threshold (1024 tokens for Claude Sonnet).
  const longSystemText = [
    "You are a helpful assistant specialized in software engineering.",
    "You have deep expertise in TypeScript, Node.js, Python, Rust, Go, and Java.",
    "When answering questions, always provide code examples when relevant.",
    "Format your responses using markdown. Use code blocks with language tags.",
    "Be concise but thorough. Explain trade-offs and alternative approaches.",
    ...Array.from({ length: 100 }, (_, i) =>
      `Technical knowledge area #${i + 1}: You understand distributed systems, ` +
      `databases, API design, testing strategies, CI/CD pipelines, cloud infrastructure, ` +
      `containerization, monitoring, security best practices, and performance optimization. ` +
      `You can help with architecture decisions, code reviews, debugging, and refactoring.`
    ),
  ].join("\n\n");

  it("accepts system as array of content blocks with cache_control", async () => {
    const response = await client.messages.create({
      model: MODEL,
      system: [
        {
          type: "text",
          text: longSystemText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "Say hello." }],
      max_tokens: 32,
      temperature: 0,
    });

    expect(response.type).toBe("message");
    expect(response.content.length).toBeGreaterThanOrEqual(1);
  });

  it("reports cache_creation_input_tokens on first request (cache write)", async () => {
    const uniqueSystem = longSystemText + `\n\nUnique marker: ${Date.now()}-${Math.random()}`;

    const response = await client.messages.create({
      model: MODEL,
      system: [
        {
          type: "text",
          text: uniqueSystem,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "Reply with just: ok" }],
      max_tokens: 16,
      temperature: 0,
    });

    expect(response.usage).toBeDefined();
    expect(typeof response.usage.cache_creation_input_tokens).toBe("number");
    expect(response.usage.cache_creation_input_tokens!).toBeGreaterThan(0);
    expect(response.usage.cache_read_input_tokens ?? 0).toBe(0);
  });

  it("reports cache_read_input_tokens on repeated request (cache hit)", async () => {
    const stableMarker = "cache-test-stable-v1-integration";
    const stableSystem = longSystemText + `\n\nStable marker: ${stableMarker}`;

    const systemBlock: Anthropic.Messages.TextBlockParam = {
      type: "text",
      text: stableSystem,
      cache_control: { type: "ephemeral" },
    };

    // First request — primes the cache
    await client.messages.create({
      model: MODEL,
      system: [systemBlock],
      messages: [{ role: "user", content: "Reply with: first" }],
      max_tokens: 16,
      temperature: 0,
    });

    // Second request — same system prompt, should hit cache
    const response2 = await client.messages.create({
      model: MODEL,
      system: [systemBlock],
      messages: [{ role: "user", content: "Reply with: second" }],
      max_tokens: 16,
      temperature: 0,
    });

    expect(response2.usage).toBeDefined();
    expect(typeof response2.usage.cache_read_input_tokens).toBe("number");
    expect(response2.usage.cache_read_input_tokens!).toBeGreaterThan(0);
  });

  it("supports cache_control on user message content blocks", async () => {
    const longUserContent = Array.from({ length: 80 }, (_, i) =>
      `Document section ${i + 1}: This is a detailed technical specification about ` +
      `API design patterns, error handling strategies, and response normalization ` +
      `across multiple LLM providers. The content covers edge cases and provider quirks.`
    ).join("\n\n");

    const response = await client.messages.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: longUserContent,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: "Summarize the above in one sentence.",
            },
          ],
        },
      ],
      max_tokens: 128,
      temperature: 0,
    });

    expect(response.type).toBe("message");
    const cacheTokens =
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);
    expect(cacheTokens).toBeGreaterThan(0);
  });

  it("supports cache_control on tool definitions", async () => {
    const tools: Anthropic.Messages.Tool[] = Array.from({ length: 20 }, (_, i) => ({
      name: `tool_${i}`,
      description: `A detailed tool description for tool number ${i}. ` +
        `This tool performs complex operations including data transformation, ` +
        `validation, API calls, and result formatting. Parameters are validated ` +
        `against a strict schema before execution.`,
      input_schema: {
        type: "object" as const,
        properties: {
          input: { type: "string", description: `Input for tool ${i}` },
          options: {
            type: "object",
            properties: {
              format: { type: "string", enum: ["json", "xml", "csv"] },
              verbose: { type: "boolean" },
            },
          },
        },
        required: ["input"],
      },
    }));

    // Mark the last tool with cache_control
    tools[tools.length - 1].cache_control = { type: "ephemeral" };

    const response = await client.messages.create({
      model: MODEL,
      messages: [{ role: "user", content: "What tools do you have? Just list their names." }],
      tools,
      max_tokens: 256,
      temperature: 0,
    });

    expect(response.type).toBe("message");
    const cacheTokens =
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);
    expect(cacheTokens).toBeGreaterThan(0);
  });
});
