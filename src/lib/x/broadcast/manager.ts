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

import { getXBroadcastOverride, subscribeControl } from "@/lib/server/control";
import { normalizeXSource } from "@/lib/streamers/x-source";

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

// Single source of truth lives in lib/streamers/x-source.ts. Keep this alias so the call sites
// below read as "normalize as a handle" — semantically the same operation.
const normHandle = normalizeXSource;

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
  let currentBroadcastId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const sourceKey = normHandle(source);

  const schedule = () => {
    if (cancelled || isStopped()) return;
    timer = setTimeout(tick, typeof pollMs === "function" ? pollMs() : pollMs);
  };

  // Mid-stream override changes: when the admin pins/clears/repins this source, restart
  // immediately rather than waiting for the current broadcast to end. The subscription is one
  // shared SSE listener, cheap to register per source.
  const unsubscribe = subscribeControl(() => {
    if (cancelled || isStopped()) return;
    const override = getXBroadcastOverride(sourceKey);
    // (a) override set to a different id than we're currently reading → restart on the new id
    // (b) override cleared while we were on an override → re-resolve via discovery
    // (c) no override and not currently connected → nothing to do (the tick loop owns it)
    if (override && override !== currentBroadcastId) {
      log(`${source}: override changed to ${override} → restarting reader`);
      restart();
    } else if (!override && reader && currentBroadcastId) {
      // Was on a pin; pin cleared. Let the current reader finish naturally? No — the operator
      // explicitly cleared the pin, so re-resolve right now.
      log(`${source}: override cleared → re-resolving via discovery`);
      restart();
    }
  });

  const restart = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (reader) { reader.stop(); reader = null; }
    currentBroadcastId = null;
    void tick();
  };

  const tick = async () => {
    if (cancelled || isStopped()) return;

    // Operator override (control plane). When set, skip discovery entirely and connect straight
    // to the pinned broadcast — that's the whole point of the safety valve. When the pinned
    // broadcast ends, this loop will tick again, see the override is still set, retry the same
    // id (X returns state=ENDED and the reader exits clean) until the operator clears it.
    const overrideId = getXBroadcastOverride(normHandle(source));
    const resolved = overrideId
      ? { id: overrideId, via: "manual" as const, handle: normHandle(source) }
      : await resolveBroadcast(source);
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
      currentBroadcastId = null;
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

    currentBroadcastId = resolved.id;
    log(`${source}: connecting to broadcast ${resolved.id} (via ${resolved.via})`);
    await reader.start();
  };

  void tick();

  return () => {
    cancelled = true;
    unsubscribe();
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
