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

  xai: {
    name: "xAI",
    baseURL: "https://api.x.ai/v1",
    auth: "bearer",
    defaultModel: "grok-4-1-fast-non-reasoning",
    models: ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-4", "grok-3-beta", "grok-3-mini-beta"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
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

  moonshot: {
    name: "Moonshot AI",
    baseURL: "https://api.moonshot.ai/v1",
    auth: "bearer",
    defaultModel: "kimi-k2.5",
    models: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-thinking", "moonshot-v1-128k", "moonshot-v1-32k"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  cerebras: {
    name: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    auth: "bearer",
    defaultModel: "gpt-oss-120b",
    models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "zai-glm-4.7", "llama3.1-8b"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  sambanova: {
    name: "SambaNova",
    baseURL: "https://api.sambanova.ai/v1",
    auth: "bearer",
    defaultModel: "DeepSeek-V3.1",
    models: ["DeepSeek-V3.1", "DeepSeek-R1-0528", "DeepSeek-V3-0324", "Llama-4-Maverick-17B-128E-Instruct", "Meta-Llama-3.3-70B-Instruct", "Meta-Llama-3.1-8B-Instruct", "Qwen3-235B-A22B-Instruct-2507", "Qwen3-32B"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },

  ai21: {
    name: "AI21 Labs",
    baseURL: "https://api.ai21.com/studio/v1",
    auth: "bearer",
    defaultModel: "jamba-large",
    models: ["jamba-large", "jamba-mini"],
    chatEndpoint: (baseURL, _model) => `${baseURL}/chat/completions`,
    corsNote: "May require a CORS proxy.",
  },
};

// ─── Model Catalog ──────────────────────────────────────────────────────────
// Loaded from catalog.generated.js (generated from src/catalog.json).
// To add/change models, edit src/catalog.json then run: node scripts/sync-webui-catalog.mjs

const MODEL_CATALOG = CATALOG_MODELS; // from catalog.generated.js

// ─── Model Helpers ──────────────────────────────────────────────────────────

/**
 * Get models for a provider, filtered by modality and optional search query.
 * modality: "chat" | "image" | "audio" | "embedding"
 * "chat" returns models without an explicit modality field (the default).
 */
function getModelsForProvider(provider, modality, query) {
  let models = MODEL_CATALOG.filter(m => {
    if (m.provider !== provider) return false;
    if (modality === "chat") return !m.modality; // chat = no explicit modality
    return m.modality === modality;
  });
  if (query) {
    const q = query.toLowerCase();
    models = models.filter(m =>
      m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) ||
      m.categories.some(c => c.toLowerCase().includes(q))
    );
  }
  // Sort: default model first, then alphabetically by name
  models.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
  return models;
}

/** Check if a provider has any models for a given modality */
function providerHasModality(provider, modality) {
  return MODEL_CATALOG.some(m => {
    if (m.provider !== provider) return false;
    if (modality === "chat") return !m.modality;
    return m.modality === modality;
  });
}

/** Get the default model from the catalog for a provider and modality */
function getCatalogDefault(provider, modality) {
  const mod = modality || "chat";
  return MODEL_CATALOG.find(m => {
    if (m.provider !== provider || !m.isDefault) return false;
    if (mod === "chat") return !m.modality;
    return m.modality === mod;
  });
}

/** Format context window size: 128000 → "128k", 1000000 → "1M" */
function fmtCtx(n) {
  if (!n) return "";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return n.toString();
}

// ─── Custom Provider Management ─────────────────────────────────────────────

/** Load custom providers from localStorage */
function loadCustomProviders() {
  try {
    return JSON.parse(localStorage.getItem("agentloop_custom_providers") || "{}");
  } catch {
    return {};
  }
}

/** Save custom providers to localStorage */
function saveCustomProviders(customProviders) {
  localStorage.setItem("agentloop_custom_providers", JSON.stringify(customProviders));
}

/** Register a custom provider into the PROVIDERS registry */
function registerCustomProvider(id, config) {
  PROVIDERS[id] = {
    name: config.name,
    baseURL: config.baseURL,
    auth: config.auth || "bearer",
    defaultModel: config.defaultModel || "",
    models: config.models || [],
    chatEndpoint: config.transform === "anthropic"
      ? (baseURL, _model) => `${baseURL}/messages`
      : config.transform === "google"
        ? (baseURL, model, stream) => `${baseURL}/models/${model}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`
        : (baseURL, _model) => `${baseURL}/chat/completions`,
    transform: config.transform || undefined,
    headers: config.headers || undefined,
    strip: config.strip || undefined,
    corsNote: config.corsNote || "",
    isCustom: true,
  };
}

/** Load and register all saved custom providers on startup */
function initCustomProviders() {
  const custom = loadCustomProviders();
  for (const [id, config] of Object.entries(custom)) {
    registerCustomProvider(id, config);
  }
}

/** Add a new custom provider */
function addCustomProvider(config) {
  const id = "custom_" + config.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const custom = loadCustomProviders();
  custom[id] = config;
  saveCustomProviders(custom);
  registerCustomProvider(id, config);
  return id;
}

/** Remove a custom provider */
function removeCustomProvider(id) {
  const custom = loadCustomProviders();
  delete custom[id];
  saveCustomProviders(custom);
  delete PROVIDERS[id];
}

// ─── Per-Provider Endpoint Overrides ────────────────────────────────────────

/** Load per-provider endpoint overrides from localStorage */
function loadEndpointOverrides() {
  try {
    return JSON.parse(localStorage.getItem("agentloop_endpoint_overrides") || "{}");
  } catch {
    return {};
  }
}

/** Save per-provider endpoint overrides */
function saveEndpointOverrides(overrides) {
  localStorage.setItem("agentloop_endpoint_overrides", JSON.stringify(overrides));
}

/** Get the effective base URL for a provider (custom override or default) */
function getEffectiveBaseURL(provider) {
  const overrides = loadEndpointOverrides();
  return overrides[provider]?.baseURL || PROVIDERS[provider]?.baseURL || "";
}

/** Get custom headers for a provider */
function getCustomHeaders(provider) {
  const overrides = loadEndpointOverrides();
  return overrides[provider]?.headers || {};
}

/** Set endpoint override for a provider */
function setEndpointOverride(provider, baseURL, headers) {
  const overrides = loadEndpointOverrides();
  if (!baseURL && (!headers || Object.keys(headers).length === 0)) {
    delete overrides[provider];
  } else {
    overrides[provider] = {};
    if (baseURL) overrides[provider].baseURL = baseURL;
    if (headers && Object.keys(headers).length > 0) overrides[provider].headers = headers;
  }
  saveEndpointOverrides(overrides);
}

// Initialize custom providers on load
initCustomProviders();

// ─── Header Builder ─────────────────────────────────────────────────────────

function buildHeaders(provider, apiKey) {
  const entry = PROVIDERS[provider];
  const headers = { "content-type": "application/json" };

  switch (entry.auth) {
    case "bearer":
      if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
      break;
    case "x-api-key":
      if (apiKey) headers["x-api-key"] = apiKey;
      break;
    case "x-goog-api-key":
      if (apiKey) headers["x-goog-api-key"] = apiKey;
      break;
    case "none":
      break;
  }

  if (entry.headers) {
    Object.assign(headers, entry.headers);
  }

  // Apply per-provider custom headers
  const customHeaders = getCustomHeaders(provider);
  if (customHeaders && Object.keys(customHeaders).length > 0) {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

// ─── Request Builders ───────────────────────────────────────────────────────

/**
 * Build the request body and URL for any provider.
 * Returns { url, headers, body } ready for fetch().
 */
function buildRequest({ provider, model, messages, systemMessage, temperature, maxTokens, topP, stream, corsProxy, mcpTools }) {
  const entry = PROVIDERS[provider];
  const baseURL = getEffectiveBaseURL(provider);
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

  // Merge MCP tool definitions into the request body
  if (mcpTools && mcpTools.length > 0) {
    const toolFields = toolsToProviderFormat(provider, mcpTools);
    Object.assign(body, toolFields);
  }

  // Apply per-provider custom headers on top
  const customHdrs = getCustomHeaders(provider);
  if (customHdrs && Object.keys(customHdrs).length > 0) {
    Object.assign(headers, customHdrs);
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
    messages: messages.map(m => {
      // Handle tool-call assistant messages (have tool_calls array)
      if (m.role === "assistant" && m.tool_calls) {
        return { role: "assistant", content: m.content, tool_calls: m.tool_calls };
      }
      // Handle tool result messages
      if (m.role === "tool" && m.tool_call_id) {
        return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      }
      // Handle multimodal content (array of parts)
      if (Array.isArray(m.content)) {
        return { role: m.role, content: convertPartsForOpenAI(m.content) };
      }
      return { role: m.role, content: m.content };
    }),
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

  // Convert messages — merge adjacent same-role, handle structured content
  const converted = [];
  for (const msg of nonSystem) {
    const role = msg.role === "tool" ? "user" : (msg.role === "assistant" ? "assistant" : "user");
    // Convert multimodal content parts to Anthropic format
    let content;
    if (Array.isArray(msg.content) && msg.content.length > 0 && msg.content[0]?.type) {
      // Check if these are generic content parts (image_url, file, text from our upload system)
      const hasGenericParts = msg.content.some(p => p.type === "image_url" || p.type === "file");
      content = hasGenericParts ? convertPartsForAnthropic(msg.content) : msg.content;
    } else {
      content = msg.content;
    }
    const last = converted[converted.length - 1];

    if (last && last.role === role) {
      // Merge: ensure content is array
      if (typeof last.content === "string") {
        last.content = [{ type: "text", text: last.content }];
      }
      if (typeof content === "string") {
        last.content.push({ type: "text", text: content });
      } else if (Array.isArray(content)) {
        last.content.push(...content);
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
  const contents = nonSystem.map(msg => {
    const role = msg.role === "assistant" ? "model" : "user";
    // Handle structured Gemini tool messages
    if (msg._isGeminiToolCall || msg._isGeminiToolResult) {
      return { role, parts: msg.content };
    }
    // Handle multimodal content parts
    if (Array.isArray(msg.content) && msg.content.length > 0 && msg.content[0]?.type) {
      return { role, parts: convertPartsForGemini(msg.content) };
    }
    return { role, parts: [{ text: msg.content || "" }] };
  });

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

// ─── Multimodal Content Part Converters ──────────────────────────────────────

/**
 * Convert generic content parts to OpenAI format.
 * OpenAI supports: { type: "text", text }, { type: "image_url", image_url: { url, detail } }
 * PDFs and other files: extract data and send as image_url for vision models, or as text fallback.
 */
function convertPartsForOpenAI(parts) {
  return parts.map(p => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image_url") return { type: "image_url", image_url: { url: p.image_url.url, detail: p.image_url.detail || "auto" } };
    if (p.type === "file") {
      // OpenAI file input: use the input_file format for PDFs/documents
      const dataUrl = p.file.data;
      // If it's a data URL with a PDF mimetype, send as file input
      if (dataUrl && dataUrl.startsWith("data:application/pdf")) {
        return { type: "file", file: { filename: p.file.filename, file_data: dataUrl } };
      }
      // Fallback: treat as text
      return { type: "text", text: `[File: ${p.file.filename}]\n${dataUrl}` };
    }
    return p;
  });
}

/**
 * Convert generic content parts to Anthropic format.
 * Anthropic supports: { type: "text", text }, { type: "image", source: { type, media_type, data } },
 * and { type: "document", source: { type: "base64", media_type, data } } for PDFs.
 */
function convertPartsForAnthropic(parts) {
  return parts.map(p => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image_url") {
      const url = p.image_url.url;
      // If it's a data URL, extract the base64 and media type
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
        }
      }
      // URL-based image
      return { type: "image", source: { type: "url", url } };
    }
    if (p.type === "file") {
      const dataUrl = p.file.data;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          // Anthropic supports PDFs as document type
          if (match[1] === "application/pdf") {
            return { type: "document", source: { type: "base64", media_type: match[1], data: match[2] } };
          }
          return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
        }
      }
      return { type: "text", text: `[File: ${p.file.filename}]\n${dataUrl}` };
    }
    return p;
  });
}

/**
 * Convert generic content parts to Gemini format.
 * Gemini supports: { text }, { inlineData: { mimeType, data } }
 */
function convertPartsForGemini(parts) {
  return parts.map(p => {
    if (p.type === "text") return { text: p.text };
    if (p.type === "image_url") {
      const url = p.image_url.url;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      // Gemini also supports fileData with URL but we'll use inlineData
      return { text: `[Image: ${url}]` };
    }
    if (p.type === "file") {
      const dataUrl = p.file.data;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      return { text: `[File: ${p.file.filename}]\n${dataUrl}` };
    }
    return { text: JSON.stringify(p) };
  });
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
        // Tool call deltas (OpenAI streams tool calls incrementally)
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield { type: "tool_call_delta", index: tc.index, id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments };
          }
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
          case "content_block_start":
            // Anthropic sends content_block_start for tool_use blocks
            if (data.content_block?.type === "tool_use") {
              yield {
                type: "tool_call_start",
                index: data.index,
                id: data.content_block.id,
                name: data.content_block.name,
              };
            }
            break;
          case "content_block_delta":
            if (data.delta?.type === "text_delta" && data.delta.text) {
              yield { type: "delta", text: data.delta.text };
            }
            // Tool input JSON deltas
            if (data.delta?.type === "input_json_delta" && data.delta.partial_json) {
              yield { type: "tool_call_delta", index: data.index, arguments: data.delta.partial_json };
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
            // Gemini function calls come as complete objects in stream chunks
            if (part.functionCall) {
              yield {
                type: "tool_call_complete",
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              };
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

// ─── MCP Tool-Use Transforms ────────────────────────────────────────────────

/**
 * Convert MCP tool definitions to the provider-specific wire format.
 * @param {string} provider  Provider ID
 * @param {Array} mcpTools   Tools from mcpManager.getAllTools()
 * @returns {object}  Provider-specific tool fields to merge into the request body
 */
function toolsToProviderFormat(provider, mcpTools) {
  if (!mcpTools || mcpTools.length === 0) return {};
  const entry = PROVIDERS[provider];

  if (entry.transform === "anthropic") {
    return {
      tools: mcpTools.map(t => ({
        name: t.name,
        description: t.description || "",
        input_schema: t.inputSchema || { type: "object", properties: {} },
      })),
    };
  }

  if (entry.transform === "google") {
    return {
      tools: [{
        functionDeclarations: mcpTools.map(t => ({
          name: t.name,
          description: t.description || "",
          parameters: t.inputSchema || { type: "object", properties: {} },
        })),
      }],
    };
  }

  // OpenAI-compatible
  return {
    tools: mcpTools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.inputSchema || { type: "object", properties: {} },
      },
    })),
  };
}

