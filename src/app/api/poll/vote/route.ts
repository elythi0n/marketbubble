import { type NextRequest, NextResponse } from "next/server";

import { votePoll } from "@/lib/server/control";

export const dynamic = "force-dynamic";

function voterKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Public site vote: one (re-votable) vote per visitor per poll, keyed by IP. */
export async function POST(req: NextRequest) {
  let body: { pollId?: string; optionId?: string };
  try {
    body = (await req.json()) as { pollId?: string; optionId?: string };
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!body.pollId || !body.optionId) {
    return NextResponse.json({ error: "pollId and optionId required" }, { status: 400 });
  }
  try {
    const poll = votePoll(body.pollId, body.optionId, voterKey(req));
    return NextResponse.json({ ok: true, poll });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "vote failed" }, { status: 400 });
  }
}
