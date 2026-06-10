// Server-only module: imported exclusively by API routes; never from client components.
import type { AssistantProvider } from "@/lib/assistant/config";

/**
 * Server-held provider keys. These never reach the client in any form — the providers route
 * exposes only booleans, and the proxy route attaches the key to the upstream request.
 */
const ENV_VAR: Record<AssistantProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function serverProviderKey(provider: AssistantProvider): string | null {
  const key = process.env[ENV_VAR[provider]]?.trim();
  return key ? key : null;
}
