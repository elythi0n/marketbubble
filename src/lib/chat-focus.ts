"use client";

/**
 * Pub/sub letting other panels (e.g. Chat Roster) ask the chat feed to focus a specific author.
 * Passing null clears the focus. Mirrors the shape of chat-jump.ts.
 */
type Listener = (author: string | null) => void;

const listeners = new Set<Listener>();

export function requestAuthorFocus(author: string | null): void {
  for (const l of listeners) l(author);
}

export function subscribeAuthorFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
