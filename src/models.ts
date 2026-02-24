// AgentLoop — Model Catalog & Discovery
//
// Comprehensive catalog of models across all supported providers.
// Provides typed model info, discovery helpers, and provider metadata.

import type { ModelCategory, ModelInfo, ProviderId, ProviderInfo } from "./types.js";

// ─── Provider Directory ────────────────────────────────────────────────────

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    website: "https://platform.openai.com",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    website: "https://console.anthropic.com",
  },
  google: {
    id: "google",
    name: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    website: "https://ai.google.dev",
  },
  groq: {
    id: "groq",
    name: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    website: "https://console.groq.com",
  },
  together: {
    id: "together",
    name: "Together AI",
    apiKeyEnv: "TOGETHER_API_KEY",
    website: "https://www.together.ai",
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    apiKeyEnv: "MISTRAL_API_KEY",
    website: "https://console.mistral.ai",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    website: "https://platform.deepseek.com",
  },
  fireworks: {
    id: "fireworks",
    name: "Fireworks AI",
    apiKeyEnv: "FIREWORKS_API_KEY",
    website: "https://fireworks.ai",
  },
  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    apiKeyEnv: "PERPLEXITY_API_KEY",
    website: "https://www.perplexity.ai",
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    apiKeyEnv: "OLLAMA_API_KEY",
    website: "https://ollama.com",
  },
  cohere: {
    id: "cohere",
    name: "Cohere",
    apiKeyEnv: "COHERE_API_KEY",
    website: "https://dashboard.cohere.com",
  },
  xai: {
    id: "xai",
    name: "xAI",
    apiKeyEnv: "XAI_API_KEY",
    website: "https://x.ai",
  },
};

// ─── Model Catalog ─────────────────────────────────────────────────────────

