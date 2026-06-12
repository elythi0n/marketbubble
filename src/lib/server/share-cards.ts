/**
 * Storage for shared highlight images. The admin uploads the rendered card PNG, gets a short id,
 * and tweets a link to /share/<id> — X reads that page's og:image and shows the card inline.
 *
 * Durable in SQLite when DATABASE_PATH is set; otherwise an in-memory map (links then die with
 * the process — fine for trying the feature, the upload response is identical either way).
 */

import { randomBytes } from "node:crypto";

import { getDb } from "./db";

const TTL_MS = 30 * 24 * 3600_000;
const MEMORY_CAP = 50;

interface MemoryCard {
  png: Uint8Array;
  createdAt: number;
}

const memory: Map<string, MemoryCard> = ((globalThis as Record<string, unknown> & {
  __mbShareCards?: Map<string, MemoryCard>;
}).__mbShareCards ??= new Map());

export function saveShareCard(png: Uint8Array): string {
  const id = randomBytes(6).toString("base64url");
  const now = Date.now();

  const db = getDb();
  if (db) {
    try {
      db.prepare("DELETE FROM share_cards WHERE created_at < ?").run(now - TTL_MS);
      db.prepare("INSERT INTO share_cards (id, png, created_at) VALUES (?, ?, ?)").run(id, png, now);
      return id;
    } catch (err) {
      console.error("[share-cards] persist failed; falling back to memory", err);
    }
  }

  memory.set(id, { png, createdAt: now });
  // Evict oldest beyond the cap (insertion order ≈ age).
  while (memory.size > MEMORY_CAP) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  return id;
}

export function getShareCard(id: string): Uint8Array | null {
  const db = getDb();
  if (db) {
    try {
      const row = db.prepare("SELECT png FROM share_cards WHERE id = ? AND created_at >= ?").get(id, Date.now() - TTL_MS) as
        | { png: Uint8Array }
        | undefined;
      if (row) return row.png;
    } catch (err) {
      console.error("[share-cards] read failed", err);
    }
  }
  return memory.get(id)?.png ?? null;
}
