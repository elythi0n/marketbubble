// Server-only helpers for the internal admin board. Not a route file.
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Admin exists only when not disabled AND a key is configured. */
export function adminEnabled(): boolean {
  return process.env.ADMIN_DISABLED !== "1" && adminKey() !== null;
}

/** Dedicated admin key, falling back to the extension's ingest key (same-key logic). */
export function adminKey(): string | null {
  const key = (process.env.ADMIN_API_KEY || process.env.X_CHAT_API_KEY || "").trim();
  return key ? key : null;
}

/** Constant-time check of the x-admin-key header. */
export function adminAuthorized(req: NextRequest): boolean {
  const key = adminKey();
  if (!adminEnabled() || !key) return false;
  const given = req.headers.get("x-admin-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
