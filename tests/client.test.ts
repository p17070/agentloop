import { describe, it, expect } from "vitest";

describe("AgentLoop Client", () => {
  describe("provider routing", () => {
    it.todo("routes 'openai/gpt-4' to OpenAI provider");
    it.todo("routes 'anthropic/claude-3-opus' to Anthropic transform");
    it.todo("routes 'google/gemini-pro' to Google transform");
    it.todo("routes 'groq/llama-3' to OpenAI-compatible provider with Groq config");
    it.todo("throws on unknown provider prefix");
  });

  describe("chat()", () => {
    it.todo("returns normalized ChatResponse for non-streaming call");
    it.todo("returns AsyncIterable of StreamEvents for streaming call");
  });

  describe("chatStructured()", () => {
    it.todo("validates response against Zod schema");
    it.todo("injects JSON schema into response_format");
    it.todo("returns typed, parsed object");
  });

  describe("middleware integration", () => {
    it.todo("applies configured middleware to requests");
    it.todo("middleware can modify request before dispatch");
    it.todo("middleware can modify response after dispatch");
  });

  describe("error handling", () => {
    it.todo("wraps provider errors in AgentLoopError");
    it.todo("includes provider name and status code in error");
    it.todo("handles network errors gracefully");
  });

  // Scaffold test
  it("test infrastructure is working", () => {
    expect(true).toBe(true);
  });
});
