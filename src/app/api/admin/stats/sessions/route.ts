import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { adminAuthorized, adminEnabled } from "../../auth";

export const dynamic = "force-dynamic";

export interface StreamSession {
  /** Roster streamer id (metric key, not display name). */
  streamerId: string;
  platform: string;
  start: number;
  end: number;
  /** Still live as of the latest sample. */
  ongoing: boolean;
  peak: number;
  avg: number;
}

export interface AdminSessionsPayload {
  from: number;
  to: number;
  sessions: StreamSession[];
}

const DEFAULT_RANGE_MS = 7 * 24 * 3600_000;
const MAX_RANGE_MS = 92 * 24 * 3600_000;
/** A hole in the samples longer than this splits a session (idle cadence is 5 min). */
const GAP_MS = 15 * 60_000;
/** A session must span at least this long — filters one-sample API blips. */
const MIN_SESSION_MS = 2 * 60_000;

/**
 * Live sessions reconstructed from the viewer time-series: for each `viewers:platform:id`
 * metric, a session is a run of samples with value > 0 (the sampler writes explicit zeros
 * while a channel is offline, so zeros and long gaps both end a run).
 */
export function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "no database configured" }, { status: 501 });

  const now = Date.now();
  const to = Math.min(Number(req.nextUrl.searchParams.get("to")) || now, now);
  const from = Math.max(Number(req.nextUrl.searchParams.get("from")) || to - DEFAULT_RANGE_MS, to - MAX_RANGE_MS);
  if (!(from < to)) return NextResponse.json({ error: "from must precede to" }, { status: 400 });

  try {
    const rows = db
      .prepare(
        `SELECT metric, ts, value FROM stat_samples
         WHERE metric LIKE 'viewers:%' AND ts >= ? AND ts <= ?
         ORDER BY metric, ts`,
      )
      .all(from, to) as Array<{ metric: string; ts: number; value: number }>;

    const sessions: StreamSession[] = [];
    let cur: (StreamSession & { sum: number; n: number }) | null = null;

    /** definiteEnd: a zero sample proved the stream ended (vs. the run just hitting the window edge). */
    const close = (definiteEnd = false) => {
      if (cur && cur.end - cur.start >= MIN_SESSION_MS) {
        const { sum, n, ...session } = cur;
        session.ongoing = !definiteEnd && now - session.end < GAP_MS && now - to < GAP_MS;
        sessions.push({ ...session, avg: Math.round(sum / n) });
      }
      cur = null;
    };

    let prevMetric = "";
    for (const r of rows) {
      if (r.metric !== prevMetric) {
        close();
        prevMetric = r.metric;
      }
      const liveSample = r.value > 0;
      if (cur && (!liveSample || r.ts - cur.end > GAP_MS)) close(!liveSample);
      if (!liveSample) continue;

      if (!cur) {
        const m = /^viewers:([^:]+):(.+)$/.exec(r.metric);
        cur = {
          streamerId: m?.[2] ?? r.metric,
          platform: m?.[1] ?? "?",
          start: r.ts,
          end: r.ts,
          ongoing: false,
          peak: r.value,
          avg: 0,
          sum: 0,
          n: 0,
        };
      }
      cur.end = r.ts;
      cur.peak = Math.max(cur.peak, r.value);
      cur.sum += r.value;
      cur.n += 1;
    }
    close();

    sessions.sort((a, b) => b.start - a.start);
    return NextResponse.json({ from, to, sessions } satisfies AdminSessionsPayload);
  } catch (err) {
    console.error("[admin/stats/sessions]", err);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
