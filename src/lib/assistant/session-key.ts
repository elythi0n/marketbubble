import type { AssistantProvider } from "./config";

export interface SessionKey {
  provider: AssistantProvider;
  key: string;
}

/**
 * The API key lives in plain module memory — deliberately NOT localStorage or sessionStorage.
 * A page reload resets the JS context and the key is gone; it never touches our server either
 * (inference calls go straight from the browser to the provider).
 */
let sessionKey: SessionKey | null = null;

export function getSessionKey(): SessionKey | null {
  return sessionKey;
}

export function setSessionKey(provider: AssistantProvider, key: string) {
  sessionKey = key.trim() ? { provider, key: key.trim() } : null;
}

export function clearSessionKey() {
  sessionKey = null;
}
