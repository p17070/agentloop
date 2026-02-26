#!/usr/bin/env node
/**
 * Generates webui/catalog.generated.js from src/catalog.json.
 *
 * This keeps the WebUI in sync with the SDK's single source of truth
 * without requiring a build step or module bundler for the browser code.
 *
 * Run: node scripts/sync-webui-catalog.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const catalog = JSON.parse(readFileSync(join(root, "src/catalog.json"), "utf8"));

// Map field names for webui compat: contextWindow -> ctx, maxOutputTokens -> maxOut
const models = catalog.models.map((m) => {
  const out = {
    id: m.id,
    name: m.name,
    provider: m.provider,
    categories: m.categories,
  };
  if (m.contextWindow) out.ctx = m.contextWindow;
  if (m.maxOutputTokens) out.maxOut = m.maxOutputTokens;
  if (m.isDefault) out.isDefault = true;
  if (m.deprecated) out.deprecated = true;
  if (m.modality) out.modality = m.modality;
  return out;
});

const js = `// AUTO-GENERATED from src/catalog.json — do not edit directly.
// Run: node scripts/sync-webui-catalog.mjs
//
// This file is the bridge between the SDK's single source of truth (src/catalog.json)
// and the browser-based WebUI. Both the main chat UI and the A/B arena load this file.

/* eslint-disable */
const CATALOG_PROVIDERS = ${JSON.stringify(catalog.providers, null, 2)};

const CATALOG_MODELS = ${JSON.stringify(models, null, 2)};
`;

writeFileSync(join(root, "webui/catalog.generated.js"), js);

const providerCount = Object.keys(catalog.providers).length;
const modelCount = models.length;
console.log(
  `sync-webui-catalog: wrote webui/catalog.generated.js (${providerCount} providers, ${modelCount} models)`,
);
