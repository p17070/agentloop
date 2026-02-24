/**
 * AgentLoop WebUI — Provider Registry & Request Transforms
 *
 * Mirrors the SDK's registry.ts, transforms/anthropic.ts, and transforms/google.ts
 * in plain JS for direct browser use. BYOK — all calls go from browser → provider API.
 */

// ─── Provider Registry ──────────────────────────────────────────────────────

const PROVIDERS = {
  openai: {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    auth: "bearer",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy for browser use.",
  },

  anthropic: {
    name: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    auth: "x-api-key",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    headers: { "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    chatEndpoint: (baseURL, _model) => `${baseURL}/messages`,
    transform: "anthropic",
    corsNote: "Direct browser access supported.",
  },

  google: {
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    auth: "x-goog-api-key",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    chatEndpoint: (baseURL, model, stream) =>
      `${baseURL}/models/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
    transform: "google",
    corsNote: "Direct browser access supported.",
  },

  groq: {
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    auth: "bearer",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    strip: ["frequency_penalty", "presence_penalty", "logprobs", "top_logprobs", "logit_bias"],
    corsNote: "Direct browser access supported.",
  },

  together: {
    name: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    auth: "bearer",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "meta-llama/Llama-3.1-8B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  mistral: {
    name: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    auth: "bearer",
    defaultModel: "mistral-large-latest",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mistral-nemo"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    auth: "bearer",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    strip: ["n", "seed", "user", "logit_bias"],
    corsNote: "May require a CORS proxy.",
  },

  fireworks: {
    name: "Fireworks",
    baseURL: "https://api.fireworks.ai/inference/v1",
    auth: "bearer",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/mixtral-8x7b-instruct"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  perplexity: {
    name: "Perplexity",
    baseURL: "https://api.perplexity.ai",
    auth: "bearer",
    defaultModel: "sonar",
    models: ["sonar", "sonar-pro", "sonar-reasoning"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    strip: ["tools", "tool_choice", "parallel_tool_calls", "frequency_penalty", "presence_penalty", "logprobs", "top_logprobs", "logit_bias", "seed", "n", "user"],
    corsNote: "May require a CORS proxy.",
  },

  cohere: {
    name: "Cohere",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    auth: "bearer",
    defaultModel: "command-r-plus",
    models: ["command-r-plus", "command-r", "command-light"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    strip: ["logit_bias", "top_logprobs", "n", "user", "parallel_tool_calls"],
    corsNote: "May require a CORS proxy.",
  },

  ollama: {
    name: "Ollama",
    baseURL: "http://localhost:11434/v1",
    auth: "none",
    defaultModel: "llama3.2",
    models: ["llama3.2", "llama3.1", "mistral", "codellama", "phi3"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    strip: ["tool_choice", "logprobs", "top_logprobs", "logit_bias", "n", "user"],
    corsNote: "Runs locally — no CORS issues.",
  },
};

// ─── Header Builder ─────────────────────────────────────────────────────────

function buildHeaders(provider, apiKey) {
  const entry = PROVIDERS[provider];
  const headers = { "content-type": "application/json" };

  switch (entry.auth) {
    case "bearer":
      headers["authorization"] = `Bearer ${apiKey}`;
      break;
    case "x-api-key":
      headers["x-api-key"] = apiKey;
      break;
    case "x-goog-api-key":
      headers["x-goog-api-key"] = apiKey;
      break;
    case "none":
      break;
  }

  if (entry.headers) {
    Object.assign(headers, entry.headers);
  }

  return headers;
}

// ─── Request Builders ───────────────────────────────────────────────────────

/**
 * Build the request body and URL for any provider.
 * Returns { url, headers, body } ready for fetch().
 */
function buildRequest({ provider, model, messages, systemMessage, temperature, maxTokens, topP, stream, corsProxy, customEndpoint }) {
  const entry = PROVIDERS[provider];
  const baseURL = customEndpoint || entry.baseURL;
  const apiKey = getApiKey(provider);

  if (!apiKey && entry.auth !== "none") {
    throw new Error(`No API key set for ${entry.name}. Enter your key in the sidebar.`);
  }

  // Build the conversation messages with system message prepended
  const fullMessages = [];
  if (systemMessage && systemMessage.trim()) {
    fullMessages.push({ role: "system", content: systemMessage.trim() });
  }
  fullMessages.push(...messages);

  let url, headers, body;

  if (entry.transform === "anthropic") {
    ({ url, headers, body } = buildAnthropicRequest(baseURL, model, apiKey, fullMessages, { temperature, maxTokens, topP, stream }));
  } else if (entry.transform === "google") {
    ({ url, headers, body } = buildGeminiRequest(baseURL, model, apiKey, fullMessages, { temperature, maxTokens, topP, stream }));
  } else {
    ({ url, headers, body } = buildOpenAIRequest(provider, baseURL, model, apiKey, fullMessages, { temperature, maxTokens, topP, stream }));
  }

  // Apply CORS proxy if set
  if (corsProxy && corsProxy.trim()) {
    url = corsProxy.trim() + encodeURIComponent(url);
  }

  return { url, headers, body };
}

// ─── OpenAI-Compatible Request ──────────────────────────────────────────────

function buildOpenAIRequest(provider, baseURL, model, apiKey, messages, opts) {
  const entry = PROVIDERS[provider];
  const url = entry.chatEndpoint(baseURL, model);
  const headers = buildHeaders(provider, apiKey);

  const body = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };

  if (opts.stream) body.stream = true;
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.maxTokens != null) body.max_tokens = opts.maxTokens;
  if (opts.topP != null && opts.topP < 1) body.top_p = opts.topP;

  // Strip unsupported params
  if (entry.strip) {
    for (const key of entry.strip) {
      delete body[key];
    }
  }

  return { url, headers, body };
}

// ─── Anthropic Request ──────────────────────────────────────────────────────

function buildAnthropicRequest(baseURL, model, apiKey, messages, opts) {
  const url = `${baseURL}/messages`;
  const headers = buildHeaders("anthropic", apiKey);

  // Extract system messages
  const systemParts = [];
  const nonSystem = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      nonSystem.push(msg);
    }
  }

  // Convert messages — merge adjacent same-role
  const converted = [];
  for (const msg of nonSystem) {
    const role = msg.role === "tool" ? "user" : (msg.role === "assistant" ? "assistant" : "user");
    const content = msg.content;
    const last = converted[converted.length - 1];

    if (last && last.role === role) {
      // Merge: ensure content is array
      if (typeof last.content === "string") {
        last.content = [{ type: "text", text: last.content }];
      }
      if (typeof content === "string") {
        last.content.push({ type: "text", text: content });
      }
    } else {
      converted.push({ role, content });
    }
  }

  const body = {
    model,
    messages: converted,
    max_tokens: opts.maxTokens || 4096,
  };

  if (systemParts.length > 0) {
    body.system = systemParts.join("\n\n");
  }
  if (opts.stream) body.stream = true;
  if (opts.temperature != null) body.temperature = Math.min(Math.max(opts.temperature, 0), 1);
  if (opts.topP != null && opts.topP < 1) body.top_p = opts.topP;

  return { url, headers, body };
}

// ─── Gemini Request ─────────────────────────────────────────────────────────

function buildGeminiRequest(baseURL, model, apiKey, messages, opts) {
  const stream = !!opts.stream;
  const url = `${baseURL}/models/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
  const headers = buildHeaders("google", apiKey);

  // Extract system messages
  const systemParts = [];
  const nonSystem = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      nonSystem.push(msg);
    }
  }

  // Convert messages to Gemini contents
  const contents = nonSystem.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const body = { contents };

  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
  }

  const genConfig = {};
  if (opts.temperature != null) genConfig.temperature = opts.temperature;
  if (opts.maxTokens != null) genConfig.maxOutputTokens = opts.maxTokens;
  if (opts.topP != null && opts.topP < 1) genConfig.topP = opts.topP;

  if (Object.keys(genConfig).length > 0) {
    body.generationConfig = genConfig;
  }

  return { url, headers, body };
}

