import { describe, it, expect } from "vitest";

describe("OpenAI-Compatible Provider", () => {
  describe("parameter filtering", () => {
    it.todo("strips unsupported params for Groq (frequency_penalty, presence_penalty, logprobs, etc.)");
    it.todo("strips unsupported params for Perplexity (tools, tool_choice, seed, n, etc.)");
    it.todo("strips unsupported params for Ollama (tool_choice, logprobs, logit_bias, n)");
    it.todo("renames seed to random_seed for Mistral");
    it.todo("clamps temperature to [0, 1] for Mistral");
    it.todo("clamps n to 1 for Groq");
    it.todo("passes all params through for OpenAI (no filtering)");
  });

  describe("HTTP dispatch", () => {
    it.todo("sends POST to correct provider baseURL");
    it.todo("sets Authorization: Bearer header for standard providers");
    it.todo("omits auth header for Ollama");
    it.todo("handles non-200 responses as errors");
  });

  describe("SSE streaming", () => {
    it.todo("parses SSE data: lines into stream events");
    it.todo("handles [DONE] sentinel");
    it.todo("emits content-part lifecycle events (start/delta/done)");
  });

  // Scaffold test
  it("test infrastructure is working", () => {
    expect(true).toBe(true);
  });
});
