// AgentLoop — Unified Error Handling

export class LLMError extends Error {
  public readonly name = "LLMError";

  constructor(
    message: string,
    public provider: string,
    public status?: number,
    public retryable: boolean = false,
    public raw?: unknown
  ) {
    super(message);
  }
}

/** Extract a human-readable error message from any provider's error shape */
export function extractMessage(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    // OpenAI/Groq/Together/etc: { error: { message: "..." } }
    // Anthropic: { error: { message: "..." }, type: "error" }
    // Google: { error: { message: "...", status: "..." } }
    if ("error" in body) {
      const err = (body as Record<string, unknown>).error;
      if (typeof err === "string") return err;
      if (typeof err === "object" && err !== null && "message" in err) {
        return String((err as Record<string, unknown>).message);
      }
      return JSON.stringify(err);
    }
    if ("message" in body) return String((body as Record<string, unknown>).message);
  }
  return String(body);
}

/** Classify an HTTP error into an LLMError with retryable flag */
export function classifyError(provider: string, status: number, body: unknown): LLMError {
  const msg = extractMessage(body);
  switch (status) {
    case 401:
    case 403:
      return new LLMError(msg, provider, status, false, body);
    case 404:
      return new LLMError(msg, provider, status, false, body);
    case 429:
      return new LLMError(msg, provider, status, true, body);
    case 400:
    case 422:
      return new LLMError(msg, provider, status, false, body);
    default:
      return new LLMError(msg, provider, status, status >= 500, body);
  }
}
