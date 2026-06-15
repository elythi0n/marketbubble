"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, MessageSquareOff, PanelTop, PanelTopClose, PanelTopDashed, PanelTopOpen } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { useFeedContext } from "@/lib/chat/feed-context";
import { useSettings } from "@/lib/settings/settings-context";
import { useFilteredMessages } from "@/lib/settings/use-filtered-messages";
import { useChannel } from "@/lib/streamers/channel-context";
import { type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, isStarting, nextOccurrence } from "@/lib/streamers/schedule";
import { useWakeLock } from "@/lib/use-wake-lock";
import { cn } from "@/lib/utils";
import { ChatPane } from "./chat-pane";
import { ClipsPane } from "./clips-pane";
import { GiftsPane, GIFT_TYPES } from "./gifts-pane";
import { StreamEmbed, StreamPane } from "./stream-pane";

function MobileOfflineView({ channel }: { channel: Streamer }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const target = channel.schedule ? nextOccurrence(channel.schedule, now) : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background px-4 py-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.04),transparent_80%)]" />

      {/* Schedule — centered; the channel identity lives in the sheet/bottom nav, not here. */}
      {channel.schedule ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {isStarting(channel.schedule, now) ? "Show is starting" : "Next stream"}
          </p>
          {isStarting(channel.schedule, now) ? (
            <p className="font-mono text-[2.2rem] font-bold leading-none text-feed-ok">soon…</p>
          ) : target ? (
            <p className="font-mono text-[2.2rem] font-bold tabular-nums leading-none text-foreground">
              {formatCountdown(target.getTime() - now.getTime())}
            </p>
          ) : null}
          <p className="font-brand-wordmark mt-1 text-[1rem] uppercase tracking-[0.04em] text-foreground/80">
            {channel.schedule.label}
          </p>
          {target ? (
            <p className="mt-0.5 text-[0.62rem] text-muted-foreground/50">
              {target.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Offline</p>
          <p className="truncate text-[1.05rem] font-bold leading-tight text-foreground">{channel.name}</p>
        </div>
      )}
    </div>
  );
}

/** Landscape theater: fullscreen player with a translucent chat column floating over the right edge. */
function TheaterChat() {
  const { messages } = useFeedContext();
  const { settings } = useSettings();
  const filtered = useFilteredMessages(messages);

  return (
    <div className="absolute inset-y-0 right-0 z-20 w-[42%] max-w-[340px] bg-gradient-to-l from-black/75 via-black/55 to-transparent pl-5 pr-[env(safe-area-inset-right)]">
      <div className="h-full [mask-image:linear-gradient(to_bottom,transparent,black_12%)]">
        <Feed
          messages={filtered}
          showSource
          scale={0.95}
          density={settings.density}
          showTimestamps={false}
          showDeleted={settings.showDeleted}
          emptyLabel="Chat is quiet"
        />
      </div>
    </div>
  );
}

