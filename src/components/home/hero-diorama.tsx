"use client";

import { useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Radio } from "lucide-react";

import { useShowLive, type ShowLiveState } from "@/lib/use-show-live";
import { cn } from "@/lib/utils";
import type { DragState } from "./card-scene";

// WebGL is browser-only — never SSR it, so the page text/CTA paint immediately.
const CardScene = dynamic(() => import("./card-scene").then((m) => m.CardScene), { ssr: false, loading: () => null });

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Theme-aware live CTA — the hero now sits on the site's own background. */
function ThemedCta({ show }: { show: ShowLiveState }) {
  const { live, viewers, loading, starting, countdown, scheduleLabel } = show;
  const hot = live || starting;
  return (
    <div className="flex flex-col items-center gap-5">
      <div aria-live="polite" className="flex min-h-[2.25rem] items-center">
        {loading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-overlay-weak px-4 py-1.5 text-[0.8rem] font-medium text-muted-foreground/60">
            Checking the show…
          </span>
        ) : hot ? (
          <span className="inline-flex items-center gap-2.5 rounded-full border border-feed-danger/30 bg-feed-danger/10 px-4 py-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-feed-danger">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-feed-danger/70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-feed-danger" />
            </span>
            {live ? "Live now" : "Starting soon"}
            {live && viewers > 0 ? (
              <span className="font-mono normal-case tracking-normal text-foreground/70">· {formatViewers(viewers)} watching</span>
            ) : null}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-overlay-weak px-4 py-1.5 text-[0.8rem] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-feed-ok" />
            Next show in <span className="font-semibold text-foreground">{countdown}</span>
            <span className="hidden text-muted-foreground/70 sm:inline">· {scheduleLabel}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/watch"
          className={cn(
            "group inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5",
            hot ? "bg-feed-danger text-white" : "bg-foreground text-background",
          )}
        >
          <Radio className="size-4" />
          {live ? "Watch live" : starting ? "Join the show" : "Watch the show"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/about"
          className="inline-flex h-11 items-center rounded-xl border border-hairline-strong bg-overlay-weak px-5 text-sm font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          About the show
        </Link>
      </div>
    </div>
  );
}

/**
 * Homepage hero: the Market Bubble business card as a single flippable 3D object — drag (mouse or
 * thumb) to spin it; the back carries a QR straight to the show. Sits on the site's own theme
 * background so it reads cleanly in both light and dark.
 */
export function HeroDiorama() {
  const drag = useRef<DragState>({ target: 0, vel: 0, dragging: false, lastX: 0, lastInteract: 0 });
  const show = useShowLive();

  const onDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.dragging = true;
    d.lastX = e.clientX;
    d.vel = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    const k = dx * 0.011;
    d.target += k;
    d.vel = k * 0.85;
  };
  const onUp = () => {
    drag.current.dragging = false;
  };

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center gap-7 overflow-hidden px-5 py-16">
      {/* soft focus halo behind the card — theme-aware */}
      <div
        className="pointer-events-none absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "62vmin",
          height: "62vmin",
          background: "radial-gradient(circle, color-mix(in srgb, var(--foreground) 9%, transparent), transparent 70%)",
        }}
        aria-hidden
      />

      {/* Card — drag to rotate. touch-action pan-y lets the page still scroll vertically on mobile. */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
        className="relative z-10 h-[46svh] max-h-[420px] w-full max-w-3xl cursor-grab touch-pan-y select-none active:cursor-grabbing [-webkit-mask-image:linear-gradient(to_bottom,#000_76%,transparent_99%)] [mask-image:linear-gradient(to_bottom,#000_76%,transparent_99%)]"
      >
        <CardScene drag={drag} schedule={show.scheduleLabel} />
      </div>

      <ThemedCta show={show} />
    </section>
  );
}
