import { type NextRequest, NextResponse } from "next/server";

import { getControlState } from "@/lib/server/control";
import { loadRoster } from "@/lib/streamers/load";
import { DEFAULT_SCHEDULE } from "@/lib/streamers/schedule";
import { normalizeXSource } from "@/lib/streamers/x-source";

/**
 * Aggregate "is the show live right now?" for the marketing homepage. Fans out to the same
 * per-platform status endpoints the dashboard uses (Twitch/Kick GQL + the in-process X bridge),
 * across every roster channel, and collapses them to one verdict + a combined viewer count.
 *
 * Shared X show accounts (e.g. MarketBubble listed on several hosts) are de-duplicated by
 * normalized handle so their audience is counted once, mirroring the dashboard's stat band.
 */
export const dynamic = "force-dynamic";

interface PlatformStatus {
  live: boolean | null;
  viewerCount?: number;
  viewers?: number;
}

async function check(url: URL): Promise<{ live: boolean; viewers: number }> {
  try {
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) return { live: false, viewers: 0 };
    const d = (await res.json()) as PlatformStatus;
    return { live: d.live === true, viewers: d.viewerCount ?? d.viewers ?? 0 };
  } catch {
    return { live: false, viewers: 0 };
  }
}

export async function GET(req: NextRequest) {
  const roster = loadRoster();
  const checks: Promise<{ live: boolean; viewers: number }>[] = [];
  const seenX = new Set<string>();

  for (const s of roster) {
    if (s.handles.twitch) {
      checks.push(check(new URL(`/api/twitch/stream?login=${encodeURIComponent(s.handles.twitch)}`, req.url)));
    }
    if (s.handles.kick) {
      checks.push(check(new URL(`/api/kick/stream?slug=${encodeURIComponent(s.handles.kick)}`, req.url)));
    }
    const xSources = s.xBroadcasts?.length ? s.xBroadcasts : s.handles.x ? [s.handles.x] : [];
    for (const src of xSources) {
      const key = normalizeXSource(src);
      if (!key || seenX.has(key)) continue;
      seenX.add(key);
      checks.push(check(new URL(`/api/x/stream?handle=${encodeURIComponent(key)}`, req.url)));
    }
  }

  const results = await Promise.all(checks);
  const live = results.some((r) => r.live);
  const viewers = results.reduce((sum, r) => sum + (r.live ? r.viewers : 0), 0);

  // Schedule label follows the control-room roster override when set, else the file roster, else
  // the built-in default — so editing the show time in /admin updates the homepage + card.
  const scheduleSource = getControlState().roster ?? roster;
  const scheduleLabel = scheduleSource.find((s) => s.schedule)?.schedule?.label ?? DEFAULT_SCHEDULE.label;

  return NextResponse.json(
    { live, viewers, schedule: scheduleLabel },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=30" } },
  );
}
