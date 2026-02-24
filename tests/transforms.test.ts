import { describe, it, expect } from "vitest";
import { toAnthropicRequest } from "../src/transforms/anthropic.js";
import { toGeminiRequest, convertSchemaTypes } from "../src/transforms/google.js";
import type { ChatRequest, ProviderEntry } from "../src/types.js";

const anthropicEntry: ProviderEntry = {
  baseURL: "https://api.anthropic.com/v1",
  auth: "x-api-key",
  transform: "anthropic",
  headers: { "anthropic-version": "2023-06-01" },
  defaults: { max_tokens: 4096 },
};

describe("Anthropic Transforms", () => {
  describe("request transform (toAnthropicRequest)", () => {
    it("converts ChatMessage[] to Anthropic messages format", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.model).toBe("claude-sonnet-4-20250514");
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]).toEqual({ role: "user", content: "Hello" });
      expect(result.messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Hi there!" }] });
      expect(result.messages[2]).toEqual({ role: "user", content: "How are you?" });
    });

    it("extracts system message to top-level system field", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.system).toBe("You are a helpful assistant.");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
    });

    it("concatenates multiple system messages", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "system", content: "Be concise." },
          { role: "user", content: "Hello" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.system).toBe("You are helpful.\n\nBe concise.");
    });

    it("converts tool definitions to Anthropic tool format", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        tools: [{
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather info",
            parameters: { type: "object", properties: { city: { type: "string" } } },
          },
        }],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0]).toEqual({
        name: "get_weather",
        description: "Get weather info",
        input_schema: { type: "object", properties: { city: { type: "string" } } },
      });
    });

    it("maps tool_choice to Anthropic tool_choice format", () => {
      const cases: Array<[ChatRequest["tool_choice"], unknown]> = [
        ["auto", { type: "auto" }],
        ["required", { type: "any" }],
        ["none", { type: "none" }],
        [{ type: "function", function: { name: "my_tool" } }, { type: "tool", name: "my_tool" }],
      ];

      for (const [input, expected] of cases) {
        const request: ChatRequest = {
          model: "anthropic/claude-sonnet-4-20250514",
          messages: [{ role: "user", content: "Hello" }],
          tools: [{ type: "function", function: { name: "my_tool", description: "test" } }],
          tool_choice: input,
        };

        const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);
        expect(result.tool_choice).toEqual(expected);
      }
    });

    it("sets max_tokens from request or defaults to 4096", () => {
      const requestWithMax: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1000,
      };

      const resultWithMax = toAnthropicRequest(requestWithMax, "claude-sonnet-4-20250514", anthropicEntry);
      expect(resultWithMax.max_tokens).toBe(1000);

      const requestWithoutMax: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
      };

      const resultDefault = toAnthropicRequest(requestWithoutMax, "claude-sonnet-4-20250514", anthropicEntry);
      expect(resultDefault.max_tokens).toBe(4096);
    });

    it("clamps temperature to [0, 1]", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 1.5,
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);
      expect(result.temperature).toBe(1);
    });

    it("converts stop to stop_sequences", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        stop: ["END", "STOP"],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);
      expect(result.stop_sequences).toEqual(["END", "STOP"]);
    });

    it("converts tool role messages to user role with tool_result blocks", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant", content: null,
            tool_calls: [{ id: "tc_1", type: "function", function: { name: "get_weather", arguments: '{"city":"NYC"}' } }],
          },
          { role: "tool", content: '{"temp": 72}', tool_call_id: "tc_1" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      // Tool result should become user role
      const toolMsg = result.messages[2];
      expect(toolMsg.role).toBe("user");
      expect(Array.isArray(toolMsg.content)).toBe(true);
      const blocks = toolMsg.content as Array<{ type: string; tool_use_id?: string }>;
      expect(blocks[0].type).toBe("tool_result");
      expect(blocks[0].tool_use_id).toBe("tc_1");
    });

    it("converts assistant tool_calls to tool_use content blocks", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          {
            role: "assistant",
            content: "Let me check that.",
            tool_calls: [{ id: "tc_1", type: "function", function: { name: "search", arguments: '{"q":"test"}' } }],
          },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      const blocks = result.messages[0].content as Array<{ type: string; id?: string; name?: string; input?: unknown }>;
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toEqual({ type: "text", text: "Let me check that." });
      expect(blocks[1]).toEqual({
        type: "tool_use",
        id: "tc_1",
        name: "search",
        input: { q: "test" },
      });
    });

    it("handles image content parts with data URIs", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
          ],
        }],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      const blocks = result.messages[0].content as Array<{ type: string; source?: { type: string; media_type?: string; data?: string } }>;
      expect(blocks).toHaveLength(2);
      expect(blocks[1].type).toBe("image");
      expect(blocks[1].source).toEqual({
        type: "base64",
        media_type: "image/png",
        data: "iVBORw0KGgo=",
      });
    });

    it("handles image content parts with URLs", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://example.com/image.png" } },
          ],
        }],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      const blocks = result.messages[0].content as Array<{ type: string; source?: { type: string; url?: string } }>;
      expect(blocks[0].type).toBe("image");
      expect(blocks[0].source).toEqual({ type: "url", url: "https://example.com/image.png" });
    });

    it("applies cache control to system message", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: "You are a helpful assistant.", cache: "ephemeral" },
          { role: "user", content: "Hello" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(Array.isArray(result.system)).toBe(true);
      const systemBlocks = result.system as Array<{ type: string; text: string; cache_control?: { type: string } }>;
      expect(systemBlocks[0].cache_control).toEqual({ type: "ephemeral" });
    });

    it("applies cache control to tool definitions", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        tools: [{
          type: "function",
          function: { name: "my_tool", description: "test" },
          cache: "ephemeral",
        }],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.tools![0].cache_control).toEqual({ type: "ephemeral" });
    });

    it("maps user to metadata.user_id", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        user: "user_123",
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(result.metadata).toEqual({ user_id: "user_123" });
    });

    it("injects json_schema into system prompt for response_format", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "List colors" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: { type: "object", properties: { colors: { type: "array" } } },
          },
        },
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      expect(typeof result.system).toBe("string");
      expect(result.system as string).toContain("Respond with JSON matching this schema:");
    });

    it("merges adjacent same-role messages", () => {
      const request: ChatRequest = {
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "user", content: "Hello" },
          { role: "user", content: "Are you there?" },
        ],
      };

      const result = toAnthropicRequest(request, "claude-sonnet-4-20250514", anthropicEntry);

      // Adjacent user messages should be merged
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
    });
  });

  describe("response transform (fromAnthropicResponse)", () => {
    it.todo("maps text content blocks to TextPart");
    it.todo("maps tool_use blocks to ToolCallPart");
    it.todo("maps thinking blocks to ThinkingPart");
    it.todo("maps redacted_thinking blocks to RedactedThinkingPart");
    it.todo("maps server_tool_use blocks to ServerToolCallPart");
    it.todo("normalizes all 4 Anthropic citation types to unified Citation");
    it.todo("maps Anthropic stop_reason to FinishReason");
  });

  describe("stream transform (fromAnthropicStream)", () => {
    it.todo("maps content_block_start events to content.start");
    it.todo("maps content_block_delta events to content.delta");
    it.todo("maps content_block_stop events to content.done");
    it.todo("maps message_delta events to message.delta");
  });
});

