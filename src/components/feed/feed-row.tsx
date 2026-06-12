"use client";

import { memo, useMemo, type CSSProperties, type ReactNode } from "react";

import { clampForContrast } from "@/lib/feed/contrast";
import { EVENT_LABEL, PLATFORM_LABEL, isEventType, type FeedMessage, type Segment } from "@/lib/feed/types";
import { getTicker } from "@/lib/markets/lookup";
import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useSettingsOrDefault } from "@/lib/settings/settings-context";
import { formatChange, formatPrice } from "@/lib/markets/types";
import { HoverCard } from "./hover-card";
import { PlatformGlyph } from "./platform-glyph";
import styles from "./feed-row.module.css";

const ROLE_LABEL: Record<string, string> = {
  broadcaster: "Host",
  moderator: "Moderator",
  subscriber: "Subscriber",
  founder: "Founder",
  vip: "VIP",
  staff: "Staff",
  verified: "Verified",
  premium: "Premium",
  artist: "Artist",
};

/** Market data card shown when hovering a $cashtag. */
function CashtagInfo({ symbol }: { symbol: string }) {
  const ticker = getTicker(symbol);
  const up = (ticker?.changePct ?? 0) >= 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-bold text-[#d8b25a]">${symbol}</span>
        {ticker ? (
          <span className={`font-mono text-xs font-medium tabular-nums ${up ? "text-[#46c45a]" : "text-[#ef6a61]"}`}>
            {formatChange(ticker.changePct)}
          </span>
        ) : null}
      </div>
      {ticker ? (
        <>
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">{ticker.name}</div>
          <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-foreground">{formatPrice(ticker.price)}</div>
        </>
      ) : (
        <div className="mt-1 text-[0.72rem] text-muted-foreground">No live market data yet.</div>
      )}
    </div>
  );
}

