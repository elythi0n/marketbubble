/**
 * Drives the automatic X-broadcast pipeline for a set of configured sources (handles or links).
 *
 * Per source, an independent loop: discover a live broadcast, read its chat into the shared X buffer
 * (the very same buffer the browser extension feeds, so the extension stays first-class and the two
 * coexist, de-duplicated by id), and when the broadcast ends, go back to polling for the next one.
 *
 * Discovery returning nothing IS the "are they live?" gate, so no separate liveness check is needed;
 * a Twitch/Kick "live elsewhere" signal could later be plugged in here to throttle discovery further.
 */

import { pushMessages, type XChatMessage } from "../chat-buffer";
import { resolveBroadcast } from "./discovery";
import { XBroadcastReader, type BroadcastChatMessage } from "./reader";

export interface BridgeOptions {
  /** Each entry is an @handle, a broadcast link, or a bare broadcast id. */
  sources: string[];
  /** How often to look for a (new) live broadcast while a source is idle. */
  pollMs?: number;
  log?: (line: string) => void;
}

function toBufferMessage(msg: BroadcastChatMessage, channel: string | undefined): XChatMessage {
  return {
    id: `xb:${msg.id}`, // namespaced so it never collides with extension-sourced ids
    authorHandle: msg.user,
    authorName: msg.user,
    text: msg.text,
    timestamp: new Date(msg.ts).toISOString(),
    channel,
  };
}

function runSource(source: string, pollMs: number, log: (l: string) => void, isStopped: () => boolean): () => void {
  let reader: XBroadcastReader | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const schedule = () => {
    if (cancelled || isStopped()) return;
    timer = setTimeout(tick, pollMs);
  };

  const tick = async () => {
    if (cancelled || isStopped()) return;

    const resolved = await resolveBroadcast(source);
    if (cancelled || isStopped()) return;
    if (!resolved) {
      schedule();
      return;
    }

    // Label each message with the broadcaster; backfilled from broadcast metadata for link sources.
    let channel = resolved.handle;
    let settled = false;
    const finish = (reason: string) => {
      if (settled) return;
      settled = true;
      log(`${source}: ${reason}`);
      reader?.stop();
      reader = null;
      schedule();
    };

    reader = new XBroadcastReader(resolved.id, {
      onMessage: (m) => pushMessages([toBufferMessage(m, channel)]),
      onMeta: (meta) => {
        if (meta.broadcaster && !channel) channel = meta.broadcaster;
      },
      onState: (state) => {
        if (state === "ended") finish(`broadcast ${resolved.id} ended`);
      },
      log,
    });

    log(`${source}: connecting to broadcast ${resolved.id} (via ${resolved.via})`);
    await reader.start();
  };

  void tick();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    reader?.stop();
    reader = null;
  };
}

/** Start watching every configured source. Returns a stop function. */
export function startXBroadcastBridge(opts: BridgeOptions): () => void {
  const pollMs = opts.pollMs ?? 60_000;
  const log = opts.log ?? ((line: string) => console.log(`[x-bridge] ${line}`));
  let stopped = false;

  const stoppers = opts.sources.map((source) => runSource(source, pollMs, log, () => stopped));

  return () => {
    stopped = true;
    for (const stop of stoppers) stop();
  };
}
