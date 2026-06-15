/**
 * Storage for shared highlight images. The admin uploads the rendered card PNG, gets a short id,
 * and tweets a link to /share/<id> — X reads that page's og:image and shows the card inline.
 *
 * Durable when a database is configured (local SQLite or Turso); otherwise an in-memory map
 * (links then die with the process — fine for trying the feature, the upload response is
 * identical either way).
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

export async function saveShareCard(png: Uint8Array): Promise<string> {
  const id = randomBytes(6).toString("base64url");
  const now = Date.now();

  const db = getDb();
  if (db) {
    try {
      await db.run("DELETE FROM share_cards WHERE created_at < ?", [now - TTL_MS]);
      await db.run("INSERT INTO share_cards (id, png, created_at) VALUES (?, ?, ?)", [id, png, now]);
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

export async function getShareCard(id: string): Promise<Uint8Array | null> {
  const db = getDb();
  if (db) {
    try {
      const row = await db.get<{ png: Uint8Array }>(
        "SELECT png FROM share_cards WHERE id = ? AND created_at >= ?",
        [id, Date.now() - TTL_MS],
      );
      if (row) return row.png;
    } catch (err) {
      console.error("[share-cards] read failed", err);
    }
  }
  return memory.get(id)?.png ?? null;
}
