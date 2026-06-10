/**
 * Whether the AI assistant exists in this build. Set NEXT_PUBLIC_AI_DISABLED=1 to ship the
 * dashboard without it (no panel in the launcher, no palette command, no settings section).
 */
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_DISABLED !== "1";

export type AssistantProvider = "anthropic" | "openai" | "xai" | "openrouter";

export const PROVIDERS: AssistantProvider[] = ["anthropic", "openai", "xai", "openrouter"];

export const PROVIDER_LABEL: Record<AssistantProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  openrouter: "OpenRouter",
};

export const PROVIDER_MODELS: Record<AssistantProvider, { id: string; label: string }[]> = {
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  xai: [
    { id: "grok-4", label: "Grok 4" },
    { id: "grok-4-fast", label: "Grok 4 Fast" },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (OR)" },
    { id: "openai/gpt-5", label: "GPT-5 (OR)" },
    { id: "x-ai/grok-4", label: "Grok 4 (OR)" },
  ],
};

export function defaultModel(provider: AssistantProvider): string {
  return PROVIDER_MODELS[provider][0].id;
}

/**
 * Sanity patterns for model ids per provider. Model lists are fetched live from each provider,
 * so the proxy validates shape (is this plausibly a chat model id for this provider) rather than
 * keeping a hardcoded allowlist.
 */
export const MODEL_PATTERN: Record<AssistantProvider, RegExp> = {
  anthropic: /^claude[\w.-]{0,60}$/,
  openai: /^(gpt-|o\d|chatgpt-)[\w.-]{0,60}$/,
  xai: /^grok[\w.-]{0,60}$/,
  openrouter: /^[\w-]{1,40}\/[\w.:-]{1,60}$/,
};

/** Providers that speak the OpenAI chat-completions format (everything except Anthropic). */
export const OPENAI_COMPAT_URL: Record<Exclude<AssistantProvider, "anthropic">, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