/** Viewer card shown when hovering a chat author. */
function ViewerInfo({ message }: { message: FeedMessage }) {
  const roles = (message.badges ?? []).map((b) => ROLE_LABEL[b.set] ?? b.set).filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground" style={{ color: clampForContrast(message.authorColor) }}>
          {message.author}
        </span>
        <PlatformGlyph platform={message.platform} className="size-3.5" />
      </div>
      <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
        {message.platform === "x" ? "Posting on" : "Chatting on"} {PLATFORM_LABEL[message.platform]}
        {message.channel ? ` · ${message.channel}` : ""}
      </div>
      {roles.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {roles.map((r) => (
            <span key={r} className="rounded border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[0.62rem] font-medium text-foreground/80">
              {r}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type FeedDensity = "compact" | "cozy" | "comfortable";

interface FeedRowProps {
  message: FeedMessage;
  density?: FeedDensity;
  showTimestamps?: boolean;
  showSource?: boolean;
  showDeleted?: boolean;
  /** When set, the author name becomes clickable (opens the user card / focus, per pane). */
  onAuthorClick?: (author: string, message: FeedMessage, e: React.MouseEvent) => void;
  /** When set, the row gets a right-click context menu. */
  onRowContextMenu?: (e: React.MouseEvent, message: FeedMessage) => void;
}

const BADGE_META: Record<string, { label: string; color: string }> = {
  broadcaster: { label: "HOST", color: "var(--feed-danger)" },
  moderator: { label: "MOD", color: "var(--feed-ok)" },
  subscriber: { label: "SUB", color: "var(--feed-link)" },
  founder: { label: "FND", color: "var(--feed-warn)" },
  vip: { label: "VIP", color: "var(--feed-warn)" },
  staff: { label: "STAFF", color: "var(--feed-link)" },
  verified: { label: "✓", color: "var(--feed-link)" },
  premium: { label: "PRM", color: "var(--feed-link)" },
  artist: { label: "ART", color: "var(--feed-warn)" },
};

const EVENT_CLASS: Record<string, string> = {
  sub: styles.evSub,
  resub: styles.evResub,
  giftsub: styles.evGiftsub,
  raid: styles.evRaid,
  host: styles.evHost,
  follow: styles.evFollow,
  announcement: styles.evAnnouncement,
  moderation: styles.evModeration,
  system: styles.evSystem,
};

function badgeLabel(set: string): string {
  return BADGE_META[set]?.label ?? set.slice(0, 3).toUpperCase();
}
function badgeColor(set: string): string {
  return BADGE_META[set]?.color ?? "var(--feed-text-2)";
}

function makeRenderSegment(openStock: (s: string) => void) {
  return function renderSegment(seg: Segment, i: number): ReactNode {
    switch (seg.type) {
      case "text":
        return seg.text;
      case "emote":
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} className={styles.emote} src={seg.url} alt={seg.code} title={seg.code} loading="lazy" />;
      case "mention":
        return (
          <span key={i} className={styles.mention}>
            @{seg.user}
          </span>
        );
      case "cashtag":
        return (
          <HoverCard key={i} content={<CashtagInfo symbol={seg.symbol} />}>
            <button
              type="button"
              className={styles.cashtag}
              onClick={() => openStock(seg.symbol)}
            >
              ${seg.symbol}
            </button>
          </HoverCard>
        );
      case "link":
        return (
          <a key={i} className={styles.link} href={seg.href} target="_blank" rel="noreferrer noopener">
            {seg.text}
          </a>
        );
    }
  };
}

function eventText(message: FeedMessage, renderSegment: (seg: Segment, i: number) => ReactNode): ReactNode {
  const who = <b>{message.author}</b>;
  const e = message.event ?? {};
  switch (message.type) {
    case "sub":
      return <>{who} subscribed</>;
    case "resub":
      return (
        <>
          {who} resubscribed{e.months ? ` for ${e.months} months` : ""}
        </>
      );
    case "giftsub":
      return <>{who} gifted subs</>;
    case "raid":
      return <>{who} raided the channel</>;
    case "host":
      return <>{who} is now hosting</>;
    case "follow":
      return <>{who} followed</>;
    case "announcement":
      return <>{message.segments.map(renderSegment)}</>;
    case "moderation":
    case "system":
      return <>{message.segments.length ? message.segments.map(renderSegment) : who}</>;
    default:
      return who;
  }
}

function FeedRowImpl({
  message,
  density = "cozy",
  showTimestamps = true,
  showSource = false,
  showDeleted = false,
  onAuthorClick,
  onRowContextMenu,
}: FeedRowProps) {
  const { openStock } = useStockDrawer();
  const { emphasizeStreamer } = useSettingsOrDefault();
  const renderSegment = useMemo(() => makeRenderSegment(openStock), [openStock]);
  const densityClass = density === "compact" ? styles.compact : density === "comfortable" ? styles.comfortable : "";

  if (isEventType(message.type)) {
    const count = message.event?.count ?? message.event?.viewers;
    const big = (message.event?.viewers ?? 0) >= 50 || (message.event?.count ?? 0) >= 5;
    return (
      <div className={`${styles.event} ${EVENT_CLASS[message.type ?? "system"] ?? ""} ${big ? styles.big : ""}`}>
        <PlatformGlyph platform={message.platform} className={styles.glyph} />
        {showTimestamps ? <span className={styles.ts}>{message.ts}</span> : null}
        <span className={styles.eventLabel}>{EVENT_LABEL[message.type ?? "system"]}</span>
        <span className={styles.eventText}>{eventText(message, renderSegment)}</span>
        {count ? <span className={styles.eventCount}>{count.toLocaleString()}</span> : null}
      </div>
    );
  }

  const badges = message.badges ?? [];
  const authorStyle: CSSProperties = { color: clampForContrast(message.authorColor) };
  const isAction = message.type === "action";
  const isBroadcaster = emphasizeStreamer && badges.some((b) => b.set === "broadcaster");

  return (
    <div
      className={`${styles.row} ${styles[message.platform]} ${densityClass} ${isAction ? styles.action : ""} ${message.highlighted ? styles.highlighted : ""} ${isBroadcaster ? styles.broadcaster : ""}`}
      onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(e, message) : undefined}
    >
      {message.replyTo ? (
        <span className={styles.reply}>
          ↩ {message.replyTo.author}: {message.replyTo.snippet}
        </span>
      ) : null}

      {/* One inline flow: meta · username · message, wrapping together like native chat. */}
      <PlatformGlyph platform={message.platform} className={styles.metaGlyph} />
      {showTimestamps ? <span className={styles.ts}>{message.ts}</span> : null}
      {showSource && message.channel ? <span className={styles.channel}>{message.channel}</span> : null}
      {badges.length > 0 ? (
        <span className={styles.badges}>
          {badges.slice(0, 3).map((b, i) =>
            b.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} className={styles.badgeImg} src={b.url} alt={b.title ?? b.set} title={b.title ?? b.set} />
            ) : (
              <span key={i} className={styles.badge} style={{ color: badgeColor(b.set) }} title={b.title ?? b.set}>
                {badgeLabel(b.set)}
              </span>
            ),
          )}
          {badges.length > 3 ? <span className={styles.badgeMore}>+{badges.length - 3}</span> : null}
        </span>
      ) : null}
      <HoverCard className={styles.author} content={<ViewerInfo message={message} />}>
        <span
          style={authorStyle}
          className={onAuthorClick ? styles.authorClickable : undefined}
          onClick={onAuthorClick ? (e) => onAuthorClick(message.author, message, e) : undefined}
          title={onAuthorClick ? `About ${message.author}` : undefined}
        >
          {message.author}
        </span>
      </HoverCard>
      {isAction ? null : <span className={styles.colon}>:</span>}
      {message.combo && message.combo > 1 ? <span className={styles.combo}>×{message.combo}</span> : null}
      <span className={styles.body}>
        {message.deleted && !showDeleted ? (
          <span className={styles.tombstone}>message deleted</span>
        ) : message.deleted ? (
          <span className={styles.struck}>{message.segments.map(renderSegment)}</span>
        ) : (
          message.segments.map(renderSegment)
        )}
      </span>
    </div>
  );
}

export const FeedRow = memo(FeedRowImpl);
