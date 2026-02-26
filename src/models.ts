// AgentLoop — Model Catalog & Discovery
//
// Single source of truth: src/catalog.json
// Both the SDK and the WebUI read from the same catalog data.

import type { ModelCategory, ModelInfo, ProviderId, ProviderInfo } from "./types.js";
import catalogData from "./catalog.json" with { type: "json" };

// ─── Provider Directory ────────────────────────────────────────────────────

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = Object.fromEntries(
  Object.entries(catalogData.providers).map(([id, p]) => [
    id,
    { id: id as ProviderId, name: p.name, apiKeyEnv: p.apiKeyEnv, website: p.website },
  ]),
) as Record<ProviderId, ProviderInfo>;

// ─── Model Catalog ─────────────────────────────────────────────────────────

/** Full catalog including all modalities (chat, image, audio, embedding). */
export const FULL_MODEL_CATALOG: ModelInfo[] = catalogData.models as ModelInfo[];

/** Chat-only models — the default catalog for SDK consumers. */
export const MODEL_CATALOG: ModelInfo[] = FULL_MODEL_CATALOG.filter(
  m => !("modality" in m),
);

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
