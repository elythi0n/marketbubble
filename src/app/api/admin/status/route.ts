import { type NextRequest, NextResponse } from "next/server";

import { AI_ENABLED, PROVIDERS } from "@/lib/assistant/config";
import { getAnnouncement } from "@/lib/server/announcement";
import { getDb } from "@/lib/server/db";
import { getMessages, getTopChatters } from "@/lib/x/chat-buffer";
import { adminAuthorized, adminEnabled } from "../auth";
import { serverProviderKey } from "../../assistant/keys";

export const dynamic = "force-dynamic";

export interface AdminStatusPayload {
  flags: {
    demoDisabled: boolean;
    aiDisabled: boolean;
    keySource: "ADMIN_API_KEY" | "X_CHAT_API_KEY";
    siteUrl: string;
  };
  relay: { configured: boolean; ok: boolean; channel?: string | null; mps?: number; clients?: number; chatters?: number };
  /** Optional persistence: configured = DATABASE_PATH set; ok = opened; polls = stored history. */
  database: { configured: boolean; ok: boolean; polls: number };
  xBridge: { buffered: number; topChatters: { name: string; count: number }[] };
  assistant: { enabled: boolean; managed: string[]; perMinute: number; perDay: number };
  announcement: { message: string; setAt: number } | null;
}

/** Everything the admin board shows in one round-trip. Doubles as the login probe. */
export async function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  // Relay health: server-side because RELAY_URL is usually an internal address (docker network).
  const relayUrl = (process.env.RELAY_URL || "").replace(/\/$/, "");
  let relay: AdminStatusPayload["relay"] = { configured: relayUrl !== "", ok: false };
  if (relayUrl) {
    try {
      const res = await fetch(`${relayUrl}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const h = (await res.json()) as { channel?: { name?: string }; mps?: number; clients?: number; chatters?: number };
        relay = { configured: true, ok: true, channel: h.channel?.name ?? null, mps: h.mps, clients: h.clients, chatters: h.chatters };
      }
    } catch {
      /* relay unreachable — ok stays false */
    }
  }

  const db = getDb();
  let storedPolls = 0;
  if (db) {
    try {
      storedPolls = (db.prepare("SELECT COUNT(*) AS n FROM polls").get() as { n: number }).n;
    } catch {
      /* count is cosmetic */
    }
  }

  return NextResponse.json({
    flags: {
      demoDisabled: process.env.NEXT_PUBLIC_DEMO_DISABLED === "1",
      aiDisabled: !AI_ENABLED,
      keySource: process.env.ADMIN_API_KEY?.trim() ? "ADMIN_API_KEY" : "X_CHAT_API_KEY",
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    },
    relay,
    database: { configured: !!process.env.DATABASE_PATH?.trim(), ok: db !== null, polls: storedPolls },
    xBridge: {
      buffered: getMessages().length,
      topChatters: getTopChatters(3).map((c) => ({ name: c.name, count: c.count })),
    },
    assistant: {
      enabled: AI_ENABLED,
      managed: PROVIDERS.filter((p) => serverProviderKey(p) !== null),
      perMinute: Number(process.env.ASSISTANT_RPM || 5),
      perDay: Number(process.env.ASSISTANT_RPD || 50),
    },
    announcement: getAnnouncement(),
  } satisfies AdminStatusPayload);
}