// ─── API Key Management ─────────────────────────────────────────────────────

function getApiKey(provider) {
  return localStorage.getItem(`agentloop_key_${provider}`) || "";
}

function setApiKey(provider, key) {
  if (key) {
    localStorage.setItem(`agentloop_key_${provider}`, key);
  } else {
    localStorage.removeItem(`agentloop_key_${provider}`);
  }
}

// ─── Stream Parsers ─────────────────────────────────────────────────────────

/**
 * Normalize raw usage from any provider into a unified shape:
 * { input_tokens, output_tokens, cached_tokens, cache_write_tokens, reasoning_tokens }
 * All fields are numbers (0 if absent).
 */
function normalizeUsage(provider, raw) {
  if (!raw) return null;
  const entry = PROVIDERS[provider];

  if (entry.transform === "anthropic") {
    return {
      input_tokens: raw.input_tokens || 0,
      output_tokens: raw.output_tokens || 0,
      cached_tokens: raw.cache_read_input_tokens || 0,
      cache_write_tokens: raw.cache_creation_input_tokens || 0,
      reasoning_tokens: 0,
    };
  }

  if (entry.transform === "google") {
    return {
      input_tokens: raw.promptTokenCount || 0,
      output_tokens: raw.candidatesTokenCount || 0,
      cached_tokens: raw.cachedContentTokenCount || 0,
      cache_write_tokens: 0,
      reasoning_tokens: raw.thoughtsTokenCount || 0,
    };
  }

  // OpenAI-compatible
  const cached = raw.prompt_tokens_details?.cached_tokens || 0;
  const reasoning = raw.completion_tokens_details?.reasoning_tokens || 0;
  return {
    input_tokens: raw.prompt_tokens || 0,
    output_tokens: raw.completion_tokens || 0,
    cached_tokens: cached,
    cache_write_tokens: 0,
    reasoning_tokens: reasoning,
  };
}

