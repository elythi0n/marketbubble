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
  /**
   * How often to look for a (new) live broadcast while a source is idle. A function is consulted
   * before each wait, letting the caller poll eagerly around the scheduled slot and slowly
   * off-hours (X's guest endpoints rate-limit by IP, so idle polling should stay light).
   */
  pollMs?: number | (() => number);
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

/**
 * Live status + occupancy (viewer count) per X source, keyed by normalized handle / broadcast id.
 * The dashboard reads it through /api/x/stream so X-only channels can show real viewer numbers,
 * the same way Twitch/Kick channels do. Module-level singleton, stable for the process lifetime.
 */
export interface XSourceStatus {
  live: boolean;
  viewers: number;
  title?: string;
  updatedAt: number;
}

function statusStore(): Map<string, XSourceStatus> {
  const g = globalThis as typeof globalThis & { __xSourceStatus?: Map<string, XSourceStatus> };
  return (g.__xSourceStatus ??= new Map());
}

/** Normalize a source to its lookup key: broadcast id from a link, else the bare lowercased handle. */
function normHandle(src: string): string {
  const link = /broadcasts\/([A-Za-z0-9]+)/i.exec(src);
  if (link) return link[1].toLowerCase();
  return src.trim().replace(/^@/, "").toLowerCase();
}

/** Merge a status patch onto every (defined) key — the configured source plus the broadcaster handle. */
function setSourceStatus(keys: (string | undefined)[], patch: Partial<XSourceStatus>): void {
  const store = statusStore();
  const now = Date.now();
  for (const k of keys) {
    if (!k) continue;
    const key = normHandle(k);
    if (!key) continue;
    const prev = store.get(key) ?? { live: false, viewers: 0, updatedAt: now };
    store.set(key, { ...prev, ...patch, updatedAt: now });
  }
}

/** Latest known status for an X handle (used by /api/x/stream). */
export function getXSourceStatus(handle: string): XSourceStatus | undefined {
  return statusStore().get(normHandle(handle));
}

function runSource(
  source: string,
  pollMs: number | (() => number),
  log: (l: string) => void,
  isStopped: () => boolean,
): () => void {
  let reader: XBroadcastReader | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const schedule = () => {
    if (cancelled || isStopped()) return;
    timer = setTimeout(tick, typeof pollMs === "function" ? pollMs() : pollMs);
  };

  const tick = async () => {
    if (cancelled || isStopped()) return;

    const resolved = await resolveBroadcast(source);
    if (cancelled || isStopped()) return;
    if (!resolved) {
      // Nothing live for this source right now — mark it offline so the dashboard reflects it.
      setSourceStatus([source], { live: false, viewers: 0 });
      schedule();
      return;
    }

    // Label each message with the broadcaster; backfilled from broadcast metadata for link sources.
    let channel = resolved.handle;
    let settled = false;
    const finish = (reason: string) => {
      if (settled) return;
      settled = true;
      setSourceStatus([source, channel], { live: false, viewers: 0 });
      log(`${source}: ${reason}`);
      reader?.stop();
      reader = null;
      schedule();
    };

    reader = new XBroadcastReader(resolved.id, {
      onMessage: (m) => pushMessages([toBufferMessage(m, channel)]),
      onMeta: (meta) => {
        if (meta.broadcaster && !channel) channel = meta.broadcaster;
        // Occupancy frames carry the live viewer count; the initial show frame carries the title.
        setSourceStatus([source, channel, meta.broadcaster], {
          live: true,
          ...(typeof meta.occupancy === "number" ? { viewers: meta.occupancy } : {}),
          ...(meta.title ? { title: meta.title } : {}),
        });
      },
      onState: (state) => {
        if (state === "live") setSourceStatus([source, channel], { live: true });
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
