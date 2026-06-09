import type { FeedMessage } from "@/lib/feed/types";

/**
 * One interface every chat source implements. Twitch IRC, Kick Pusher, X, and the design-shell mock
 * all conform to `ChatProvider`: they take a sink and push normalized `FeedMessage`s into it. The
 * aggregator never learns which network a line came from, so adding a provider is a single adapter.
 */

export interface ChatSink {
  /** Emit one normalized message into the unified stream. */
  message(msg: FeedMessage): void;
  /** Report connection state for a provider (drives the status dots). */
  status?(state: ProviderStatus): void;
}

export type ProviderStatus = "connecting" | "open" | "closed" | "error";

export interface ProviderHandle {
  stop(): void;
}

export interface ChatProvider {
  /** Stable identifier, e.g. "twitch", "kick", "x", "mock". */
  id: string;
  start(sink: ChatSink): ProviderHandle;
}
