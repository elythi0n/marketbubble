"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowDown, type LucideProps } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { FeedMessage } from "@/lib/feed/types";
import { FeedRow, type FeedDensity } from "./feed-row";
import styles from "./feed.module.css";

interface FeedProps {
  messages: readonly FeedMessage[];
  density?: FeedDensity;
  showTimestamps?: boolean;
  showSource?: boolean;
  emptyLabel?: string;
  emptySubtext?: string;
  emptyIcon?: ComponentType<LucideProps>;
  /** Font-size multiplier for the whole feed (chat zoom). */
  scale?: number;
  /** When true, incoming rows animate in — pairs with the useReadHelper throttle. */
  readHelper?: boolean;
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
  emptyLabel = "Waiting for chat…",
  emptySubtext,
  emptyIcon: EmptyIcon,
  scale = 1,
  readHelper = false,
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
    estimateSize: () => 28,
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
                className={styles.item}
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <FeedRow
                  message={messages[vi.index]}
                  density={density}
                  showTimestamps={showTimestamps}
                  showSource={showSource}
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