/**
 * Parse tool calls from a non-streaming provider response.
 * @param {string} provider  Provider ID
 * @param {object} data      Raw response JSON
 * @returns {Array|null}  Array of {id, name, arguments} or null if no tool calls
 */
function parseToolCalls(provider, data) {
  const entry = PROVIDERS[provider];

  if (entry.transform === "anthropic") {
    const content = data.content || [];
    const toolUseBlocks = content.filter(b => b.type === "tool_use");
    if (toolUseBlocks.length === 0) return null;
    return toolUseBlocks.map(b => ({
      id: b.id,
      name: b.name,
      arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input),
    }));
  }

  if (entry.transform === "google") {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const funcCalls = parts.filter(p => p.functionCall);
    if (funcCalls.length === 0) return null;
    return funcCalls.map((p, i) => ({
      id: `gemini_call_${i}`,
      name: p.functionCall.name,
      arguments: typeof p.functionCall.args === "string"
        ? p.functionCall.args
        : JSON.stringify(p.functionCall.args || {}),
    }));
  }

  // OpenAI-compatible
  const toolCalls = data.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) return null;
  return toolCalls.map(tc => ({
    id: tc.id,
    name: tc.function?.name || tc.name,
    arguments: typeof tc.function?.arguments === "object"
      ? JSON.stringify(tc.function.arguments)
      : (tc.function?.arguments || "{}"),
  }));
}

