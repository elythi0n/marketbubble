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

  const envSources = (process.env.X_BROADCAST_SOURCES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Merge roster + env, de-duplicated by normalized handle / broadcast id.
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const src of [...rosterXBroadcastSources(loadRoster()), ...envSources]) {
    const key = normalizeXSource(src);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push(src);
  }
  if (sources.length === 0) return;

  // Guard against a second bridge on dev hot-reloads.
  const g = globalThis as typeof globalThis & { __xBroadcastBridge?: () => void };
  if (g.__xBroadcastBridge) return;

  const { startXBroadcastBridge } = await import("@/lib/x/broadcast/manager");
  g.__xBroadcastBridge = startXBroadcastBridge({ sources });
  console.log(`[x-bridge] watching ${sources.length} X source(s): ${sources.join(", ")}`);
}
