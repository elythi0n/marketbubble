"use client";

import { ANTHROPIC_URL, OPENAI_COMPAT_URL, PROVIDER_MODELS, type AssistantProvider } from "./config";
import type { AssistantAuth } from "./agent";

export interface ModelOption {
  id: string;
  label: string;
}

/** Chat-capable filter per provider; model-list endpoints also return embeddings/audio/etc. */
const CHAT_MODEL: Record<AssistantProvider, (id: string) => boolean> = {
  anthropic: (id) => id.startsWith("claude"),
  openai: (id) =>
    /^(gpt-|o\d|chatgpt-)/.test(id) &&
    !/(audio|realtime|transcribe|tts|image|embed|moderation|search|instruct|whisper|dall-e)/.test(id),
  xai: (id) => id.startsWith("grok") && !/(image|vision)/.test(id),
  openrouter: (id) => /^(anthropic|openai|x-ai|google|meta-llama|deepseek|mistralai)\//.test(id),
};

const MAX_MODELS = 40;

interface ListedModel {
  id: string;
  display_name?: string;
  name?: string;
}

function toOptions(provider: AssistantProvider, data: ListedModel[]): ModelOption[] {
  const options = data
    .filter((m) => m?.id && CHAT_MODEL[provider](m.id))
    .slice(0, MAX_MODELS)
    .map((m) => ({ id: m.id, label: m.display_name ?? m.name ?? m.id }));
  return options.length > 0 ? options : PROVIDER_MODELS[provider];
}

const cache = new Map<string, ModelOption[]>();

/**
 * The provider's live model list — fetched through the proxy for server-configured providers, or
 * directly with the user's in-memory key for BYOK. Falls back to the static defaults on failure.
 */
export async function fetchModels(provider: AssistantProvider, auth: AssistantAuth): Promise<ModelOption[]> {
  const cacheKey = `${provider}:${auth.mode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let res: Response;
    if (auth.mode === "managed") {
      res = await fetch(`/api/assistant/proxy?provider=${provider}&list=models`);
    } else if (provider === "anthropic") {
      res = await fetch(`${ANTHROPIC_URL.replace("/messages", "/models")}?limit=100`, {
        headers: {
          "x-api-key": auth.key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
    } else {
      res = await fetch(OPENAI_COMPAT_URL[provider].replace("/chat/completions", "/models"), {
        headers: { Authorization: `Bearer ${auth.key}` },
      });
    }
    if (!res.ok) return PROVIDER_MODELS[provider];
    const json = (await res.json()) as { data?: ListedModel[] };
    const options = toOptions(provider, json.data ?? []);
    cache.set(cacheKey, options);
    return options;
  } catch {
    return PROVIDER_MODELS[provider];
  }
}
