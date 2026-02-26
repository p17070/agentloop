// AUTO-GENERATED from src/catalog.json — do not edit directly.
// Run: node scripts/sync-webui-catalog.mjs
//
// This file is the bridge between the SDK's single source of truth (src/catalog.json)
// and the browser-based WebUI. Both the main chat UI and the A/B arena load this file.

/* eslint-disable */
const CATALOG_PROVIDERS = {
  "openai": {
    "name": "OpenAI",
    "apiKeyEnv": "OPENAI_API_KEY",
    "website": "https://platform.openai.com"
  },
  "anthropic": {
    "name": "Anthropic",
    "apiKeyEnv": "ANTHROPIC_API_KEY",
    "website": "https://console.anthropic.com"
  },
  "google": {
    "name": "Google Gemini",
    "apiKeyEnv": "GEMINI_API_KEY",
    "website": "https://ai.google.dev"
  },
  "groq": {
    "name": "Groq",
    "apiKeyEnv": "GROQ_API_KEY",
    "website": "https://console.groq.com"
  },
  "together": {
    "name": "Together AI",
    "apiKeyEnv": "TOGETHER_API_KEY",
    "website": "https://www.together.ai"
  },
  "mistral": {
    "name": "Mistral AI",
    "apiKeyEnv": "MISTRAL_API_KEY",
    "website": "https://console.mistral.ai"
  },
  "deepseek": {
    "name": "DeepSeek",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "website": "https://platform.deepseek.com"
  },
  "fireworks": {
    "name": "Fireworks AI",
    "apiKeyEnv": "FIREWORKS_API_KEY",
    "website": "https://fireworks.ai"
  },
  "perplexity": {
    "name": "Perplexity",
    "apiKeyEnv": "PERPLEXITY_API_KEY",
    "website": "https://www.perplexity.ai"
  },
  "ollama": {
    "name": "Ollama",
    "apiKeyEnv": "OLLAMA_API_KEY",
    "website": "https://ollama.com"
  },
  "cohere": {
    "name": "Cohere",
    "apiKeyEnv": "COHERE_API_KEY",
    "website": "https://dashboard.cohere.com"
  },
  "xai": {
    "name": "xAI",
    "apiKeyEnv": "XAI_API_KEY",
    "website": "https://x.ai"
  },
  "moonshot": {
    "name": "Moonshot AI",
    "apiKeyEnv": "MOONSHOT_API_KEY",
    "website": "https://platform.moonshot.ai"
  },
  "cerebras": {
    "name": "Cerebras",
    "apiKeyEnv": "CEREBRAS_API_KEY",
    "website": "https://cerebras.ai"
  },
  "sambanova": {
    "name": "SambaNova",
    "apiKeyEnv": "SAMBANOVA_API_KEY",
    "website": "https://sambanova.ai"
  },
  "ai21": {
    "name": "AI21 Labs",
    "apiKeyEnv": "AI21_API_KEY",
    "website": "https://www.ai21.com"
  }
};

