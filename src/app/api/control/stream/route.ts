import type { NextRequest } from "next/server";

import { getControlState, subscribeControl, type ControlState } from "@/lib/server/control";

export const dynamic = "force-dynamic";
// Vercel Fluid Compute caps streaming responses — without this the SSE feed drops to ~10s
// on Hobby and ~60s on Pro. No-op on every other runtime, so safe to leave on for all hosts.
export const maxDuration = 300;

const KEEPALIVE_MS = 25_000;

/**
 * The live control stream: announcement, feature flags, and the active poll, pushed the moment
 * they change. Viewers hold one EventSource each; vote tallies are coalesced server-side to at
 * most one frame per second, so thousands of connections stay cheap.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: ControlState) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(s)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };

      send(getControlState());
      const unsubscribe = subscribeControl(send);

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ka\n\n"));
        } catch {
          /* stream already closed */
        }
      }, KEEPALIVE_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
