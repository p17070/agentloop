import { describe, it, expect } from "vitest";
import { filterParams, buildHeaders, PROVIDERS } from "../src/registry.js";
import type { ChatRequest, ProviderEntry } from "../src/types.js";

describe("OpenAI-Compatible Provider", () => {
  describe("parameter filtering", () => {
    const baseRequest: ChatRequest = {
      model: "test/model",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 1.5,
      top_p: 0.9,
      max_tokens: 100,
      stop: "END",
      seed: 42,
      n: 3,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      logprobs: true,
      top_logprobs: 5,
      logit_bias: { "1234": 10 },
      tools: [{ type: "function", function: { name: "test", description: "test" } }],
      tool_choice: "auto",
      user: "test_user",
    };

    it("strips unsupported params for Groq (frequency_penalty, presence_penalty, logprobs, etc.)", () => {
      const result = filterParams(baseRequest, PROVIDERS.groq);

      expect(result.frequency_penalty).toBeUndefined();
      expect(result.presence_penalty).toBeUndefined();
      expect(result.logprobs).toBeUndefined();
      expect(result.top_logprobs).toBeUndefined();
      expect(result.logit_bias).toBeUndefined();
      // Other params should survive
      expect(result.temperature).toBeDefined();
      expect(result.top_p).toBe(0.9);
    });

    it("strips unsupported params for Perplexity (tools, tool_choice, seed, n, etc.)", () => {
      const result = filterParams(baseRequest, PROVIDERS.perplexity);

      expect(result.tools).toBeUndefined();
      expect(result.tool_choice).toBeUndefined();
      expect(result.parallel_tool_calls).toBeUndefined();
      expect(result.frequency_penalty).toBeUndefined();
      expect(result.presence_penalty).toBeUndefined();
      expect(result.logprobs).toBeUndefined();
      expect(result.top_logprobs).toBeUndefined();
      expect(result.logit_bias).toBeUndefined();
      expect(result.seed).toBeUndefined();
      expect(result.n).toBeUndefined();
      expect(result.user).toBeUndefined();
      // But temperature and max_tokens should remain
      expect(result.temperature).toBeDefined();
      expect(result.max_tokens).toBe(100);
    });

    it("strips unsupported params for Ollama (tool_choice, logprobs, logit_bias, n)", () => {
      const result = filterParams(baseRequest, PROVIDERS.ollama);

      expect(result.tool_choice).toBeUndefined();
      expect(result.logprobs).toBeUndefined();
      expect(result.top_logprobs).toBeUndefined();
      expect(result.logit_bias).toBeUndefined();
      expect(result.n).toBeUndefined();
      expect(result.user).toBeUndefined();
      // tools should still be present (Ollama supports tools, just not tool_choice)
      expect(result.tools).toBeDefined();
    });

    it("renames seed to random_seed for Mistral", () => {
      const result = filterParams(baseRequest, PROVIDERS.mistral);

      expect(result.seed).toBeUndefined();
      expect(result.random_seed).toBe(42);
    });

    it("clamps temperature to [0, 1] for Mistral", () => {
      const result = filterParams(baseRequest, PROVIDERS.mistral);
      expect(result.temperature).toBe(1); // 1.5 clamped to 1
    });

    it("clamps temperature to [0, 1] for Cohere", () => {
      const request: ChatRequest = {
        model: "cohere/command",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 1.8,
      };
      const result = filterParams(request, PROVIDERS.cohere);
      expect(result.temperature).toBe(1);
    });

    it("clamps n to 1 for Groq", () => {
      const result = filterParams(baseRequest, PROVIDERS.groq);
      expect(result.n).toBe(1);
    });

    it("passes all params through for OpenAI (no filtering)", () => {
      const result = filterParams(baseRequest, PROVIDERS.openai);

      expect(result.temperature).toBe(1.5);
      expect(result.top_p).toBe(0.9);
      expect(result.max_tokens).toBe(100);
      expect(result.seed).toBe(42);
      expect(result.n).toBe(3);
      expect(result.frequency_penalty).toBe(0.5);
      expect(result.presence_penalty).toBe(0.3);
      expect(result.logprobs).toBe(true);
      expect(result.top_logprobs).toBe(5);
      expect(result.logit_bias).toEqual({ "1234": 10 });
      expect(result.tools).toBeDefined();
      expect(result.tool_choice).toBe("auto");
      expect(result.user).toBe("test_user");
    });

    it("strips model and metadata from all providers", () => {
      const result = filterParams(
        { ...baseRequest, metadata: { foo: "bar" } },
        PROVIDERS.openai
      );
      expect(result.model).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it("injects defaults for missing values", () => {
      const entry: ProviderEntry = {
        baseURL: "https://example.com",
        auth: "bearer",
        defaults: { max_tokens: 4096, temperature: 0.7 },
      };
      const request: ChatRequest = {
        model: "test/model",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5, // explicitly set — should NOT be overridden
      };
      const result = filterParams(request, entry);
      expect(result.max_tokens).toBe(4096); // injected default
      expect(result.temperature).toBe(0.5); // user value preserved
    });

    it("strips params for DeepSeek (n, seed, user, logit_bias)", () => {
      const result = filterParams(baseRequest, PROVIDERS.deepseek);

      expect(result.n).toBeUndefined();
      expect(result.seed).toBeUndefined();
      expect(result.user).toBeUndefined();
      expect(result.logit_bias).toBeUndefined();
      // temperature should pass through
      expect(result.temperature).toBe(1.5);
    });
  });

  describe("header builder", () => {
    it("sets Authorization: Bearer header for standard providers", () => {
      const headers = buildHeaders(PROVIDERS.openai, "sk-test-key");
      expect(headers["authorization"]).toBe("Bearer sk-test-key");
      expect(headers["content-type"]).toBe("application/json");
    });

    it("sets x-api-key header for Anthropic", () => {
      const headers = buildHeaders(PROVIDERS.anthropic, "sk-ant-test");
      expect(headers["x-api-key"]).toBe("sk-ant-test");
      expect(headers["authorization"]).toBeUndefined();
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    });

    it("sets x-goog-api-key header for Google", () => {
      const headers = buildHeaders(PROVIDERS.google, "AIza-test");
      expect(headers["x-goog-api-key"]).toBe("AIza-test");
      expect(headers["authorization"]).toBeUndefined();
    });

    it("omits auth header for Ollama", () => {
      const headers = buildHeaders(PROVIDERS.ollama, "");
      expect(headers["authorization"]).toBeUndefined();
      expect(headers["x-api-key"]).toBeUndefined();
      expect(headers["content-type"]).toBe("application/json");
    });
  });

  describe("HTTP dispatch", () => {
    it.todo("sends POST to correct provider baseURL");
    it.todo("handles non-200 responses as errors");
  });

  describe("SSE streaming", () => {
    it.todo("parses SSE data: lines into stream events");
    it.todo("handles [DONE] sentinel");
    it.todo("emits content-part lifecycle events (start/delta/done)");
  });
});
