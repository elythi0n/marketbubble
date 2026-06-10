import { type NextRequest, NextResponse } from "next/server";

import { clearAnnouncement, getAnnouncement, setAnnouncement } from "@/lib/server/announcement";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/** Sets the dashboard announcement banner (in-memory; restart clears it). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "expected JSON with message" }, { status: 400 });
  }
  setAnnouncement(String(body.message ?? ""));
  return NextResponse.json({ announcement: getAnnouncement() });
}

export async function DELETE(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  clearAnnouncement();
  return NextResponse.json({ announcement: null });
}
