import { type NextRequest, NextResponse } from "next/server";

import { listClipMoments, setClipMomentStatus, type ClipMoment } from "@/lib/server/clip-radar";
import { adminAuthorized, adminEnabled } from "../../auth";

export const dynamic = "force-dynamic";

export interface ClipMomentsPayload {
  moments: ClipMoment[];
}

export async function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 30;
  const moments = await listClipMoments(limit);
  return NextResponse.json({ moments } satisfies ClipMomentsPayload);
}

/** Review action: { id, status: "kept" | "dismissed" }. */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { id?: string; status?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!body.id || (body.status !== "kept" && body.status !== "dismissed")) {
    return NextResponse.json({ error: "expected { id, status: kept|dismissed }" }, { status: 400 });
  }
  const ok = await setClipMomentStatus(body.id, body.status);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "no such moment" }, { status: 404 });
}
