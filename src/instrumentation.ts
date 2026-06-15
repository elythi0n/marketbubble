/**
 * Next.js boot hook (runs once when the server process starts).
 *
 * Sources for the server-side X broadcast reader come from two places, merged and de-duplicated:
 *   1. each streamer's `xBroadcasts` in streamers.json (their own X plus a shared show account),
 *   2. the X_BROADCAST_SOURCES env var (handy for hosts that can't edit the file).
 *
 * When any source is live, the server reads its broadcast chat into the shared X buffer. This
 * complements the browser extension (still first-class, and broader: it also covers Spaces); the
 * bridge is an automatic, extension-free source for plain X broadcasts. No sources => disabled.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { loadRoster, rosterXBroadcastSources, normalizeXSource } = await import("@/lib/streamers/load");
  const { isNearSlot } = await import("@/lib/streamers/schedule");

  const roster = loadRoster();

  // Analytics sampler — only when persistence is enabled (viewer history + durable leaderboard).
  const { hasDatabase } = await import("@/lib/server/db");
  if (hasDatabase()) {
    const g2 = globalThis as typeof globalThis & { __mbStatsSampler?: () => void };
    if (!g2.__mbStatsSampler) {
      const { startStatsSampler } = await import("@/lib/server/stats");
      g2.__mbStatsSampler = startStatsSampler(roster);
    }
  }

  // Clip radar — armed at boot but inert until the operator enables it (admin → Controls).
  const { startClipRadar } = await import("@/lib/server/clip-radar");
  startClipRadar();

  // In-process Twitch + Kick chatter tally. Mutually exclusive with the relay (RELAY_URL):
  // the relay's /top-chatters already does this, and running both would double-count. When
  // there's no relay, this fills the same role so single-process deploys (Vercel + Turso,
  // bare `npm start`) still get a full Twitch/Kick/X leaderboard instead of X-only.
  if (!process.env.RELAY_URL?.trim()) {
    const g3 = globalThis as typeof globalThis & { __mbChatListenerStarted?: boolean };
    if (!g3.__mbChatListenerStarted) {
      g3.__mbChatListenerStarted = true;
      const { startChatListener } = await import("@/lib/server/chat-listener");
      void startChatListener(roster);
    }
  }
  const envSources = (process.env.X_BROADCAST_SOURCES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Merge roster + env, de-duplicated by normalized handle / broadcast id.
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const src of [...rosterXBroadcastSources(roster), ...envSources]) {
    const key = normalizeXSource(src);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push(src);
  }
  if (sources.length === 0) return;

  // Guard against a second bridge on dev hot-reloads.
  const g = globalThis as typeof globalThis & { __xBroadcastBridge?: () => void };
  if (g.__xBroadcastBridge) return;

  // Discovery cadence: every minute around any roster slot (shortly before it through the
  // starting window), every 5 minutes otherwise — X's guest endpoints rate-limit by IP.
  const schedules = roster.map((s) => s.schedule).filter((sch) => sch != null);
  const pollMs = schedules.length
    ? () => (schedules.some((sch) => isNearSlot(sch, new Date())) ? 60_000 : 5 * 60_000)
    : undefined;

  const { startXBroadcastBridge } = await import("@/lib/x/broadcast/manager");
  g.__xBroadcastBridge = startXBroadcastBridge({ sources, pollMs });
  console.log(`[x-bridge] watching ${sources.length} X source(s): ${sources.join(", ")}`);
}
