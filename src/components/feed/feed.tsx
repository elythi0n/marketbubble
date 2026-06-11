"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ArrowDown, type LucideProps } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { FeedMessage } from "@/lib/feed/types";
import { FeedRow, type FeedDensity } from "./feed-row";
import styles from "./feed.module.css";

/** Estimated row height; must match the virtualizer's estimateSize below (used as a fallback). */
const ROW_ESTIMATE = 28;

// Scroll compensation must run before paint to avoid a visible jump, but useLayoutEffect warns
// during SSR. Fall back to useEffect on the server (where there's no scroll position anyway).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface FeedProps {
  messages: readonly FeedMessage[];
  density?: FeedDensity;
  showTimestamps?: boolean;
  showSource?: boolean;
  showDeleted?: boolean;
  emptyLabel?: string;
  emptySubtext?: string;
  emptyIcon?: ComponentType<LucideProps>;
  /** Font-size multiplier for the whole feed (chat zoom). */
  scale?: number;
  /** When true, incoming rows animate in — pairs with the useReadHelper throttle. */
  readHelper?: boolean;
  /** When set, author names become clickable (used for the author focus filter). */
  onAuthorClick?: (author: string) => void;
  /** When set, chat rows get a right-click context menu. */
  onRowContextMenu?: (e: React.MouseEvent, message: FeedMessage) => void;
  /** When set, rows are clickable (used to jump from search results back to the live feed). */
  onRowClick?: (message: FeedMessage) => void;
  /** Scroll to and flash a message; bump `nonce` to re-trigger for the same id. */
  jumpTo?: { id: string; nonce: number } | null;
}

/**
 * Virtualized chat feed. Pins to the bottom while the reader is at the bottom; when they scroll up
 * it stops auto-scrolling and surfaces a "N new" pill that counts messages since they left.
 */
export function Feed({
  messages,
  density = "cozy",
  showTimestamps = true,
  showSource = false,
  showDeleted = false,
  emptyLabel = "Waiting for chat…",
  emptySubtext,
  emptyIcon: EmptyIcon,
  scale = 1,
  readHelper = false,
  onAuthorClick,
  onRowContextMenu,
  onRowClick,
  jumpTo = null,
}: FeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const stickRef = useRef(stick);
  stickRef.current = stick;
  const firstPaint = useRef(true);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 14,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    if (messages.length === 0) return;
    if (firstPaint.current || stickRef.current) {
      firstPaint.current = false;
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // The aggregator caps its buffer and drops the oldest messages off the front on every flush. When
  // the reader has scrolled up, those drops shrink the content above the viewport while the browser
  // keeps scrollTop fixed — so what they're reading slides upward. Compensate by subtracting the
  // height of the rows that fell off the front, holding the view still. (When stuck to the bottom we
  // want to follow new messages instead, so this is a no-op there.)
  const prevMessagesRef = useRef(messages);
  useIsomorphicLayoutEffect(() => {
    const prev = prevMessagesRef.current;
    prevMessagesRef.current = messages;
    const el = scrollRef.current;
    if (!el || stickRef.current || prev === messages || prev.length === 0 || messages.length === 0) return;
    const newFirstId = messages[0].id;
    if (prev[0]?.id === newFirstId) return; // nothing fell off the front
    const dropped = prev.findIndex((m) => m.id === newFirstId);
    if (dropped <= 0) return; // the new head isn't in the old buffer, or nothing was dropped
    const cache = (virtualizer as unknown as { itemSizeCache?: Map<unknown, number> }).itemSizeCache;
    let removed = 0;
    for (let i = 0; i < dropped; i += 1) removed += cache?.get(prev[i].id) ?? ROW_ESTIMATE;
    if (removed > 0) el.scrollTop = Math.max(0, el.scrollTop - removed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 28;
    if (atBottom !== stickRef.current) {
      setStick(atBottom);
      setAnchorMs(atBottom ? null : (messages[messages.length - 1]?.tsMs ?? null));
    }
  };

  const jumpToLatest = () => {
    setStick(true);
    setAnchorMs(null);
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  };

  // Row heights change when the zoom changes; force the virtualizer to re-measure.
  useEffect(() => {
    virtualizer.measure();
    if (stickRef.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // The virtualizer caches a measured size per item key forever; with message ids rotating
  // through a capped buffer that map grows without bound over a long session. Periodically drop
  // entries for ids no longer in the buffer (they can never be read again).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    const id = setInterval(() => {
      const cache = (virtualizer as unknown as { itemSizeCache?: Map<unknown, number> }).itemSizeCache;
      if (!cache || cache.size <= 1500) return;
      const live = new Set<unknown>(messagesRef.current.map((m) => m.id));
      for (const key of cache.keys()) {
        if (!live.has(key)) cache.delete(key);
      }
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump-to-message (from a clicked search result): unstick, center the row, flash it briefly.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTo) return;
    const index = messages.findIndex((m) => m.id === jumpTo.id);
    if (index < 0) return;
    setStick(false);
    stickRef.current = false;
    setAnchorMs(messages[messages.length - 1]?.tsMs ?? null);
    virtualizer.scrollToIndex(index, { align: "center" });
    setFlashId(jumpTo.id);
    const timer = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.nonce]);

  const unread = anchorMs == null ? 0 : messages.reduce((n, m) => (m.tsMs > anchorMs ? n + 1 : n), 0);
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={`${styles.root}${readHelper ? ` ${styles.readHelper}` : ""}`}
      style={{ ["--feed-scale" as string]: scale }}
    >
      <div ref={scrollRef} className={`${styles.scroll} mb-scroll`} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            {EmptyIcon ? <EmptyIcon className={styles.emptyIcon} /> : null}
            <span className={styles.emptyLabel}>{emptyLabel}</span>
            {emptySubtext ? <span className={styles.emptySubtext}>{emptySubtext}</span> : null}
          </div>
        ) : (
          <div className={styles.inner} style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map((vi) => (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className={`${styles.item}${flashId === messages[vi.index]?.id ? ` ${styles.flash}` : ""}${onRowClick ? ` ${styles.clickable}` : ""}`}
                style={{ transform: `translateY(${vi.start}px)` }}
                onClick={onRowClick ? () => onRowClick(messages[vi.index]) : undefined}
              >
                <FeedRow
                  message={messages[vi.index]}
                  density={density}
                  showTimestamps={showTimestamps}
                  showSource={showSource}
                  showDeleted={showDeleted}
                  onAuthorClick={onAuthorClick}
                  onRowContextMenu={onRowContextMenu}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {!stick ? (
        <button type="button" className={styles.pill} onClick={jumpToLatest}>
          <span>{unread > 0 ? `${unread} new message${unread === 1 ? "" : "s"}` : "Jump to latest"}</span>
          <ArrowDown className={styles.pillArrow} />
        </button>
      ) : null}
    </div>
  );
}