export const MODEL_CATALOG: ModelInfo[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────

  // GPT-5 series
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai", categories: ["flagship"], contextWindow: 128_000, maxOutputTokens: 16_384, isDefault: true },
  { id: "gpt-5", name: "GPT-5", provider: "openai", categories: ["flagship"], contextWindow: 128_000, maxOutputTokens: 16_384 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai", categories: ["fast"], contextWindow: 128_000, maxOutputTokens: 16_384 },

  // GPT-4.1 series
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", categories: ["flagship", "code"], contextWindow: 1_000_000, maxOutputTokens: 32_768 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", categories: ["fast"], contextWindow: 1_000_000, maxOutputTokens: 32_768 },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai", categories: ["fast"], contextWindow: 1_000_000, maxOutputTokens: 32_768 },

  // o-series reasoning
  { id: "o4-mini", name: "o4-mini", provider: "openai", categories: ["reasoning"], contextWindow: 200_000, maxOutputTokens: 100_000 },
  { id: "o3", name: "o3", provider: "openai", categories: ["reasoning"], contextWindow: 200_000, maxOutputTokens: 100_000 },
  { id: "o3-pro", name: "o3 Pro", provider: "openai", categories: ["reasoning"], contextWindow: 200_000, maxOutputTokens: 100_000 },
  { id: "o3-mini", name: "o3 Mini", provider: "openai", categories: ["reasoning", "fast"], contextWindow: 200_000, maxOutputTokens: 100_000 },
  { id: "o1", name: "o1", provider: "openai", categories: ["reasoning"], contextWindow: 200_000, maxOutputTokens: 100_000 },

  // GPT-4o series
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", categories: ["flagship", "vision"], contextWindow: 128_000, maxOutputTokens: 16_384 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", categories: ["fast", "vision"], contextWindow: 128_000, maxOutputTokens: 16_384 },
  { id: "gpt-4o-search-preview", name: "GPT-4o Search", provider: "openai", categories: ["search"], contextWindow: 128_000, maxOutputTokens: 16_384 },

  // ── Anthropic ───────────────────────────────────────────────────────────

  // Claude 4.6
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", categories: ["flagship", "code", "reasoning"], contextWindow: 200_000, maxOutputTokens: 128_000 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", categories: ["flagship", "code"], contextWindow: 200_000, maxOutputTokens: 64_000, isDefault: true },

  // Claude 4.5
  { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5", provider: "anthropic", categories: ["flagship", "code"], contextWindow: 200_000, maxOutputTokens: 32_000 },
  { id: "claude-sonnet-4-5-20241022", name: "Claude Sonnet 4.5", provider: "anthropic", categories: ["flagship", "code"], contextWindow: 200_000, maxOutputTokens: 16_000 },

  // Claude 4 / 4.1
  { id: "claude-opus-4-1-20250630", name: "Claude Opus 4.1", provider: "anthropic", categories: ["flagship", "code"], contextWindow: 200_000, maxOutputTokens: 32_000 },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", categories: ["flagship", "code"], contextWindow: 200_000, maxOutputTokens: 16_000 },

  // Claude 3.5 Haiku
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", categories: ["fast"], contextWindow: 200_000, maxOutputTokens: 8_192 },

  // ── Google Gemini ───────────────────────────────────────────────────────

  // Gemini 3.x (preview)
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)", provider: "google", categories: ["flagship", "reasoning", "code"], contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", provider: "google", categories: ["fast", "reasoning", "vision"], contextWindow: 1_000_000, maxOutputTokens: 65_536 },

  // Gemini 2.5 (stable / GA)
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", categories: ["flagship", "reasoning", "code"], contextWindow: 1_000_000, maxOutputTokens: 65_536, isDefault: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", categories: ["fast", "reasoning"], contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google", categories: ["fast"], contextWindow: 1_000_000, maxOutputTokens: 65_536 },

  // Gemini 2.0
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google", categories: ["fast", "vision"], contextWindow: 1_000_000, maxOutputTokens: 8_192, deprecated: true },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "google", categories: ["fast"], contextWindow: 1_000_000, maxOutputTokens: 8_192, deprecated: true },

  // ── Groq ────────────────────────────────────────────────────────────────

  // Llama 4
  { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick", provider: "groq", categories: ["flagship", "vision"], contextWindow: 128_000 },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", provider: "groq", categories: ["fast", "vision"], contextWindow: 128_000, isDefault: true },

  // Llama 3.x
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "groq", categories: ["flagship"], contextWindow: 128_000 },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", provider: "groq", categories: ["fast"], contextWindow: 128_000 },

  // Qwen
  { id: "qwen/qwen-3-32b", name: "Qwen 3 32B", provider: "groq", categories: ["flagship", "reasoning"], contextWindow: 128_000 },

  // DeepSeek on Groq
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", provider: "groq", categories: ["reasoning"], contextWindow: 128_000 },

  // OpenAI open-weight on Groq
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", provider: "groq", categories: ["flagship"], contextWindow: 128_000 },

  // ── Together AI ─────────────────────────────────────────────────────────

  // DeepSeek on Together
  { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", provider: "together", categories: ["reasoning"], contextWindow: 128_000 },
  { id: "deepseek-ai/DeepSeek-V3.1", name: "DeepSeek V3.1", provider: "together", categories: ["flagship"], contextWindow: 128_000 },
  { id: "DeepSeek-AI/DeepSeek-V3-2-Exp", name: "DeepSeek V3.2 Exp", provider: "together", categories: ["flagship"], contextWindow: 128_000 },

  // Llama on Together
  { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", name: "Llama 4 Maverick", provider: "together", categories: ["flagship"], contextWindow: 128_000 },
  { id: "meta-llama/Llama-4-Scout-17B-16E-Instruct", name: "Llama 4 Scout", provider: "together", categories: ["fast"], contextWindow: 128_000 },
  { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", provider: "together", categories: ["flagship"], contextWindow: 128_000, isDefault: true },
  { id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", name: "Llama 3.1 405B Turbo", provider: "together", categories: ["flagship"], contextWindow: 128_000 },
  { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", name: "Llama 3.1 8B Turbo", provider: "together", categories: ["fast"], contextWindow: 128_000 },

  // Qwen on Together
  { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B Turbo", provider: "together", categories: ["flagship"], contextWindow: 128_000 },
  { id: "Qwen/QwQ-32B", name: "Qwen QwQ 32B", provider: "together", categories: ["reasoning"], contextWindow: 128_000 },
  { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "Qwen 2.5 Coder 32B", provider: "together", categories: ["code"], contextWindow: 128_000 },

  // Mistral on Together
  { id: "mistralai/Mistral-Small-24B-Instruct-2501", name: "Mistral Small 3", provider: "together", categories: ["fast"], contextWindow: 32_000 },

  // ── Mistral AI ──────────────────────────────────────────────────────────

  // Large
  { id: "mistral-large-latest", name: "Mistral Large 3", provider: "mistral", categories: ["flagship"], contextWindow: 128_000, isDefault: true },

  // Medium
  { id: "mistral-medium-latest", name: "Mistral Medium 3", provider: "mistral", categories: ["flagship"], contextWindow: 128_000 },

  // Small
  { id: "mistral-small-latest", name: "Mistral Small 3.2", provider: "mistral", categories: ["fast"], contextWindow: 128_000 },

  // Reasoning (Magistral)
  { id: "magistral-medium-latest", name: "Magistral Medium", provider: "mistral", categories: ["reasoning"], contextWindow: 128_000 },
  { id: "magistral-small-latest", name: "Magistral Small", provider: "mistral", categories: ["reasoning", "fast"], contextWindow: 128_000 },

  // Code
  { id: "codestral-latest", name: "Codestral", provider: "mistral", categories: ["code"], contextWindow: 256_000 },
  { id: "devstral-medium-latest", name: "Devstral Medium", provider: "mistral", categories: ["code"], contextWindow: 256_000 },

  // Vision
  { id: "pixtral-large-latest", name: "Pixtral Large", provider: "mistral", categories: ["vision", "flagship"], contextWindow: 128_000 },

  // Edge
  { id: "ministral-8b-latest", name: "Ministral 8B", provider: "mistral", categories: ["fast"], contextWindow: 128_000 },
  { id: "ministral-3b-latest", name: "Ministral 3B", provider: "mistral", categories: ["fast"], contextWindow: 128_000 },

  // ── DeepSeek ────────────────────────────────────────────────────────────

  { id: "deepseek-chat", name: "DeepSeek V3.2 Chat", provider: "deepseek", categories: ["flagship", "code"], contextWindow: 128_000, maxOutputTokens: 8_192, isDefault: true },
  { id: "deepseek-reasoner", name: "DeepSeek V3.2 Reasoner", provider: "deepseek", categories: ["reasoning"], contextWindow: 128_000, maxOutputTokens: 8_192 },

  // ── Fireworks AI ────────────────────────────────────────────────────────

  // DeepSeek on Fireworks
  { id: "accounts/fireworks/models/deepseek-v3p2", name: "DeepSeek V3.2", provider: "fireworks", categories: ["flagship"], contextWindow: 160_000, isDefault: true },
  { id: "accounts/fireworks/models/deepseek-r1-0528", name: "DeepSeek R1", provider: "fireworks", categories: ["reasoning"], contextWindow: 160_000 },

  // Llama on Fireworks
  { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B", provider: "fireworks", categories: ["flagship"], contextWindow: 128_000 },
  { id: "accounts/fireworks/models/llama-v3p1-8b-instruct", name: "Llama 3.1 8B", provider: "fireworks", categories: ["fast"], contextWindow: 128_000 },

  // Qwen on Fireworks
  { id: "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct", name: "Qwen3 Coder 480B", provider: "fireworks", categories: ["code"], contextWindow: 256_000 },

  // ── Perplexity ──────────────────────────────────────────────────────────

  { id: "sonar-pro", name: "Sonar Pro", provider: "perplexity", categories: ["search", "flagship"], contextWindow: 200_000, isDefault: true },
  { id: "sonar", name: "Sonar", provider: "perplexity", categories: ["search", "fast"], contextWindow: 128_000 },
  { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "perplexity", categories: ["search", "reasoning"], contextWindow: 128_000 },
  { id: "sonar-reasoning", name: "Sonar Reasoning", provider: "perplexity", categories: ["search", "reasoning"], contextWindow: 128_000 },
  { id: "sonar-deep-research", name: "Sonar Deep Research", provider: "perplexity", categories: ["search", "reasoning"], contextWindow: 128_000 },

  // ── Cohere ──────────────────────────────────────────────────────────────

  { id: "command-a-03-2025", name: "Command A", provider: "cohere", categories: ["flagship"], contextWindow: 256_000, isDefault: true },
  { id: "command-r-plus-08-2024", name: "Command R+", provider: "cohere", categories: ["flagship"], contextWindow: 128_000 },
  { id: "command-r-08-2024", name: "Command R", provider: "cohere", categories: ["fast"], contextWindow: 128_000 },
  { id: "c4ai-command-r7b-12-2024", name: "Command R7B", provider: "cohere", categories: ["fast"], contextWindow: 128_000 },

  // ── xAI (Grok) ─────────────────────────────────────────────────────────

  // Grok 4
  { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 Fast Reasoning", provider: "xai", categories: ["flagship", "reasoning"], contextWindow: 2_000_000 },
  { id: "grok-4-1-fast-non-reasoning", name: "Grok 4.1 Fast", provider: "xai", categories: ["flagship", "fast"], contextWindow: 2_000_000, isDefault: true },

  // Grok 4 (always-reasoning)
  { id: "grok-4", name: "Grok 4", provider: "xai", categories: ["flagship", "reasoning"], contextWindow: 256_000 },

  // Grok 3
  { id: "grok-3-beta", name: "Grok 3", provider: "xai", categories: ["flagship"], contextWindow: 131_000 },
  { id: "grok-3-mini-beta", name: "Grok 3 Mini", provider: "xai", categories: ["fast", "reasoning"], contextWindow: 131_000 },
  { id: "grok-3-fast-beta", name: "Grok 3 Fast", provider: "xai", categories: ["fast"], contextWindow: 131_000 },

  // Grok 2 (legacy)
  { id: "grok-2-1212", name: "Grok 2", provider: "xai", categories: ["flagship"], contextWindow: 131_000 },
  { id: "grok-2-vision-1212", name: "Grok 2 Vision", provider: "xai", categories: ["vision"], contextWindow: 131_000 },

  // Code
  { id: "grok-code-fast-1", name: "Grok Code", provider: "xai", categories: ["code"], contextWindow: 256_000 },

  // ── Ollama (local) ──────────────────────────────────────────────────────

  { id: "llama4:scout", name: "Llama 4 Scout", provider: "ollama", categories: ["flagship", "vision"], contextWindow: 128_000, isDefault: true },
  { id: "llama4:maverick", name: "Llama 4 Maverick", provider: "ollama", categories: ["flagship"], contextWindow: 128_000 },
  { id: "llama3.3", name: "Llama 3.3 70B", provider: "ollama", categories: ["flagship"], contextWindow: 128_000 },
  { id: "llama3.2", name: "Llama 3.2 3B", provider: "ollama", categories: ["fast"], contextWindow: 128_000 },
  { id: "qwen3", name: "Qwen 3", provider: "ollama", categories: ["flagship", "reasoning"], contextWindow: 128_000 },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "ollama", categories: ["reasoning"], contextWindow: 128_000 },
  { id: "mistral", name: "Mistral 7B", provider: "ollama", categories: ["fast"], contextWindow: 32_000 },
  { id: "codellama", name: "Code Llama", provider: "ollama", categories: ["code"], contextWindow: 16_000 },
  { id: "gemma3", name: "Gemma 3", provider: "ollama", categories: ["fast"], contextWindow: 128_000 },
  { id: "phi4", name: "Phi-4", provider: "ollama", categories: ["fast", "reasoning"], contextWindow: 16_000 },
];

// ─── Discovery Helpers ─────────────────────────────────────────────────────

/** Returns all providers with their metadata. */
export function listProviders(): ProviderInfo[] {
  return Object.values(PROVIDER_INFO);
}

/** Returns metadata for a specific provider, or undefined if not found. */
export function getProvider(id: ProviderId): ProviderInfo | undefined {
  return PROVIDER_INFO[id];
}

/** Returns all models in the catalog. */
export function listModels(): ModelInfo[] {
  return MODEL_CATALOG;
}

/** Returns all models for a specific provider. */
export function listModelsByProvider(provider: ProviderId): ModelInfo[] {
  return MODEL_CATALOG.filter(m => m.provider === provider);
}

/** Returns all models matching a specific category. */
export function listModelsByCategory(category: ModelCategory): ModelInfo[] {
  return MODEL_CATALOG.filter(m => m.categories.includes(category));
}

/** Returns the default/recommended model for a provider, or undefined. */
export function getDefaultModel(provider: ProviderId): ModelInfo | undefined {
  return MODEL_CATALOG.find(m => m.provider === provider && m.isDefault);
}

/**
 * Resolves a model string to its ModelInfo.
 * Accepts either a bare model ID ("gpt-4o") or a qualified "provider/model" string.
 * Returns undefined if no match is found.
 */
export function resolveModel(model: string): ModelInfo | undefined {
  const slashIdx = model.indexOf("/");

  // Qualified: "provider/model-id"
  if (slashIdx > 0) {
    const provider = model.slice(0, slashIdx) as ProviderId;
    const modelId = model.slice(slashIdx + 1);
    return MODEL_CATALOG.find(m => m.provider === provider && m.id === modelId);
  }

  // Bare model ID — search all providers (first match wins)
  return MODEL_CATALOG.find(m => m.id === model);
}

/**
 * Builds the full qualified model string ("provider/model-id") from a ModelInfo.
 */
export function qualifiedModelId(model: ModelInfo): string {
  return `${model.provider}/${model.id}`;
}

/**
 * Returns a grouped view: provider → models, useful for building selection UIs.
 * Only includes providers that have at least one model in the catalog.
 */
export function modelsByProvider(): Map<ProviderInfo, ModelInfo[]> {
  const result = new Map<ProviderInfo, ModelInfo[]>();
  for (const provider of Object.values(PROVIDER_INFO)) {
    const models = listModelsByProvider(provider.id);
    if (models.length > 0) {
      result.set(provider, models);
    }
  }
  return result;
}

/**
 * Returns a flat list of suggestions — one default model per provider.
 * Useful for quick-start UIs or CLI prompts.
 */
export function suggestedModels(): ModelInfo[] {
  return Object.keys(PROVIDER_INFO)
    .map(id => getDefaultModel(id as ProviderId))
    .filter((m): m is ModelInfo => m != null);
}

/**
 * Searches the model catalog by name or ID (case-insensitive substring match).
 */
export function searchModels(query: string): ModelInfo[] {
  const q = query.toLowerCase();
  return MODEL_CATALOG.filter(
    m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
  );
}