function TheaterView({ channel }: { channel: Streamer }) {
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <div className="relative flex min-h-0 flex-1 bg-black">
      <StreamEmbed channel={channel} />
      {chatOpen ? <TheaterChat /> : null}
      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        aria-label={chatOpen ? "Hide chat overlay" : "Show chat overlay"}
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-2 z-30 flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-foreground backdrop-blur-sm transition-colors active:bg-black/75"
      >
        {chatOpen ? <MessageSquareOff className="size-4" /> : <MessageSquare className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Mobile-only layout modes: full stream, compact stream (bigger chat), or chat focus.
 * In focus the stream stays mounted at zero height so a live player keeps playing audio.
 */
type MobileLayout = "stream" | "compact" | "focus";

const LAYOUTS: ReadonlyArray<{ id: MobileLayout; icon: typeof PanelTop; label: string }> = [
  { id: "stream", icon: PanelTop, label: "Full-size stream" },
  { id: "compact", icon: PanelTopDashed, label: "Compact stream, bigger chat" },
  { id: "focus", icon: PanelTopClose, label: "Chat focus, hide stream" },
];

const TABS = ["chat", "gifts", "clips"] as const;
type MobileTab = (typeof TABS)[number];

/** Mobile dashboard body: stream (or offline card) on top, then Chat/Gifts/Clips tabs below. */
export function MobileWorkspace({ theater = false }: { theater?: boolean }) {
  const [tab, setTab] = useState<MobileTab>("chat");
  const [layout, setLayout] = useState<MobileLayout>("stream");
  const { selectedId, streamers } = useChannel();
  const { messages } = useFeedContext();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const offline = !channel.live;

  // Keep the screen on while someone is live (the embed alone doesn't always hold a wake lock).
  useWakeLock(!offline);

  // "New since you last looked" dots on background tabs. Seeded refs swallow the initial buffer
  // (restored history shouldn't light dots on first paint).
  const [dots, setDots] = useState<{ chat: boolean; gifts: boolean }>({ chat: false, gifts: false });
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const lastGiftId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type && GIFT_TYPES.has(m.type)) return m.id;
    }
    return null;
  }, [messages]);

  const seenMsg = useRef<string | null>(null);
  useEffect(() => {
    if (!lastMsgId) return;
    if (seenMsg.current !== null && lastMsgId !== seenMsg.current && tabRef.current !== "chat") {
      setDots((d) => (d.chat ? d : { ...d, chat: true }));
    }
    seenMsg.current = lastMsgId;
  }, [lastMsgId]);

  const seenGift = useRef<string | null>(null);
  useEffect(() => {
    if (!lastGiftId) return;
    if (seenGift.current !== null && lastGiftId !== seenGift.current && tabRef.current !== "gifts") {
      setDots((d) => (d.gifts ? d : { ...d, gifts: true }));
    }
    seenGift.current = lastGiftId;
  }, [lastGiftId]);

  const selectTab = (t: MobileTab) => {
    setTab(t);
    if (t !== "clips") setDots((d) => ({ ...d, [t]: false }));
  };

  // Horizontal swipe on the tab content switches tabs; steep or short drags stay vertical scrolls.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const i = TABS.indexOf(tab);
    const next = TABS[dx < 0 ? Math.min(i + 1, TABS.length - 1) : Math.max(i - 1, 0)];
    if (next !== tab) selectTab(next);
  };

  if (theater) return <TheaterView channel={channel} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex-none overflow-hidden border-hairline transition-[height] duration-300 ease-out",
          layout === "focus"
            ? "h-0"
            : layout === "compact"
              ? "h-[20dvh] border-b"
              : cn("border-b", offline ? "h-[30dvh]" : "h-[33dvh]"),
        )}
      >
        {offline ? <MobileOfflineView channel={channel} /> : <StreamPane />}
      </div>

      {/* While a hidden live player keeps playing, a slim strip says so and restores the stream. */}
      {layout === "focus" && !offline ? (
        <button
          type="button"
          onClick={() => setLayout("stream")}
          className="flex flex-none items-center gap-2 border-b border-hairline bg-background px-4 py-2 text-left transition-colors active:bg-overlay-weak"
        >
          <span className="relative flex size-2 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-feed-ok opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-feed-ok" />
          </span>
          <span className="min-w-0 truncate text-[0.74rem] font-semibold text-foreground">{channel.name}</span>
          <span className="flex-none text-[0.66rem] text-muted-foreground">live · playing in background</span>
          <PanelTopOpen className="ml-auto size-4 flex-none text-muted-foreground" />
        </button>
      ) : null}

      <div className="flex flex-none items-stretch border-b border-hairline bg-card">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={cn(
              "flex-1 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] transition-colors",
              tab === t ? "text-foreground shadow-[inset_0_-2px_0_0_var(--accent-strong)]" : "text-muted-foreground",
            )}
          >
            <span className="relative">
              {t === "chat" ? "Chat" : t === "gifts" ? "Gifts" : "Clips"}
              {t !== "clips" && dots[t] ? (
                <span className="absolute -right-2 top-px size-1.5 rounded-full bg-feed-ok" />
              ) : null}
            </span>
          </button>
        ))}

        {/* Layout switcher: how much of the screen the stream gets vs. chat. */}
        <div className="flex flex-none items-center gap-0.5 border-l border-hairline px-1.5">
          {LAYOUTS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayout(id)}
              aria-label={label}
              aria-pressed={layout === id}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                layout === id
                  ? "bg-overlay-medium text-foreground"
                  : "text-muted-foreground active:bg-overlay-weak",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === "chat" ? <ChatPane /> : tab === "gifts" ? <GiftsPane /> : <ClipsPane />}
      </div>
    </div>
  );
}
