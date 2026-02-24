# CLAUDE.md

This file is the source of truth for Claude Code working on the AgentLoop project.

## Project Overview

AgentLoop is a TypeScript SDK that provides a single unified interface to 11 LLM providers. Zero runtime dependencies — uses native `fetch()` on Node 18+.

**Current status:** Testing infrastructure is complete. Source code implementation (Phases 1–3) has not started yet. Only `src/types.ts` and `src/index.ts` (stub) exist.

## Commands

```bash
npm test                  # Unit tests — vitest watch mode
npm run test:ci           # Unit tests — single run (CI)
npm run test:coverage     # Unit tests — with v8 coverage report
npm run test:integration  # Integration tests — requires API keys (see below)
npm run typecheck         # TypeScript type checking (tsc --noEmit)
npm run build             # Build ESM + CJS to dist/ (tsup)
```

Integration tests require environment variables:
```bash
ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
```

## Architecture

- 9 of 11 providers are OpenAI-compatible (same wire format, different param subsets)
- 2 providers (Anthropic, Google Gemini) need full request/response transforms
- A parameter filter layer (strip/rename/clamp/defaults) handles provider differences
- All responses normalized to `ResponsePart[]` — a 10-variant discriminated union
- Streaming uses content-part lifecycle events: `content.start → content.delta → content.done`

## Key Files

| File | Purpose |
|---|---|
| `SPEC.md` | Full technical specification — types, normalization rules, all 11 providers. This is the single source of truth for implementation details. |
| `PLAN.md` | Architecture plan with project structure, implementation phases, and provider compatibility matrices. |
| `TESTING.md` | Testing strategy, test plan by module, integration test guide. |
| `src/types.ts` | Core type definitions — `ResponsePart`, `Citation`, `Usage`, `FinishReason`, `Role`. |
| `src/index.ts` | Barrel export (currently a stub). |
| `vitest.config.ts` | Unit test config — `tests/**/*.test.ts`, excludes `tests/integration/**`. Coverage thresholds at 80%. |
| `vitest.integration.config.ts` | Integration test config — `tests/integration/**/*.test.ts`, 30s timeout. |
| `tsconfig.json` | TypeScript — ES2022, NodeNext, strict mode. |
| `tsup.config.ts` | Build — ESM + CJS dual output, dts, node18 target. |

## Project Layout

```
src/                         # Source code (TypeScript, ESM)
  index.ts                   # Barrel export (stub)
  types.ts                   # Core types (implemented)
  transforms/                # Provider-specific transforms (empty, planned)
tests/                       # Unit tests (vitest)
  *.test.ts                  # 5 test suites, 95 scaffolded it.todo() cases
  fixtures/                  # JSON fixtures for provider responses (empty, planned)
  integration/               # Integration tests against real APIs
    anthropic-api.ts         # Minimal Anthropic client (native fetch)
    anthropic.test.ts        # 30 passing tests against real Anthropic API
.github/workflows/ci.yml    # CI: typecheck → test → build on Node 18/20/22
```

## Code Style and Conventions

- **TypeScript strict mode** — `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all enabled
- **ESM-first** — `"type": "module"` in package.json, NodeNext module resolution
- **Zero runtime deps** — only native `fetch()`. Zod is an optional peer dep.
- **Discriminated unions** — use `type` field for exhaustive matching (e.g., `ResponsePart`, `Citation`, `ChatStreamEvent`)
- **Pure functions** — transforms are stateless mappers (`toAnthropicRequest`, `fromAnthropicResponse`, etc.)
- **Config over code** — provider differences expressed as declarative config in the registry (strip/rename/clamp), not per-provider adapter classes

## Testing Conventions

- **Unit tests** go in `tests/<module>.test.ts` — mirror the source file name
- **Integration tests** go in `tests/integration/<provider>.test.ts` — one file per provider
- **Integration test helpers** go in `tests/integration/<provider>-api.ts` — minimal API clients using native fetch, no SDKs
- Use `it.todo("description")` to scaffold planned tests before implementation
- Use `describe()` blocks to group by feature area
- Integration tests are excluded from the default `npm test` run
- Coverage thresholds: 80% statements, branches, functions, lines
- Vitest globals are NOT enabled — always import `{ describe, it, expect }` from "vitest"

## Implementation Phases (from PLAN.md)

1. **Phase 1: Types + Core** (~580 lines) — `types.ts`, `provider.ts`, `normalize.ts`, `registry.ts`, `errors.ts` → delivers 9 OpenAI-compatible providers
2. **Phase 2: Transforms** (~470 lines) — `transforms/anthropic.ts`, `transforms/google.ts` → delivers full 11-provider coverage
3. **Phase 3: Client + Middleware** (~240 lines) — `client.ts`, `middleware.ts` → delivers production-ready SDK
4. **Phase 4: Polish + Tests** — ✅ Testing infrastructure is complete. Fill in `it.todo()` tests as modules are implemented.

## Common Pitfalls

- Anthropic uses `x-api-key` header, NOT `Authorization: Bearer`. Also requires `anthropic-version: 2023-06-01` header.
- Anthropic `tool_use.input` is a parsed object — must `JSON.stringify()` for the unified `ToolCallPart.arguments` string.
- Anthropic endpoint is `/v1/messages`, NOT `/v1/chat/completions`.
- Fireworks `function.arguments` can be an object instead of string — coerce with `JSON.stringify()`.
- Mistral `choices[].index` can be a string — coerce with `Number()`.
- Together AI returns `finish_reason: "eos"` — map to `"stop"`.
- Groq streaming usage is nested in `x_groq.usage` — must extract.
- Reasoning/thinking comes as 3 different field names across providers (`reasoning`, `reasoning_content`, `<think>` tags).
- The `exports` field in package.json must list `types` before `import`/`require` (TypeScript resolution order).
- Do NOT add runtime dependencies. The SDK must have zero runtime deps.
