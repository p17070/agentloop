# AgentLoop

Universal LLM API — one interface, every provider.

AgentLoop is a TypeScript SDK that normalizes 11 LLM provider APIs into a single unified interface. Zero runtime dependencies, uses native `fetch()` (Node 18+).

## Supported Providers

| Provider | Method | Status |
|---|---|---|
| OpenAI | OpenAI-compatible | Planned |
| Anthropic | Native transform | Planned |
| Google Gemini | Native transform | Planned |
| Groq | OpenAI-compatible | Planned |
| Together AI | OpenAI-compatible | Planned |
| Mistral | OpenAI-compatible | Planned |
| DeepSeek | OpenAI-compatible | Planned |
| Fireworks | OpenAI-compatible | Planned |
| Perplexity | OpenAI-compatible | Planned |
| Ollama | OpenAI-compatible | Planned |
| Cohere | OpenAI-compatible | Planned |

## Quick Start

```bash
npm install agentloop
```

```typescript
import { AgentLoop } from "agentloop";

const agent = new AgentLoop({
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
  },
});

const response = await agent.chat({
  model: "anthropic/claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Hello!" }],
});

// Normalized response — same shape regardless of provider
for (const part of response.choices[0].content) {
  if (part.type === "text") console.log(part.text);
}
```

## Key Features

- **Unified response format** — All providers normalized to `ResponsePart[]` (10 discriminated union types)
- **Streaming** — Content-part lifecycle events (`content.start` / `content.delta` / `content.done`)
- **Tool calling** — Consistent tool call/result interface across providers
- **Reasoning/thinking** — Normalized from 3 different field names + `<think>` tags
- **Citations** — Unified from 5 different provider formats
- **Middleware** — Composable retry, fallback, cache, logger
- **Structured output** — Zod schema validation with automatic `response_format` injection

## Project Structure

```
agentloop/
├── src/
│   ├── index.ts              # Public barrel export
│   ├── types.ts              # Type system (ResponsePart, Citation, Usage)
│   ├── client.ts             # AgentLoop class (planned)
│   ├── provider.ts           # OpenAI-compatible provider (planned)
│   ├── normalize.ts          # Response normalization (planned)
│   ├── registry.ts           # Provider config + param filters (planned)
│   ├── errors.ts             # Error hierarchy (planned)
│   ├── middleware.ts          # Middleware system (planned)
│   └── transforms/
│       ├── anthropic.ts      # Anthropic transform (planned)
│       └── google.ts         # Gemini transform (planned)
├── tests/
│   ├── *.test.ts             # Unit tests (95 planned test cases)
│   ├── fixtures/             # JSON fixtures for provider responses
│   └── integration/          # Integration tests against real APIs
├── .github/workflows/ci.yml  # CI pipeline (Node 18/20/22)
├── SPEC.md                   # Full technical specification
├── PLAN.md                   # Implementation plan
└── TESTING.md                # Testing strategy and guide
```

## Development

```bash
# Install dependencies
npm install

# Run unit tests (watch mode)
npm test

# Run unit tests (single run, for CI)
npm run test:ci

# Run integration tests (requires API keys)
ANTHROPIC_API_KEY=sk-... npm run test:integration

# Type check
npm run typecheck

# Build (ESM + CJS)
npm run build
```

## Documentation

- **[SPEC.md](./SPEC.md)** — Full technical specification (types, normalization rules, all 11 providers)
- **[PLAN.md](./PLAN.md)** — Architecture and implementation plan
- **[TESTING.md](./TESTING.md)** — Testing strategy, framework setup, and integration test guide

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.5

## License

MIT
