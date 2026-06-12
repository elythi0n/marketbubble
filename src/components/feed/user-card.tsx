"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AtSign, X } from "lucide-react";

import type { ChatterStatsPayload } from "@/app/api/chatter/route";
import { clampForContrast } from "@/lib/feed/contrast";
import { messageText } from "@/lib/feed/text";
import { PLATFORM_LABEL, type FeedMessage, type Platform } from "@/lib/feed/types";
import { cn } from "@/lib/utils";
import { PlatformGlyph } from "./platform-glyph";

/**
 * User card: click a chat author → an anchored popover with their session stats, all-time tally
 * (from the durable chatters table), and recent message history from the local buffer.
 * View-only by design — no moderation here (that needs platform auth we don't hold).
 */

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

interface CardTarget {
  author: string;
  platform: Platform;
  authorColor?: string;
  x: number;
  y: number;
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 leading-tight">
      <p className="text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[0.92rem] font-bold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 text-[0.6rem] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function UserCardBody({
  target,
  messages,
  focused,
  onFocusToggle,
  onClose,
}: {
  target: CardTarget;
  messages: readonly FeedMessage[];
  focused: boolean;
  onFocusToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(target.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(target.y + 8, window.innerHeight - r.height - 8)),
    });
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Their messages this session, newest first (chat rows only — events would skew the stats).
  const authorLc = target.author.toLowerCase();
  const { own, sessionCount } = useMemo(() => {
    const all = messages.filter(
      (m) => m.platform === target.platform && m.author.toLowerCase() === authorLc && m.segments.length > 0,
    );
    return { own: all.slice(-60).reverse(), sessionCount: all.length };
  }, [messages, target.platform, authorLc]);
  const share = messages.length > 0 ? (sessionCount / messages.length) * 100 : 0;
  const latest = own[0];
  const roles = (latest?.badges ?? []).map((b) => ROLE_LABEL[b.set] ?? b.set).filter(Boolean).slice(0, 4);

  // All-time tally from the durable leaderboard data.
  const [allTime, setAllTime] = useState<ChatterStatsPayload | null>(null);
  useEffect(() => {
    let stale = false;
    fetch(`/api/chatter?platform=${encodeURIComponent(target.platform)}&name=${encodeURIComponent(target.author)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ChatterStatsPayload | null) => {
        if (!stale && d) setAllTime(d);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [target.platform, target.author]);

  const color = clampForContrast(target.authorColor);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${target.author} — chatter card`}
      style={pos}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[151] flex w-[19rem] flex-col rounded-xl border border-white/12 bg-[#1b1b1f] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.9)]"
    >
      <header className="flex items-center gap-2.5 border-b border-white/[0.07] px-3 py-2.5">
        <span
          className="flex size-8 flex-none items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[0.8rem] font-bold"
          style={{ color }}
          aria-hidden
        >
          {target.author.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[0.88rem] font-semibold" style={{ color }}>
            {target.author}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[0.62rem] text-muted-foreground">
            <PlatformGlyph platform={target.platform} className="size-2.5" />
            {PLATFORM_LABEL[target.platform]}
            {latest?.channel ? ` · ${latest.channel}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="flex flex-col gap-2.5 px-3 py-2.5">
        {roles.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => (
              <span key={r} className="rounded border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[0.6rem] font-medium text-foreground/80">
                {r}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-1.5">
          <StatTile label="Session" value={String(sessionCount)} sub={share >= 0.05 ? `${share.toFixed(1)}% of chat` : undefined} />
          <StatTile
            label="All-time"
            value={allTime?.allTime != null ? formatCount(allTime.allTime) : "—"}
            sub={allTime?.rank != null ? `#${allTime.rank} overall` : undefined}
          />
          <StatTile
            label="Last seen"
            value={latest ? latest.ts : allTime?.lastActive ? new Date(allTime.lastActive).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
          />
        </div>

        <div>
          <p className="mb-1 text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            History · this session
          </p>
          {own.length === 0 ? (
            <p className="py-1 text-[0.7rem] text-muted-foreground">Nothing from them in the buffer yet.</p>
          ) : (
            <ul className="mb-scroll flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {own.map((m) => (
                <li key={m.id} className="flex gap-1.5 text-[0.7rem] leading-snug">
                  <span className="flex-none font-mono text-[0.6rem] tabular-nums text-muted-foreground/70">{m.ts}</span>
                  <span className={cn("min-w-0 break-words text-foreground/85", m.deleted && "line-through opacity-50")}>
                    {messageText(m) || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-2">
        <button
          type="button"
          onClick={onFocusToggle}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[0.7rem] font-medium transition-colors",
            focused
              ? "border-[#46c45a]/30 bg-[#46c45a]/[0.1] text-[#46c45a] hover:bg-[#46c45a]/[0.16]"
              : "border-white/12 bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
          )}
        >
          <AtSign className="size-3" />
          {focused ? "Focused — clear" : "Focus messages"}
        </button>
        <span className="ml-auto text-[0.6rem] text-muted-foreground/70">Right-click a message for more</span>
      </footer>
    </div>
  );
}

interface UseUserCardOptions {
  messages: readonly FeedMessage[];
  focusAuthor: string | null;
  setFocusAuthor: (author: string | null) => void;
}

/** Hook wiring: hand `openUserCard` to the feed's author clicks, render `userCardElement`. */
export function useUserCard({ messages, focusAuthor, setFocusAuthor }: UseUserCardOptions): {
  openUserCard: (author: string, message: FeedMessage, e: ReactMouseEvent) => void;
  userCardElement: ReactNode;
} {
  const [target, setTarget] = useState<CardTarget | null>(null);

  const openUserCard = useCallback((author: string, message: FeedMessage, e: ReactMouseEvent) => {
    setTarget({ author, platform: message.platform, authorColor: message.authorColor, x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  let userCardElement: ReactNode = null;
  if (target && typeof document !== "undefined") {
    const focused = focusAuthor?.toLowerCase() === target.author.toLowerCase();
    userCardElement = createPortal(
      <>
        <div className="fixed inset-0 z-[150]" onClick={close} aria-hidden />
        <UserCardBody
          target={target}
          messages={messages}
          focused={focused}
          onFocusToggle={() => setFocusAuthor(focused ? null : target.author)}
          onClose={close}
        />
      </>,
      document.body,
    );
  }

  return { openUserCard, userCardElement };
}
