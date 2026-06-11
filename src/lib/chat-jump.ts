"use client";

/**
 * Tiny pub/sub letting other panels (e.g. a Hype Meter spike) ask the live chat feed to scroll
 * to a specific message. Mirrors dock-activity's shape: the chat pane subscribes, anyone emits.
 */
type Listener = (messageId: string) => void;

const listeners = new Set<Listener>();

export function requestChatJump(messageId: string): void {
  for (const l of listeners) l(messageId);
}

export function subscribeChatJump(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
