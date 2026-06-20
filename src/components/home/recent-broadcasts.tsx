"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Play } from "lucide-react";

import type { Clip } from "@/lib/streamers/clips";
import { KickIcon, TwitchIcon, XIcon, YouTubeIcon } from "@/components/social-icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Broadcast {
  start: number;
  end: number;
  durationMin: number;
  peakCombined: number;
  avgCombined: number;
}

const PLATFORM_ICON: Record<string, ComponentType<{ className?: string }>> = {
  twitch: TwitchIcon,
  kick: KickIcon,
  x: XIcon,
  youtube: YouTubeIcon,
};

function fmtViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** On-site embed URL for a clip/VOD; null if it can't be embedded (Twitch needs the page host). */
function embedUrl(clip: Clip, host: string): string | null {
  if (!clip.url) return null;
  if (clip.platform === "youtube") {
    const m = /[?&]v=([\w-]+)/.exec(clip.url) ?? /youtu\.be\/([\w-]+)/.exec(clip.url);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : null;
  }
  if (clip.platform === "twitch" && host) {
    const last = clip.url.split("/").pop() ?? "";
    if (!last) return null;
    if (clip.kind === "clip") return `https://clips.twitch.tv/embed?clip=${last}&parent=${host}&autoplay=true`;
    return `https://player.twitch.tv/?video=${last}&parent=${host}&autoplay=true`;
  }
  return null;
}

interface Card {
  broadcast?: Broadcast;
  vod?: Clip;
}

export function RecentBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [vods, setVods] = useState<Clip[] | null>(null);
  const [host, setHost] = useState("");
  const [active, setActive] = useState<Clip | null>(null);

  useEffect(() => {
    setHost(window.location.hostname);
    let on = true;
    fetch("/api/broadcasts")
      .then((r) => r.json())
      .then((d) => on && setBroadcasts(Array.isArray(d.broadcasts) ? d.broadcasts : []))
      .catch(() => on && setBroadcasts([]));
    fetch("/api/clips?login=fazebanks&youtube=MarketBubble")
      .then((r) => r.json())
      .then((d) => on && setVods(Array.isArray(d) ? d : []))
      .catch(() => on && setVods([]));
    return () => {
      on = false;
    };
  }, []);

  const loading = broadcasts === null || vods === null;
  const watchable = [
    ...(vods ?? []).filter((c) => c.kind === "vod" || c.kind === "video"),
    ...(vods ?? []).filter((c) => c.kind === "clip"),
  ];
  const b = broadcasts ?? [];
  const count = Math.min(6, Math.max(b.length, watchable.length));

  if (loading) {
    return (
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <SectionHeading />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-2xl border border-hairline bg-overlay-weak" />
          ))}
        </div>
      </section>
    );
  }
  if (count === 0) return null;

  const cards: Card[] = Array.from({ length: count }, (_, i) => ({ broadcast: b[i], vod: watchable[i] }));
  const activeEmbed = active ? embedUrl(active, host) : null;

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <SectionHeading />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => {
          const { broadcast, vod } = card;
          const canEmbed = vod ? !!embedUrl(vod, host) : false;
          const key = vod?.id ?? broadcast?.start ?? i;
          const inner = <CardInner card={card} />;
          return canEmbed && vod ? (
            <button key={key} type="button" onClick={() => setActive(vod)} className={CARD_CLASS}>
              {inner}
            </button>
          ) : (
            <a key={key} href={vod?.url ?? "/watch"} target={vod?.url ? "_blank" : undefined} rel="noreferrer noopener" className={CARD_CLASS}>
              {inner}
            </a>
          );
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="overflow-hidden border-0 bg-black p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{active?.title ?? "Recent broadcast"}</DialogTitle>
          <div className="aspect-video w-full">
            {activeEmbed ? (
              <iframe
                src={activeEmbed}
                title={active?.title ?? "Broadcast"}
                className="h-full w-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const CARD_CLASS =
  "group block w-full overflow-hidden rounded-2xl border border-hairline bg-card text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5";

function CardInner({ card }: { card: Card }) {
  const { broadcast, vod } = card;
  const Icon = vod ? PLATFORM_ICON[vod.platform] : undefined;
  const title = vod?.title ?? (broadcast ? `Broadcast · ${fmtDate(broadcast.start)}` : "Broadcast");
  const duration = vod?.duration || (broadcast ? fmtDuration(broadcast.durationMin) : "");
  return (
    <>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={vod?.thumbnail || "/marketbubble-offline.png"}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="relative flex size-12 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Play className="size-5 translate-x-px fill-white" />
        </span>
        {duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold text-white">
            {duration}
          </span>
        ) : null}
        {Icon ? (
          <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-md bg-black/55 text-white">
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.86rem] font-semibold text-foreground">{title}</h3>
          {broadcast ? <p className="mt-0.5 text-[0.72rem] text-muted-foreground">{fmtDate(broadcast.start)}</p> : null}
        </div>
        {broadcast ? (
          <div className="flex-none text-right">
            <p className="font-mono text-[0.92rem] font-bold leading-none text-foreground">{fmtViewers(broadcast.peakCombined)}</p>
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">peak viewers</p>
          </div>
        ) : vod && vod.views > 0 ? (
          <div className="flex-none text-right">
            <p className="font-mono text-[0.92rem] font-bold leading-none text-foreground">{fmtViewers(vod.views)}</p>
            <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">views</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function SectionHeading() {
  return (
    <div className="text-center">
      <h2 className="font-brand-wordmark text-2xl uppercase tracking-[0.04em] text-foreground sm:text-3xl">
        Recent Broadcasts
      </h2>
    </div>
  );
}
