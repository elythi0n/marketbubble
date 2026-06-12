import { type NextRequest, NextResponse } from "next/server";

import {
  getClipRadarConfig,
  getClipRadarStatus,
  setClipRadarConfig,
  type ClipRadarConfig,
  type ClipRadarStatus,
} from "@/lib/server/clip-radar";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

export interface ClipRadarPayload {
  config: ClipRadarConfig;
  status: ClipRadarStatus;
}

export function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  return NextResponse.json({ config: getClipRadarConfig(), status: getClipRadarStatus() } satisfies ClipRadarPayload);
}

/** Partial config update — only the provided keys change. */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let patch: Partial<ClipRadarConfig>;
  try {
    patch = (await req.json()) as Partial<ClipRadarConfig>;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  const config = setClipRadarConfig(patch);
  return NextResponse.json({ config, status: getClipRadarStatus() } satisfies ClipRadarPayload);
}