const CATALOG_MODELS = [
  {
    "id": "gpt-5.2",
    "name": "GPT-5.2",
    "provider": "openai",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "maxOut": 16384,
    "isDefault": true
  },
  {
    "id": "gpt-5",
    "name": "GPT-5",
    "provider": "openai",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "maxOut": 16384
  },
  {
    "id": "gpt-5-mini",
    "name": "GPT-5 Mini",
    "provider": "openai",
    "categories": [
      "fast"
    ],
    "ctx": 128000,
    "maxOut": 16384
  },
  {
    "id": "gpt-4.1",
    "name": "GPT-4.1",
    "provider": "openai",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 1000000,
    "maxOut": 32768
  },
  {
    "id": "gpt-4.1-mini",
    "name": "GPT-4.1 Mini",
    "provider": "openai",
    "categories": [
      "fast"
    ],
    "ctx": 1000000,
    "maxOut": 32768
  },
  {
    "id": "gpt-4.1-nano",
    "name": "GPT-4.1 Nano",
    "provider": "openai",
    "categories": [
      "fast"
    ],
    "ctx": 1000000,
    "maxOut": 32768
  },
  {
    "id": "o4-mini",
    "name": "o4-mini",
    "provider": "openai",
    "categories": [
      "reasoning"
    ],
    "ctx": 200000,
    "maxOut": 100000
  },
  {
    "id": "o3",
    "name": "o3",
    "provider": "openai",
    "categories": [
      "reasoning"
    ],
    "ctx": 200000,
    "maxOut": 100000
  },
  {
    "id": "o3-pro",
    "name": "o3 Pro",
    "provider": "openai",
    "categories": [
      "reasoning"
    ],
    "ctx": 200000,
    "maxOut": 100000
  },
  {
    "id": "o3-mini",
    "name": "o3 Mini",
    "provider": "openai",
    "categories": [
      "reasoning",
      "fast"
    ],
    "ctx": 200000,
    "maxOut": 100000
  },
  {
    "id": "o1",
    "name": "o1",
    "provider": "openai",
    "categories": [
      "reasoning"
    ],
    "ctx": 200000,
    "maxOut": 100000
  },
  {
    "id": "gpt-4o",
    "name": "GPT-4o",
    "provider": "openai",
    "categories": [
      "flagship",
      "vision"
    ],
    "ctx": 128000,
    "maxOut": 16384
  },
  {
    "id": "gpt-4o-mini",
    "name": "GPT-4o Mini",
    "provider": "openai",
    "categories": [
      "fast",
      "vision"
    ],
    "ctx": 128000,
    "maxOut": 16384
  },
  {
    "id": "gpt-4o-search-preview",
    "name": "GPT-4o Search",
    "provider": "openai",
    "categories": [
      "search"
    ],
    "ctx": 128000,
    "maxOut": 16384
  },
  {
    "id": "claude-opus-4-6",
    "name": "Claude Opus 4.6",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code",
      "reasoning"
    ],
    "ctx": 200000,
    "maxOut": 128000
  },
  {
    "id": "claude-sonnet-4-6",
    "name": "Claude Sonnet 4.6",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 200000,
    "maxOut": 64000,
    "isDefault": true
  },
  {
    "id": "claude-opus-4-5-20251101",
    "name": "Claude Opus 4.5",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 200000,
    "maxOut": 32000
  },
  {
    "id": "claude-sonnet-4-5-20241022",
    "name": "Claude Sonnet 4.5",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 200000,
    "maxOut": 16000
  },
  {
    "id": "claude-opus-4-1-20250630",
    "name": "Claude Opus 4.1",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 200000,
    "maxOut": 32000
  },
  {
    "id": "claude-sonnet-4-20250514",
    "name": "Claude Sonnet 4",
    "provider": "anthropic",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 200000,
    "maxOut": 16000
  },
  {
    "id": "claude-3-5-haiku-20241022",
    "name": "Claude 3.5 Haiku",
    "provider": "anthropic",
    "categories": [
      "fast"
    ],
    "ctx": 200000,
    "maxOut": 8192
  },
  {
    "id": "gemini-3.1-pro-preview",
    "name": "Gemini 3.1 Pro (Preview)",
    "provider": "google",
    "categories": [
      "flagship",
      "reasoning",
      "code"
    ],
    "ctx": 1000000,
    "maxOut": 65536
  },
  {
    "id": "gemini-3-flash-preview",
    "name": "Gemini 3 Flash (Preview)",
    "provider": "google",
    "categories": [
      "fast",
      "reasoning",
      "vision"
    ],
    "ctx": 1000000,
    "maxOut": 65536
  },
  {
    "id": "gemini-2.5-pro",
    "name": "Gemini 2.5 Pro",
    "provider": "google",
    "categories": [
      "flagship",
      "reasoning",
      "code"
    ],
    "ctx": 1000000,
    "maxOut": 65536,
    "isDefault": true
  },
  {
    "id": "gemini-2.5-flash",
    "name": "Gemini 2.5 Flash",
    "provider": "google",
    "categories": [
      "fast",
      "reasoning"
    ],
    "ctx": 1000000,
    "maxOut": 65536
  },
  {
    "id": "gemini-2.5-flash-lite",
    "name": "Gemini 2.5 Flash Lite",
    "provider": "google",
    "categories": [
      "fast"
    ],
    "ctx": 1000000,
    "maxOut": 65536
  },
  {
    "id": "gemini-2.0-flash",
    "name": "Gemini 2.0 Flash",
    "provider": "google",
    "categories": [
      "fast",
      "vision"
    ],
    "ctx": 1000000,
    "maxOut": 8192
  },
  {
    "id": "gemini-2.0-flash-lite",
    "name": "Gemini 2.0 Flash Lite",
    "provider": "google",
    "categories": [
      "fast"
    ],
    "ctx": 1000000,
    "maxOut": 8192
  },
  {
    "id": "meta-llama/llama-4-maverick-17b-128e-instruct",
    "name": "Llama 4 Maverick",
    "provider": "groq",
    "categories": [
      "flagship",
      "vision"
    ],
    "ctx": 128000
  },
  {
    "id": "meta-llama/llama-4-scout-17b-16e-instruct",
    "name": "Llama 4 Scout",
    "provider": "groq",
    "categories": [
      "fast",
      "vision"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "llama-3.3-70b-versatile",
    "name": "Llama 3.3 70B",
    "provider": "groq",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "llama-3.1-8b-instant",
    "name": "Llama 3.1 8B",
    "provider": "groq",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "qwen/qwen-3-32b",
    "name": "Qwen 3 32B",
    "provider": "groq",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "deepseek-r1-distill-llama-70b",
    "name": "DeepSeek R1 Distill 70B",
    "provider": "groq",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "openai/gpt-oss-120b",
    "name": "GPT-OSS 120B",
    "provider": "groq",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "deepseek-ai/DeepSeek-R1",
    "name": "DeepSeek R1",
    "provider": "together",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "deepseek-ai/DeepSeek-V3.1",
    "name": "DeepSeek V3.1",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "DeepSeek-AI/DeepSeek-V3-2-Exp",
    "name": "DeepSeek V3.2 Exp",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    "name": "Llama 4 Maverick",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "name": "Llama 4 Scout",
    "provider": "together",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "name": "Llama 3.3 70B Turbo",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    "name": "Llama 3.1 405B Turbo",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "name": "Llama 3.1 8B Turbo",
    "provider": "together",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "Qwen/Qwen2.5-72B-Instruct-Turbo",
    "name": "Qwen 2.5 72B Turbo",
    "provider": "together",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "Qwen/QwQ-32B",
    "name": "Qwen QwQ 32B",
    "provider": "together",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
    "name": "Qwen 2.5 Coder 32B",
    "provider": "together",
    "categories": [
      "code"
    ],
    "ctx": 128000
  },
  {
    "id": "mistralai/Mistral-Small-24B-Instruct-2501",
    "name": "Mistral Small 3",
    "provider": "together",
    "categories": [
      "fast"
    ],
    "ctx": 32000
  },
  {
    "id": "mistral-large-latest",
    "name": "Mistral Large 3",
    "provider": "mistral",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "mistral-medium-latest",
    "name": "Mistral Medium 3",
    "provider": "mistral",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "mistral-small-latest",
    "name": "Mistral Small 3.2",
    "provider": "mistral",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "magistral-medium-latest",
    "name": "Magistral Medium",
    "provider": "mistral",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "magistral-small-latest",
    "name": "Magistral Small",
    "provider": "mistral",
    "categories": [
      "reasoning",
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "codestral-latest",
    "name": "Codestral",
    "provider": "mistral",
    "categories": [
      "code"
    ],
    "ctx": 256000
  },
  {
    "id": "devstral-medium-latest",
    "name": "Devstral Medium",
    "provider": "mistral",
    "categories": [
      "code"
    ],
    "ctx": 256000
  },
  {
    "id": "pixtral-large-latest",
    "name": "Pixtral Large",
    "provider": "mistral",
    "categories": [
      "vision",
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "ministral-8b-latest",
    "name": "Ministral 8B",
    "provider": "mistral",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "ministral-3b-latest",
    "name": "Ministral 3B",
    "provider": "mistral",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "deepseek-chat",
    "name": "DeepSeek V3.2 Chat",
    "provider": "deepseek",
    "categories": [
      "flagship",
      "code"
    ],
    "ctx": 128000,
    "maxOut": 8192,
    "isDefault": true
  },
  {
    "id": "deepseek-reasoner",
    "name": "DeepSeek V3.2 Reasoner",
    "provider": "deepseek",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000,
    "maxOut": 8192
  },
  {
    "id": "accounts/fireworks/models/deepseek-v3p2",
    "name": "DeepSeek V3.2",
    "provider": "fireworks",
    "categories": [
      "flagship"
    ],
    "ctx": 160000,
    "isDefault": true
  },
  {
    "id": "accounts/fireworks/models/deepseek-r1-0528",
    "name": "DeepSeek R1",
    "provider": "fireworks",
    "categories": [
      "reasoning"
    ],
    "ctx": 160000
  },
  {
    "id": "accounts/fireworks/models/llama-v3p3-70b-instruct",
    "name": "Llama 3.3 70B",
    "provider": "fireworks",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "accounts/fireworks/models/llama-v3p1-8b-instruct",
    "name": "Llama 3.1 8B",
    "provider": "fireworks",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct",
    "name": "Qwen3 Coder 480B",
    "provider": "fireworks",
    "categories": [
      "code"
    ],
    "ctx": 256000
  },
  {
    "id": "sonar-pro",
    "name": "Sonar Pro",
    "provider": "perplexity",
    "categories": [
      "search",
      "flagship"
    ],
    "ctx": 200000,
    "isDefault": true
  },
  {
    "id": "sonar",
    "name": "Sonar",
    "provider": "perplexity",
    "categories": [
      "search",
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "sonar-reasoning-pro",
    "name": "Sonar Reasoning Pro",
    "provider": "perplexity",
    "categories": [
      "search",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "sonar-reasoning",
    "name": "Sonar Reasoning",
    "provider": "perplexity",
    "categories": [
      "search",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "sonar-deep-research",
    "name": "Sonar Deep Research",
    "provider": "perplexity",
    "categories": [
      "search",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "command-a-03-2025",
    "name": "Command A",
    "provider": "cohere",
    "categories": [
      "flagship"
    ],
    "ctx": 256000,
    "isDefault": true
  },
  {
    "id": "command-r-plus-08-2024",
    "name": "Command R+",
    "provider": "cohere",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "command-r-08-2024",
    "name": "Command R",
    "provider": "cohere",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "c4ai-command-r7b-12-2024",
    "name": "Command R7B",
    "provider": "cohere",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "grok-4-1-fast-reasoning",
    "name": "Grok 4.1 Fast Reasoning",
    "provider": "xai",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 2000000
  },
  {
    "id": "grok-4-1-fast-non-reasoning",
    "name": "Grok 4.1 Fast",
    "provider": "xai",
    "categories": [
      "flagship",
      "fast"
    ],
    "ctx": 2000000,
    "isDefault": true
  },
  {
    "id": "grok-4",
    "name": "Grok 4",
    "provider": "xai",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 256000
  },
  {
    "id": "grok-3-beta",
    "name": "Grok 3",
    "provider": "xai",
    "categories": [
      "flagship"
    ],
    "ctx": 131000
  },
  {
    "id": "grok-3-mini-beta",
    "name": "Grok 3 Mini",
    "provider": "xai",
    "categories": [
      "fast",
      "reasoning"
    ],
    "ctx": 131000
  },
  {
    "id": "grok-3-fast-beta",
    "name": "Grok 3 Fast",
    "provider": "xai",
    "categories": [
      "fast"
    ],
    "ctx": 131000
  },
  {
    "id": "grok-2-1212",
    "name": "Grok 2",
    "provider": "xai",
    "categories": [
      "flagship"
    ],
    "ctx": 131000
  },
  {
    "id": "grok-2-vision-1212",
    "name": "Grok 2 Vision",
    "provider": "xai",
    "categories": [
      "vision"
    ],
    "ctx": 131000
  },
  {
    "id": "grok-code-fast-1",
    "name": "Grok Code",
    "provider": "xai",
    "categories": [
      "code"
    ],
    "ctx": 256000
  },
  {
    "id": "kimi-k2.5",
    "name": "Kimi K2.5",
    "provider": "moonshot",
    "categories": [
      "flagship",
      "vision",
      "reasoning"
    ],
    "ctx": 256000,
    "isDefault": true
  },
  {
    "id": "kimi-k2-0905-preview",
    "name": "Kimi K2",
    "provider": "moonshot",
    "categories": [
      "flagship"
    ],
    "ctx": 256000
  },
  {
    "id": "kimi-k2-thinking",
    "name": "Kimi K2 Thinking",
    "provider": "moonshot",
    "categories": [
      "reasoning"
    ],
    "ctx": 256000
  },
  {
    "id": "moonshot-v1-128k",
    "name": "Moonshot V1 128K",
    "provider": "moonshot",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "moonshot-v1-32k",
    "name": "Moonshot V1 32K",
    "provider": "moonshot",
    "categories": [
      "fast"
    ],
    "ctx": 32000
  },
  {
    "id": "gpt-oss-120b",
    "name": "GPT-OSS 120B",
    "provider": "cerebras",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "qwen-3-235b-a22b-instruct-2507",
    "name": "Qwen 3 235B",
    "provider": "cerebras",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 131000
  },
  {
    "id": "zai-glm-4.7",
    "name": "GLM-4.7",
    "provider": "cerebras",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "llama3.1-8b",
    "name": "Llama 3.1 8B",
    "provider": "cerebras",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "DeepSeek-V3.1",
    "name": "DeepSeek V3.1",
    "provider": "sambanova",
    "categories": [
      "flagship"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "DeepSeek-R1-0528",
    "name": "DeepSeek R1",
    "provider": "sambanova",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "DeepSeek-V3-0324",
    "name": "DeepSeek V3",
    "provider": "sambanova",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "Llama-4-Maverick-17B-128E-Instruct",
    "name": "Llama 4 Maverick",
    "provider": "sambanova",
    "categories": [
      "flagship",
      "vision"
    ],
    "ctx": 128000
  },
  {
    "id": "Meta-Llama-3.3-70B-Instruct",
    "name": "Llama 3.3 70B",
    "provider": "sambanova",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "Meta-Llama-3.1-8B-Instruct",
    "name": "Llama 3.1 8B",
    "provider": "sambanova",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "Qwen3-235B-A22B-Instruct-2507",
    "name": "Qwen 3 235B",
    "provider": "sambanova",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "Qwen3-32B",
    "name": "Qwen 3 32B",
    "provider": "sambanova",
    "categories": [
      "fast",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "jamba-large",
    "name": "Jamba Large",
    "provider": "ai21",
    "categories": [
      "flagship"
    ],
    "ctx": 256000,
    "isDefault": true
  },
  {
    "id": "jamba-mini",
    "name": "Jamba Mini",
    "provider": "ai21",
    "categories": [
      "fast"
    ],
    "ctx": 256000
  },
  {
    "id": "llama4:scout",
    "name": "Llama 4 Scout",
    "provider": "ollama",
    "categories": [
      "flagship",
      "vision"
    ],
    "ctx": 128000,
    "isDefault": true
  },
  {
    "id": "llama4:maverick",
    "name": "Llama 4 Maverick",
    "provider": "ollama",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "llama3.3",
    "name": "Llama 3.3 70B",
    "provider": "ollama",
    "categories": [
      "flagship"
    ],
    "ctx": 128000
  },
  {
    "id": "llama3.2",
    "name": "Llama 3.2 3B",
    "provider": "ollama",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "qwen3",
    "name": "Qwen 3",
    "provider": "ollama",
    "categories": [
      "flagship",
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "deepseek-r1",
    "name": "DeepSeek R1",
    "provider": "ollama",
    "categories": [
      "reasoning"
    ],
    "ctx": 128000
  },
  {
    "id": "mistral",
    "name": "Mistral 7B",
    "provider": "ollama",
    "categories": [
      "fast"
    ],
    "ctx": 32000
  },
  {
    "id": "codellama",
    "name": "Code Llama",
    "provider": "ollama",
    "categories": [
      "code"
    ],
    "ctx": 16000
  },
  {
    "id": "gemma3",
    "name": "Gemma 3",
    "provider": "ollama",
    "categories": [
      "fast"
    ],
    "ctx": 128000
  },
  {
    "id": "phi4",
    "name": "Phi-4",
    "provider": "ollama",
    "categories": [
      "fast",
      "reasoning"
    ],
    "ctx": 16000
  },
  {
    "id": "gpt-image-1",
    "name": "GPT Image 1",
    "provider": "openai",
    "categories": [
      "image"
    ],
    "isDefault": true,
    "modality": "image"
  },
  {
    "id": "dall-e-3",
    "name": "DALL-E 3",
    "provider": "openai",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "dall-e-2",
    "name": "DALL-E 2",
    "provider": "openai",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "imagen-4.0-generate-preview-05-20",
    "name": "Imagen 4",
    "provider": "google",
    "categories": [
      "image"
    ],
    "isDefault": true,
    "modality": "image"
  },
  {
    "id": "imagen-3.0-generate-002",
    "name": "Imagen 3",
    "provider": "google",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "gemini-2.0-flash-preview-image-generation",
    "name": "Gemini Flash (image gen)",
    "provider": "google",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "grok-2-image",
    "name": "Grok 2 Image",
    "provider": "xai",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "black-forest-labs/FLUX.1.1-pro",
    "name": "FLUX 1.1 Pro",
    "provider": "together",
    "categories": [
      "image"
    ],
    "isDefault": true,
    "modality": "image"
  },
  {
    "id": "black-forest-labs/FLUX.1-schnell",
    "name": "FLUX Schnell",
    "provider": "together",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "stabilityai/stable-diffusion-xl-base-1.0",
    "name": "SDXL 1.0",
    "provider": "together",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "accounts/fireworks/models/flux-1-1-pro",
    "name": "FLUX 1.1 Pro",
    "provider": "fireworks",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "accounts/fireworks/models/flux-1-schnell",
    "name": "FLUX Schnell",
    "provider": "fireworks",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "accounts/fireworks/models/playground-v2-5-1024px-aesthetic",
    "name": "Playground v2.5",
    "provider": "fireworks",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "stable-diffusion",
    "name": "Stable Diffusion",
    "provider": "ollama",
    "categories": [
      "image"
    ],
    "modality": "image"
  },
  {
    "id": "whisper-1",
    "name": "Whisper v3",
    "provider": "openai",
    "categories": [
      "audio"
    ],
    "isDefault": true,
    "modality": "audio"
  },
  {
    "id": "tts-1",
    "name": "TTS-1",
    "provider": "openai",
    "categories": [
      "tts"
    ],
    "modality": "audio"
  },
  {
    "id": "tts-1-hd",
    "name": "TTS-1 HD",
    "provider": "openai",
    "categories": [
      "tts"
    ],
    "modality": "audio"
  },
  {
    "id": "gpt-4o-audio-preview",
    "name": "GPT-4o Audio",
    "provider": "openai",
    "categories": [
      "audio"
    ],
    "modality": "audio"
  },
  {
    "id": "gpt-4o-mini-audio-preview",
    "name": "GPT-4o Mini Audio",
    "provider": "openai",
    "categories": [
      "audio"
    ],
    "modality": "audio"
  },
  {
    "id": "gemini-2.5-flash-preview-tts",
    "name": "Gemini 2.5 Flash TTS",
    "provider": "google",
    "categories": [
      "tts"
    ],
    "modality": "audio"
  },
  {
    "id": "whisper-large-v3-turbo",
    "name": "Whisper Large v3 Turbo",
    "provider": "groq",
    "categories": [
      "audio"
    ],
    "isDefault": true,
    "modality": "audio"
  },
  {
    "id": "whisper-large-v3",
    "name": "Whisper Large v3",
    "provider": "groq",
    "categories": [
      "audio"
    ],
    "modality": "audio"
  },
  {
    "id": "whisper",
    "name": "Whisper",
    "provider": "ollama",
    "categories": [
      "audio"
    ],
    "modality": "audio"
  },
  {
    "id": "text-embedding-3-large",
    "name": "Embedding 3 Large",
    "provider": "openai",
    "categories": [
      "embedding"
    ],
    "isDefault": true,
    "modality": "embedding"
  },
  {
    "id": "text-embedding-3-small",
    "name": "Embedding 3 Small",
    "provider": "openai",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "text-embedding-ada-002",
    "name": "Embedding Ada 002",
    "provider": "openai",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "text-embedding-005",
    "name": "Text Embedding 005",
    "provider": "google",
    "categories": [
      "embedding"
    ],
    "isDefault": true,
    "modality": "embedding"
  },
  {
    "id": "embed-v4.0",
    "name": "Embed v4",
    "provider": "cohere",
    "categories": [
      "embedding"
    ],
    "isDefault": true,
    "modality": "embedding"
  },
  {
    "id": "embed-english-v3.0",
    "name": "Embed English v3",
    "provider": "cohere",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "embed-multilingual-v3.0",
    "name": "Embed Multilingual v3",
    "provider": "cohere",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "togethercomputer/m2-bert-80M-8k-retrieval",
    "name": "M2 BERT 80M",
    "provider": "together",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "mistral-embed",
    "name": "Mistral Embed",
    "provider": "mistral",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "nomic-ai/nomic-embed-text-v1.5",
    "name": "Nomic Embed v1.5",
    "provider": "fireworks",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "nomic-embed-text",
    "name": "Nomic Embed Text",
    "provider": "ollama",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  },
  {
    "id": "mxbai-embed-large",
    "name": "mxbai Embed Large",
    "provider": "ollama",
    "categories": [
      "embedding"
    ],
    "modality": "embedding"
  }
];
