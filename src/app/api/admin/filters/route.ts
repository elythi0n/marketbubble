import { type NextRequest, NextResponse } from "next/server";

import { getControlState, setGlobalFilters } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/** Replaces the operator chat filter set (pushed to every viewer over the control stream). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { filters?: { pattern?: string; action?: string; field?: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.filters)) {
    return NextResponse.json({ error: "filters array required" }, { status: 400 });
  }
  setGlobalFilters(body.filters);
  return NextResponse.json({ filters: getControlState().filters });
}

/** Clears every operator filter. */
export async function DELETE(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  setGlobalFilters(null);
  return NextResponse.json({ filters: [] });
}
