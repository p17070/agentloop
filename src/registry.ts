// AgentLoop — Provider Registry & Parameter Filtering

import type { ChatRequest, ProviderEntry, ProviderOverrides } from "./types.js";

// ─── Provider Table ─────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, ProviderEntry> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    auth: "bearer",
  },

  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    auth: "bearer",
    strip: ["frequency_penalty", "presence_penalty", "logprobs", "top_logprobs", "logit_bias"],
    clamp: { n: 1 },
  },

  together: {
    baseURL: "https://api.together.xyz/v1",
    auth: "bearer",
  },

  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    auth: "bearer",
    rename: { seed: "random_seed" },
    clamp: { temperature: [0, 1] },
  },

  deepseek: {
    baseURL: "https://api.deepseek.com",
    auth: "bearer",
    strip: ["n", "seed", "user", "logit_bias"],
  },

  fireworks: {
    baseURL: "https://api.fireworks.ai/inference/v1",
    auth: "bearer",
  },

  perplexity: {
    baseURL: "https://api.perplexity.ai",
    auth: "bearer",
    strip: [
      "tools", "tool_choice", "parallel_tool_calls", "frequency_penalty",
      "presence_penalty", "logprobs", "top_logprobs", "logit_bias",
      "seed", "n", "user",
    ],
  },

  ollama: {
    baseURL: "http://localhost:11434/v1",
    auth: "none",
    strip: ["tool_choice", "logprobs", "top_logprobs", "logit_bias", "n", "user"],
  },

  cohere: {
    baseURL: "https://api.cohere.ai/compatibility/v1",
    auth: "bearer",
    strip: ["logit_bias", "top_logprobs", "n", "user", "parallel_tool_calls"],
    clamp: { temperature: [0, 1] },
  },

  anthropic: {
    baseURL: "https://api.anthropic.com/v1",
    auth: "x-api-key",
    transform: "anthropic",
    headers: { "anthropic-version": "2023-06-01" },
    defaults: { max_tokens: 4096 },
  },

  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    auth: "x-goog-api-key",
    transform: "google",
  },

  xai: {
    baseURL: "https://api.x.ai/v1",
    auth: "bearer",
  },

  moonshot: {
    baseURL: "https://api.moonshot.ai/v1",
    auth: "bearer",
  },

  cerebras: {
    baseURL: "https://api.cerebras.ai/v1",
    auth: "bearer",
  },

  sambanova: {
    baseURL: "https://api.sambanova.ai/v1",
    auth: "bearer",
  },

  ai21: {
    baseURL: "https://api.ai21.com/studio/v1",
    auth: "bearer",
  },
};

// ─── Parameter Filter ───────────────────────────────────────────────────────

/**
 * Filters a ChatRequest for an OpenAI-compatible provider.
 * Applies strip/rename/clamp/defaults from the provider config.
 * Returns a plain object ready to JSON.stringify for the request body.
 */
export function filterParams(request: ChatRequest, entry: ProviderEntry): Record<string, unknown> {
  const body: Record<string, unknown> = { ...request };
  delete body.model;      // handled separately by caller
  delete body.metadata;   // internal — not sent to providers

  // Strip unsupported params
  for (const key of entry.strip ?? []) {
    delete body[key];
  }

  // Rename params (e.g., seed → random_seed for Mistral)
  for (const [from, to] of Object.entries(entry.rename ?? {})) {
    if (from in body) {
      body[to] = body[from];
      delete body[from];
    }
  }

  // Clamp values
  for (const [key, constraint] of Object.entries(entry.clamp ?? {})) {
    if (key in body && body[key] != null) {
      if (typeof constraint === "number") {
        // Force value (e.g., n: 1 for Groq)
        body[key] = constraint;
      } else if (Array.isArray(constraint)) {
        const [min, max] = constraint;
        body[key] = Math.min(Math.max(body[key] as number, min), max);
      }
    }
  }

  // Inject defaults
  for (const [key, value] of Object.entries(entry.defaults ?? {})) {
    if (!(key in body) || body[key] == null) {
      body[key] = value;
    }
  }

  return body;
}

// ─── Header Builder ─────────────────────────────────────────────────────────

/**
 * Builds request headers for a provider.
 * Provider-level headers are applied first, then overrides on top (so overrides win).
 */
export function buildHeaders(
  entry: ProviderEntry,
  apiKey: string,
  overrides?: ProviderOverrides,
): Record<string, string> {
  const effectiveKey = overrides?.apiKey ?? apiKey;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  switch (entry.auth) {
    case "bearer":
      headers["authorization"] = `Bearer ${effectiveKey}`;
      break;
    case "x-api-key":
      headers["x-api-key"] = effectiveKey;
      break;
    case "x-goog-api-key":
      headers["x-goog-api-key"] = effectiveKey;
      break;
    case "none":
      break;
  }

  // Merge provider-level headers (e.g., anthropic-version)
  Object.assign(headers, entry.headers ?? {});

  // Merge user-supplied override headers last (highest priority)
  if (overrides?.headers) {
    Object.assign(headers, overrides.headers);
  }

  return headers;
}

// ─── Provider Resolution ───────────────────────────────────────────────────

/**
 * Resolves a provider by name, applying user overrides on top of built-in config.
 * Returns a ProviderEntry with baseURL/headers merged from overrides.
 * Throws if the provider name is unknown and no overrides supply a baseURL.
 */
export function resolveProvider(
  name: string,
  overrides?: ProviderOverrides,
): ProviderEntry {
  const builtin = PROVIDERS[name];

  if (!builtin && !overrides?.baseURL) {
    throw new Error(
      `Unknown provider "${name}". Pass a baseURL in overrides or register it first.`,
    );
  }

  if (!builtin) {
    // Fully custom provider — caller must supply baseURL
    return {
      baseURL: overrides!.baseURL!,
      auth: "bearer",
      headers: overrides?.headers,
    };
  }

  if (!overrides) return builtin;

  // Merge overrides on top of built-in config
  return {
    ...builtin,
    ...(overrides.baseURL ? { baseURL: overrides.baseURL } : {}),
    headers: {
      ...builtin.headers,
      ...overrides.headers,
    },
  };
}

/**
 * Registers a custom provider (or replaces an existing one) in the global registry.
 *
 * Useful for adding self-hosted / proxy providers at startup:
 * ```ts
 * registerProvider("azure", {
 *   baseURL: "https://my-instance.openai.azure.com/openai/deployments/gpt-4o/",
 *   auth: "bearer",
 *   headers: { "api-version": "2024-08-01-preview" },
 * });
 * ```
 */
export function registerProvider(name: string, entry: ProviderEntry): void {
  PROVIDERS[name] = entry;
}
