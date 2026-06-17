import { type NextRequest, NextResponse } from "next/server";

import { getControlState, setXBroadcastOverride } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/**
 * Pin or clear an X broadcast for a configured source. Body: { source, link }.
 *   - `link` is a `x.com/i/broadcasts/<id>` URL OR a bare broadcast id.
 *   - `link === null | ""` clears the pin and returns the source to auto-discovery.
 *
 * Validation is strict — the bridge connects directly to whatever id we accept here, so a malformed
 * value would just fail at the WebSocket layer and look like discovery is broken. Better to reject
 * outright with a 400.
 */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { source?: unknown; link?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (typeof body.source !== "string" || body.source.trim() === "") {
    return NextResponse.json({ error: "source required" }, { status: 400 });
  }
  const link = body.link === null || body.link === undefined ? null : String(body.link);
  const err = setXBroadcastOverride(body.source, link);
  if (err === "unknown_source") {
    return NextResponse.json(
      { error: `source "${body.source}" is not in the configured roster` },
      { status: 404 },
    );
  }
  if (err === "invalid_link") {
    return NextResponse.json(
      { error: "link must be an x.com/i/broadcasts/<id> URL or a bare broadcast id" },
      { status: 400 },
    );
  }
  if (err === "empty") {
    return NextResponse.json({ error: "source required" }, { status: 400 });
  }
  return NextResponse.json({ xBroadcastOverrides: getControlState().xBroadcastOverrides });
}
