import { type NextRequest, NextResponse } from "next/server";

import { getControlState, setFlag } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/** Runtime feature override: {key, enabled}. Missing keys mean enabled; restarts reset. */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { key?: string; enabled?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!body.key || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "key and enabled required" }, { status: 400 });
  }
  setFlag(body.key, body.enabled);
  return NextResponse.json({ flags: getControlState().flags });
}
