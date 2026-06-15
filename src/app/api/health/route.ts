import { NextResponse } from "next/server";

import { hasDatabase } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export interface HealthPayload {
  status: "ok";
  uptime: number;
  /** Whether persistence is configured (DATABASE_PATH set) AND opened successfully. */
  database: { configured: boolean; ok: boolean };
  /** Whether RELAY_URL is configured. Reachability isn't probed here — that'd make health a
   *  multi-hop request, defeating its point as a fast load-balancer / container check. */
  relay: { configured: boolean };
  timestamp: number;
}

/**
 * Public liveness probe. Returns 200 as long as the Node process is running; the body
 * surfaces enough capability info to be useful for monitoring (database configured/ok,
 * relay configured) without leaking secrets (paths, keys, internal URLs). Designed for
 * Render/Railway/Coolify/Docker healthcheck hooks — see Dockerfile/compose for the wiring.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    database: {
      configured: Boolean(process.env.DATABASE_PATH?.trim()),
      ok: hasDatabase(),
    },
    relay: { configured: Boolean(process.env.RELAY_URL?.trim()) },
    timestamp: Date.now(),
  } satisfies HealthPayload);
}