/**
 * Parse an OpenAI-compatible SSE stream.
 * Yields text deltas as they arrive.
 */
async function* parseOpenAIStream(reader) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        const delta = data.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: "delta", text: delta.content };
        }
        // Check for finish reason
        if (data.choices?.[0]?.finish_reason) {
          yield { type: "finish", reason: data.choices[0].finish_reason };
        }
        // Usage info (full object for downstream normalization)
        if (data.usage) {
          yield { type: "usage", usage: data.usage };
        }
        // Groq nests usage in x_groq.usage
        if (data.x_groq?.usage) {
          yield { type: "usage", usage: data.x_groq.usage };
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}

/**
 * Parse an Anthropic SSE stream.
 */
async function* parseAnthropicStream(reader) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));

        switch (data.type) {
          case "content_block_delta":
            if (data.delta?.type === "text_delta" && data.delta.text) {
              yield { type: "delta", text: data.delta.text };
            }
            break;
          case "message_delta":
            if (data.usage) {
              yield { type: "usage", usage: { output_tokens: data.usage.output_tokens } };
            }
            if (data.delta?.stop_reason) {
              yield { type: "finish", reason: data.delta.stop_reason === "end_turn" ? "stop" : data.delta.stop_reason };
            }
            break;
          case "message_start":
            if (data.message?.usage) {
              // Anthropic sends cache stats on message_start
              yield {
                type: "usage",
                usage: {
                  input_tokens: data.message.usage.input_tokens,
                  cache_read_input_tokens: data.message.usage.cache_read_input_tokens || 0,
                  cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens || 0,
                },
              };
            }
            break;
          case "error":
            yield { type: "error", error: data.error?.message || "Stream error" };
            break;
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}

/**
 * Parse a Gemini SSE stream.
 */
async function* parseGeminiStream(reader) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        const candidates = data.candidates;

        if (candidates?.[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.text) {
              yield { type: "delta", text: part.text };
            }
          }
        }

        // Finish reason
        if (candidates?.[0]?.finishReason) {
          const reason = candidates[0].finishReason;
          yield { type: "finish", reason: reason === "STOP" ? "stop" : reason.toLowerCase() };
        }

        // Usage — pass full usageMetadata for normalization
        if (data.usageMetadata) {
          yield { type: "usage", usage: data.usageMetadata };
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}

/**
 * Get the appropriate stream parser for a provider.
 */
function getStreamParser(provider) {
  const entry = PROVIDERS[provider];
  if (entry.transform === "anthropic") return parseAnthropicStream;
  if (entry.transform === "google") return parseGeminiStream;
  return parseOpenAIStream;
}

/**
 * Parse a non-streaming response from any provider.
 * Returns { text, usage } with normalized usage.
 */
function parseResponse(provider, data) {
  const entry = PROVIDERS[provider];

  if (entry.transform === "anthropic") {
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");
    return {
      text,
      usage: normalizeUsage(provider, data.usage),
    };
  }

  if (entry.transform === "google") {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("");
    return {
      text,
      usage: normalizeUsage(provider, data.usageMetadata),
    };
  }

  // OpenAI-compatible
  const text = data.choices?.[0]?.message?.content || "";
  return {
    text,
    usage: normalizeUsage(provider, data.usage),
  };
}