describe("Google Gemini Transforms", () => {
  describe("request transform (toGeminiRequest)", () => {
    it("converts ChatMessage[] to Gemini contents format", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.contents).toHaveLength(3);
      expect(result.contents[0]).toEqual({ role: "user", parts: [{ text: "Hello" }] });
      expect(result.contents[1]).toEqual({ role: "model", parts: [{ text: "Hi there!" }] });
      expect(result.contents[2]).toEqual({ role: "user", parts: [{ text: "How are you?" }] });
    });

    it("maps system message to systemInstruction", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.systemInstruction).toEqual({
        parts: [{ text: "You are a helpful assistant." }],
      });
      expect(result.contents).toHaveLength(1);
    });

    it("converts tool definitions to Gemini function declarations", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Hello" }],
        tools: [{
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        }],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].functionDeclarations).toHaveLength(1);
      expect(result.tools![0].functionDeclarations[0]).toEqual({
        name: "get_weather",
        description: "Get weather",
        parameters: {
          type: "OBJECT",
          properties: { city: { type: "STRING" } },
          required: ["city"],
        },
      });
    });

    it("maps tool_choice to Gemini toolConfig", () => {
      const cases: Array<[ChatRequest["tool_choice"], { mode: string; allowedFunctionNames?: string[] }]> = [
        ["auto", { mode: "AUTO" }],
        ["required", { mode: "ANY" }],
        ["none", { mode: "NONE" }],
        [
          { type: "function", function: { name: "my_tool" } },
          { mode: "ANY", allowedFunctionNames: ["my_tool"] },
        ],
      ];

      for (const [input, expected] of cases) {
        const request: ChatRequest = {
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Hello" }],
          tools: [{ type: "function", function: { name: "my_tool", description: "test" } }],
          tool_choice: input,
        };

        const result = toGeminiRequest(request, "gemini-2.5-flash");
        expect(result.toolConfig?.functionCallingConfig).toEqual(expected);
      }
    });

    it("maps generation params to generationConfig", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000,
        stop: ["END"],
        seed: 42,
        n: 2,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        logprobs: true,
        top_logprobs: 5,
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.generationConfig).toEqual({
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1000,
        stopSequences: ["END"],
        seed: 42,
        candidateCount: 2,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
        responseLogprobs: true,
        logprobs: 5,
      });
    });

    it("converts assistant tool_calls to functionCall parts", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "tc_1", type: "function", function: { name: "search", arguments: '{"q":"test"}' } }],
          },
        ],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      const parts = result.contents[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].functionCall).toEqual({ name: "search", args: { q: "test" } });
    });

    it("converts tool result messages to functionResponse parts", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "tc_1", type: "function", function: { name: "get_weather", arguments: '{"city":"NYC"}' } }],
          },
          { role: "tool", content: '{"temp": 72}', tool_call_id: "tc_1" },
        ],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      // Tool result should be user role with functionResponse
      const toolContent = result.contents[1];
      expect(toolContent.role).toBe("user");
      expect(toolContent.parts[0].functionResponse).toEqual({
        name: "get_weather",
        response: { temp: 72 },
      });
    });

    it("handles image content parts with data URIs", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
          ],
        }],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      const parts = result.contents[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ text: "Describe this" });
      expect(parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } });
    });

    it("handles audio content parts", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "input_audio", input_audio: { data: "base64audio==", format: "wav" } },
          ],
        }],
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.contents[0].parts[0]).toEqual({
        inlineData: { mimeType: "audio/wav", data: "base64audio==" },
      });
    });

    it("converts response_format to responseMimeType/responseSchema", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "List colors" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: { type: "object", properties: { colors: { type: "array", items: { type: "string" } } } },
          },
        },
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.generationConfig?.responseMimeType).toBe("application/json");
      expect(result.generationConfig?.responseSchema).toEqual({
        type: "OBJECT",
        properties: { colors: { type: "ARRAY", items: { type: "STRING" } } },
      });
    });

    it("converts json_object response_format to responseMimeType", () => {
      const request: ChatRequest = {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Return JSON" }],
        response_format: { type: "json_object" },
      };

      const result = toGeminiRequest(request, "gemini-2.5-flash");

      expect(result.generationConfig?.responseMimeType).toBe("application/json");
      expect(result.generationConfig?.responseSchema).toBeUndefined();
    });
  });

  describe("convertSchemaTypes", () => {
    it("converts lowercase type strings to UPPERCASE", () => {
      expect(convertSchemaTypes({ type: "string" })).toEqual({ type: "STRING" });
      expect(convertSchemaTypes({ type: "number" })).toEqual({ type: "NUMBER" });
      expect(convertSchemaTypes({ type: "integer" })).toEqual({ type: "INTEGER" });
      expect(convertSchemaTypes({ type: "boolean" })).toEqual({ type: "BOOLEAN" });
      expect(convertSchemaTypes({ type: "array" })).toEqual({ type: "ARRAY" });
      expect(convertSchemaTypes({ type: "object" })).toEqual({ type: "OBJECT" });
    });

    it("recursively converts nested properties", () => {
      const result = convertSchemaTypes({
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
          items: { type: "array", items: { type: "string" } },
        },
      });

      expect(result).toEqual({
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          count: { type: "INTEGER" },
          items: { type: "ARRAY", items: { type: "STRING" } },
        },
      });
    });
  });

  describe("response transform (fromGeminiResponse)", () => {
    it.todo("maps text parts to TextPart");
    it.todo("maps functionCall parts to ToolCallPart");
    it.todo("maps inlineData image parts to ImagePart");
    it.todo("maps inlineData audio parts to AudioPart");
    it.todo("maps executableCode parts to CodeExecutionPart");
    it.todo("maps codeExecutionResult parts to CodeResultPart");
    it.todo("maps grounding metadata to UrlCitation on TextPart");
    it.todo("maps Gemini finishReason to FinishReason");
    it.todo("normalizes usageMetadata to Usage");
  });

  describe("stream transform (fromGeminiStream)", () => {
    it.todo("diffs consecutive chunks to produce content deltas");
    it.todo("emits content-part lifecycle events");
  });
});
