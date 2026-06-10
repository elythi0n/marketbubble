"use client";

/**
 * Tiny pub/sub for "this panel got new content" dots on dock tabs. Panes mark activity as
 * content arrives; DockTab shows a dot while the panel is a background tab and clears it on
 * activation, so the dot always means "new since you last looked".
 */
const active = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

export function markDockActivity(id: string) {
  if (active.has(id)) return;
  active.add(id);
  emit();
}

export function clearDockActivity(id: string) {
  if (active.delete(id)) emit();
}

export function hasDockActivity(id: string): boolean {
  return active.has(id);
}

export function subscribeDockActivity(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function dockActivityVersion(): number {
  return version;
}
