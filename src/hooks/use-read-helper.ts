"use client";

import { useEffect, useRef, useState } from "react";

import type { FeedMessage } from "@/lib/feed/types";

const DRAIN_COUNT = 2;
const DRAIN_MS = 200;
const QUEUE_CAP = 200;

/**
 * Throttles a message stream to a readable pace. While enabled, new messages
 * accumulate in an internal queue and are released in small batches on a fixed
 * interval — so a fast-moving chat becomes legible instead of blurring past.
 *
 * Toggling enabled off immediately flushes the queue to the full message set.
 */
export function useReadHelper(messages: readonly FeedMessage[], enabled: boolean) {
  const [displayed, setDisplayed] = useState<readonly FeedMessage[]>(messages);
  const [queueDepth, setQueueDepth] = useState(0);

  const queue = useRef<FeedMessage[]>([]);
  const lastSeenId = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].id : null,
  );

  // On toggle: snapshot the current message set as the starting point (on),
  // or flush everything back to live (off).
  useEffect(() => {
    if (enabled) {
      setDisplayed(messages);
      queue.current = [];
      setQueueDepth(0);
      lastSeenId.current = messages.length > 0 ? messages[messages.length - 1].id : null;
    } else {
      setDisplayed(messages);
      queue.current = [];
      setQueueDepth(0);
    }
    // Intentional: only react to the enabled toggle, not to message changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // When new messages arrive and the helper is active, put them in the queue.
  useEffect(() => {
    if (!enabled) return;
    const lid = lastSeenId.current;
    let start = 0;
    if (lid !== null) {
      const idx = messages.findIndex((m) => m.id === lid);
      // If the anchor was pruned from history, treat everything as fresh.
      start = idx < 0 ? 0 : idx + 1;
    }
    if (start >= messages.length) return;
    const fresh = [...messages.slice(start)];
    lastSeenId.current = fresh[fresh.length - 1].id;
    const merged = [...queue.current, ...fresh];
    queue.current = merged.length > QUEUE_CAP ? merged.slice(-QUEUE_CAP) : merged;
    setQueueDepth(queue.current.length);
  }, [messages, enabled]);

  // Drain timer — releases a small batch at a pace the eye can track.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (!queue.current.length) return;
      const batch = queue.current.slice(0, DRAIN_COUNT);
      queue.current = queue.current.slice(DRAIN_COUNT);
      setQueueDepth(queue.current.length);
      setDisplayed((prev) => {
        const next = [...prev, ...batch];
        return next.length > 500 ? next.slice(-500) : next;
      });
    }, DRAIN_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return {
    displayed: enabled ? displayed : messages,
    queueDepth: enabled ? queueDepth : 0,
  };
}
