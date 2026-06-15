/**
 * Server-only module. Module-level singletons are stable for the lifetime of the Node.js process
 * (single-server / Docker deployments). Do not import from client components.
 */

import { getDb, type Statement } from "@/lib/server/db";

export interface XChatMessage {
  id: string;
  authorHandle: string;
  authorName: string;
  text: string;
  timestamp: string; // ISO 8601
  badges?: string[];
  /** Broadcaster/source handle this message belongs to (used as the feed's source label). */
  channel?: string;
}

const MAX_BUFFER = 200;

const buffer: XChatMessage[] = [];
const seen = new Set<string>();

async function recordXChatters(msgs: XChatMessage[]) {
  if (msgs.length === 0) return;
  const db = getDb();
  if (!db) return;
  try {
    const now = Date.now();
    const stmts: Statement[] = [];
    for (const m of msgs) {
      const name = m.authorHandle || m.authorName;
      if (!name) continue;
      stmts.push({
        sql: `INSERT INTO chatters (platform, name, count, source_count, updated_at) VALUES ('x', ?, 1, 0, ?)
              ON CONFLICT(platform, name) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
        params: [name, now],
      });
    }
    if (stmts.length) await db.batch(stmts);
  } catch (err) {
    console.error("[x-buffer] chatter persist failed", err);
  }
}

export function pushMessages(msgs: XChatMessage[]): { accepted: number; duplicates: number } {
  let accepted = 0;
  let duplicates = 0;
  const fresh: XChatMessage[] = [];

  for (const msg of msgs) {
    if (!msg.id || !msg.text) continue;
    if (seen.has(msg.id)) { duplicates++; continue; }
    seen.add(msg.id);
    buffer.push(msg);
    fresh.push(msg);
    accepted++;
  }

  // Durable leaderboard counts (no-op without a database). Fire-and-forget so the extension's
  // POST response isn't held up by the DB write; errors get logged inside.
  void recordXChatters(fresh);

  // Evict oldest entries when over cap, removing their IDs from the seen set too.
  while (buffer.length > MAX_BUFFER) {
    const evicted = buffer.shift();
    if (evicted) seen.delete(evicted.id);
  }

  return { accepted, duplicates };
}

export function getMessages(): XChatMessage[] {
  return [...buffer];
}

/** Empties the buffer (admin action — e.g. before a fresh show session). */
export function clearMessages(): number {
  const n = buffer.length;
  buffer.length = 0;
  seen.clear();
  return n;
}

export function getTopChatters(limit = 15): Array<{ name: string; platform: "x"; count: number }> {
  const counts = new Map<string, number>();
  for (const msg of buffer) {
    const handle = msg.authorHandle || msg.authorName;
    if (handle) counts.set(handle, (counts.get(handle) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, platform: "x" as const, count }));
}
