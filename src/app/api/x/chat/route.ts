import { type NextRequest, NextResponse } from "next/server";

import { getMessages, pushMessages, type XChatMessage } from "@/lib/x/chat-buffer";

// Never cache — this is a live in-process buffer.
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const key = process.env.X_CHAT_API_KEY;
  if (!key) return false; // reject everything when not configured
  return req.headers.get("x-api-key") === key;
}

/** Chat provider polls this every ~2s to receive new messages. */
export function GET() {
  return NextResponse.json(getMessages());
}

/** Extension POSTs batches of chat messages here. */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }

  const result = pushMessages(body.messages as XChatMessage[]);
  return NextResponse.json(result);
}