/**
 * Parse tool calls from a streaming response.
 * For streaming, tool calls are accumulated from deltas.
 * Returns the same format as parseToolCalls.
 */
function parseStreamingToolCalls(provider, accumulated) {
  // `accumulated` is the full set of accumulated tool_calls from stream deltas
  // Already normalized by the streaming parsers below
  if (!accumulated || accumulated.length === 0) return null;
  return accumulated;
}

/**
 * Build messages to send tool results back to the LLM.
 * @param {string} provider     Provider ID
 * @param {Array} toolCalls     The tool calls [{id, name, arguments}]
 * @param {Array} toolResults   The results [{callId, name, content, isError}]
 * @returns {Array}  Messages to append to the conversation
 */
function buildToolResultMessages(provider, toolCalls, toolResults) {
  const entry = PROVIDERS[provider];

  if (entry.transform === "anthropic") {
    // Anthropic: assistant message with tool_use blocks, then user message with tool_result blocks
    const assistantContent = toolCalls.map(tc => ({
      type: "tool_use",
      id: tc.id,
      name: tc.name,
      input: safeParseJSON(tc.arguments),
    }));

    const userContent = toolResults.map(tr => ({
      type: "tool_result",
      tool_use_id: tr.callId,
      content: tr.content,
      is_error: tr.isError || false,
    }));

    return [
      { role: "assistant", content: assistantContent },
      { role: "user", content: userContent },
    ];
  }

  if (entry.transform === "google") {
    // Gemini: model message with functionCall parts, then user message with functionResponse parts
    const modelParts = toolCalls.map(tc => ({
      functionCall: {
        name: tc.name,
        args: safeParseJSON(tc.arguments),
      },
    }));

    const userParts = toolResults.map(tr => ({
      functionResponse: {
        name: tr.name,
        response: { result: tr.content },
      },
    }));

    return [
      { role: "assistant", content: modelParts, _isGeminiToolCall: true },
      { role: "user", content: userParts, _isGeminiToolResult: true },
    ];
  }

  // OpenAI-compatible: assistant message with tool_calls, then one tool message per result
  const assistantMsg = {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map(tc => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    })),
  };

  const toolMsgs = toolResults.map(tr => ({
    role: "tool",
    tool_call_id: tr.callId,
    content: tr.content,
  }));

  return [assistantMsg, ...toolMsgs];
}

/** Safely parse a JSON string; return the original value if already an object. */
function safeParseJSON(str) {
  if (typeof str !== "string") return str;
  try { return JSON.parse(str); } catch { return str; }
}

/**
 * Extract text content from an MCP tool result.
 * @param {object} result  { content: [...], isError?: boolean }
 * @returns {string}
 */
function mcpResultToText(result) {
  if (!result || !result.content) return "";
  return result.content
    .map(c => {
      if (c.type === "text") return c.text;
      if (c.type === "image") return "[image]";
      if (c.type === "resource") return c.resource?.text || "[resource]";
      return JSON.stringify(c);
    })
    .join("\n");
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
