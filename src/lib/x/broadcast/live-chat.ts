/**
 * On-demand X broadcast chat. When the dashboard is viewing a channel that has an X handle, the
 * client pings /api/x/watch and we lazily resolve that handle's live broadcast and stream its chat
 * into the shared X buffer — the same buffer the browser extension feeds and /api/x/chat serves.
 *
 * This is what makes X chat work for whatever channel is on screen, with no pre-listed handles
 * (the boot-time bridge in instrumentation.ts stays as an always-on source for the show accounts).
 * Readers are reaped once no client has pinged for ~90s, and chat-buffer de-duplicates by frame id,
 * so a broadcast read by both the bridge and an on-demand reader never double-posts.
 *
 * Server-only: the long-lived WebSocket readers live in the Node server process (same place the
 * boot bridge already runs them), so this must never be imported from a client component.
 */
import { pushMessages, type XChatMessage } from "../chat-buffer";
import { resolveBroadcast } from "./discovery";
import { XBroadcastReader, type BroadcastChatMessage } from "./reader";

interface Watch {
  reader: XBroadcastReader | null;
  resolving: boolean;
  live: boolean;
  broadcastId: string | null;
  /** Last time a client pinged for this handle — drives idle reaping. */
  lastPing: number;
  /** Earliest time we may (re)attempt discovery — throttles polling X while a handle is offline. */
  nextResolveAt: number;
}

const IDLE_MS = 90_000;
const OFFLINE_RETRY_MS = 30_000;

function store(): Map<string, Watch> {
  const g = globalThis as typeof globalThis & { __xOnDemandChat?: Map<string, Watch> };
  return (g.__xOnDemandChat ??= new Map());
}

function normHandle(h: string): string {
  return h.trim().replace(/^@/, "").toLowerCase();
}

function toBufferMessage(msg: BroadcastChatMessage, channel: string): XChatMessage {
  return {
    id: `xb:${msg.id}`, // same id scheme as the bridge → buffer dedups across both
    authorHandle: msg.user,
    authorName: msg.user,
    text: msg.text,
    timestamp: new Date(msg.ts).toISOString(),
    channel,
  };
}

function reapIdle(): void {
  const now = Date.now();
  for (const [key, w] of store()) {
    if (now - w.lastPing > IDLE_MS) {
      w.reader?.stop();
      store().delete(key);
    }
  }
}

async function startReader(handle: string, w: Watch): Promise<void> {
  w.resolving = true;
  w.nextResolveAt = Date.now() + OFFLINE_RETRY_MS; // throttle retries even if this attempt finds nothing
  try {
    const resolved = await resolveBroadcast(handle);
    if (!resolved) {
      w.live = false;
      return;
    }
    let channel = resolved.handle ?? normHandle(handle);
    const reader = new XBroadcastReader(resolved.id, {
      onMessage: (m) => pushMessages([toBufferMessage(m, channel)]),
      onMeta: (meta) => {
        if (meta.broadcaster) channel = meta.broadcaster;
      },
      onState: (state) => {
        if (state === "live") w.live = true;
        // Broadcast over → drop the reader so the next ping can pick up a fresh one.
        if (state === "ended") {
          w.live = false;
          w.reader?.stop();
          w.reader = null;
        }
        if (state === "error" || state === "stopped") w.live = false;
      },
    });
    w.reader = reader;
    w.broadcastId = resolved.id;
    w.live = true;
    void reader.start();
  } catch {
    /* transient — a later ping retries after the throttle window */
  } finally {
    w.resolving = false;
  }
}

/**
 * Keep-alive from a viewing client: mark the handle watched and ensure a reader is connecting.
 * Non-blocking — discovery runs in the background so the request returns immediately.
 */
export function ensureWatching(handle: string): { live: boolean } {
  reapIdle();
  const key = normHandle(handle);
  if (!key) return { live: false };
  let w = store().get(key);
  if (!w) {
    w = { reader: null, resolving: false, live: false, broadcastId: null, lastPing: 0, nextResolveAt: 0 };
    store().set(key, w);
  }
  w.lastPing = Date.now();
  if (!w.reader && !w.resolving && Date.now() >= w.nextResolveAt) {
    void startReader(handle, w);
  }
  return { live: w.live };
}
