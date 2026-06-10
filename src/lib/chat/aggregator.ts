import type { FeedMessage } from "@/lib/feed/types";
import type { ChatProvider, ProviderHandle, ProviderStatus } from "./provider";

export type FeedListener = (messages: readonly FeedMessage[]) => void;
export type StatusListener = (statuses: Readonly<Record<string, ProviderStatus>>) => void;

/**
 * Merges any number of providers into one ordered, capped message stream and fans it out to React
 * subscribers. Incoming messages are coalesced on a short timer so a burst of chat triggers one
 * render rather than dozens.
 */
export class ChatAggregator {
  private messages: FeedMessage[] = [];
  private providers: ChatProvider[] = [];
  private handles: ProviderHandle[] = [];
  private feedListeners = new Set<FeedListener>();
  private statusListeners = new Set<StatusListener>();
  private statuses: Record<string, ProviderStatus> = {};
  private pending: FeedMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cap: number;
  private readonly flushMs: number;

  constructor(cap = 500, flushMs = 90) {
    this.cap = cap;
    this.flushMs = flushMs;
  }

  register(provider: ChatProvider): void {
    this.providers.push(provider);
  }

  /** Pre-loads persisted history (before start); live messages append after it. */
  seed(messages: readonly FeedMessage[]): void {
    if (messages.length === 0) return;
    this.messages = messages.slice(-this.cap);
  }

  start(): void {
    this.handles = this.providers.map((provider) =>
      provider.start({
        message: (msg) => this.enqueue(msg),
        status: (state) => this.setStatus(provider.id, state),
      }),
    );
  }

  stop(): void {
    for (const handle of this.handles) handle.stop();
    this.handles = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  subscribe(listener: FeedListener): () => void {
    this.feedListeners.add(listener);
    listener(this.messages);
    return () => {
      this.feedListeners.delete(listener);
    };
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.statuses);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private enqueue(msg: FeedMessage): void {
    this.pending.push(msg);
    // Hidden tabs throttle timers to ~1/min while WebSockets keep delivering; without a cap the
    // pending buffer can balloon during a long background stint. Older overflow is what the 500-cap
    // buffer would discard at the next flush anyway.
    if (this.pending.length > 4 * this.cap) {
      this.pending.splice(0, this.pending.length - 2 * this.cap);
    }
    if (this.flushTimer == null) {
      // No point painting at 11Hz in a hidden tab — batch once a second until it's visible again.
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      this.flushTimer = setTimeout(() => this.flush(), hidden ? 1000 : this.flushMs);
    }
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    // Messages arrive close to in-order; a tail sort keeps cross-platform interleaving correct
    // without re-sorting the whole buffer.
    batch.sort((a, b) => a.tsMs - b.tsMs);
    const next = this.messages.concat(batch);
    this.messages = next.length > this.cap ? next.slice(next.length - this.cap) : next;
    for (const listener of this.feedListeners) listener(this.messages);
  }

  private setStatus(id: string, state: ProviderStatus): void {
    this.statuses = { ...this.statuses, [id]: state };
    for (const listener of this.statusListeners) listener(this.statuses);
  }
}
