import type { FeedMessage } from "@/lib/feed/types";

/**
 * Opt-in, in-memory chat archive the assistant's tools read from. Strictly session-scoped:
 * nothing is written to disk or any server, and disabling the opt-in (or reloading) wipes it.
 * The live feed keeps only ~500 messages; this keeps more (configurable in Settings → Assistant)
 * so the assistant can look further back within the session.
 */
let limit = 5000;
let enabled = false;
const buf: FeedMessage[] = [];
const seen = new Set<string>();

function trim() {
  if (buf.length > limit) {
    for (const dropped of buf.splice(0, buf.length - limit)) seen.delete(dropped.id);
  }
}

export function setArchiveEnabled(v: boolean) {
  enabled = v;
  if (!v) {
    buf.length = 0;
    seen.clear();
  }
}

export function setArchiveLimit(n: number) {
  limit = Math.max(100, n);
  trim();
}

export function getArchiveLimit(): number {
  return limit;
}

export function archiveMessages(messages: readonly FeedMessage[]) {
  if (!enabled) return;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    buf.push(m);
  }
  trim();
}

export function getArchive(): readonly FeedMessage[] {
  return buf;
}
