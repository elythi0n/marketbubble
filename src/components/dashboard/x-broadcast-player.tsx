"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize, Minimize, Pause, Play, Radio, Settings2, Volume2, VolumeX } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { getHandle, type Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";

/**
 * Custom player for an X broadcast. X's video CDN blocks browser Origins, so we resolve the master
 * playlist via /api/x/broadcast and play it through the same-origin /api/x/hls proxy. hls.js is the
 * streaming engine (CDN-loaded, no bundle dep); Safari/iOS use native HLS. The chrome — controls,
 * quality menu, live badge, MarketBubble watermark — is ours, themed to match the dashboard.
 */
type PlayerStatus = "loading" | "ready" | "offline" | "error";
interface Level { index: number; height: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hls = any;
let hlsPromise: Promise<Hls | null> | null = null;
function loadHls(): Promise<Hls | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as unknown as { Hls?: Hls };
  if (w.Hls) return Promise.resolve(w.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5/dist/hls.min.js";
    s.async = true;
    s.onload = () => resolve((window as unknown as { Hls?: Hls }).Hls ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return hlsPromise;
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-8 flex-none items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  );
}

export function XBroadcastPlayer({ channel }: { channel: Streamer }) {
  // Prefer the resolved live broadcast account (e.g. the shared MarketBubble stream); else the
  // channel's own X handle.
  const source = channel.xSource ?? getHandle(channel, "x");

  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1); // -1 = auto
  const [qualityOpen, setQualityOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);

  // ── Stream setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setLevels([]);
    setLevel(-1);

    (async () => {
      try {
        const r = await fetch(`/api/x/broadcast?handle=${encodeURIComponent(source)}`, { cache: "no-store" });
        const d = r.ok ? ((await r.json()) as { state?: string; playbackUrl?: string | null }) : null;
        if (cancelled) return;
        if (!d?.playbackUrl) {
          setStatus(d?.state === "RUNNING" ? "error" : "offline");
          return;
        }
        const src = `/api/x/hls?url=${encodeURIComponent(d.playbackUrl)}`;
        const video = videoRef.current;
        if (!video) return;
        video.muted = true;

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src; // Safari / iOS native HLS (auto quality only)
          setStatus("ready");
          void video.play().catch(() => {});
          return;
        }
        const HlsLib = await loadHls();
        if (cancelled) return;
        if (!HlsLib || !HlsLib.isSupported()) {
          setStatus("error");
          return;
        }
        const hls = new HlsLib({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(HlsLib.Events.MANIFEST_PARSED, (_e: unknown, data: { levels: { height: number }[] }) => {
          if (cancelled) return;
          setLevels(data.levels.map((l, i) => ({ index: i, height: l.height })).sort((a, b) => b.height - a.height));
          setStatus("ready");
          void video.play().catch(() => {});
        });
        hls.on(HlsLib.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => {
          if (data?.fatal) setStatus("error");
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  }, [source]);

  // ── Video element ↔ state ───────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onVolume = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("volumechange", onVolume);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("volumechange", onVolume);
    };
  }, [status]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
  }, []);

  const changeVolume = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
  }, []);

  const pickLevel = useCallback((idx: number) => {
    setLevel(idx);
    if (hlsRef.current) hlsRef.current.currentLevel = idx;
    setQualityOpen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void wrapRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const revealChrome = useCallback(() => {
    setChromeShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setChromeShown(false);
      setQualityOpen(false);
    }, 2600);
  }, []);

  const chrome = chromeShown || paused || status !== "ready";
  const currentLabel = level === -1 ? "Auto" : `${levels.find((l) => l.index === level)?.height ?? ""}p`;

  return (
    <div
      ref={wrapRef}
      onPointerMove={revealChrome}
      onPointerLeave={() => !paused && setChromeShown(false)}
      className={cn(
        "group relative z-10 flex flex-1 items-center justify-center overflow-hidden bg-black",
        chrome ? "cursor-default" : "cursor-none",
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onClick={togglePlay}
        className="h-full w-full"
      />

      {/* MarketBubble watermark + identity (top-left) */}
      <div
        className={cn(
          "pointer-events-none absolute left-3 top-3 flex items-center gap-2 transition-opacity duration-200",
          chrome ? "opacity-100" : "opacity-0",
        )}
      >
        <MarketBubbleLogo className="size-5 text-white/90 drop-shadow" />
        <span className="flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-0.5 text-[0.72rem] font-medium text-white/90 backdrop-blur-sm">
          <PlatformGlyph platform="x" className="size-3" tinted={false} />
          {channel.name}
        </span>
      </div>

      {/* Center: spinner while buffering, big play when paused */}
      {status === "ready" && (buffering || paused) ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? "Play" : "Buffering"}
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-transform hover:scale-105">
            {buffering ? <Loader2 className="size-7 animate-spin" /> : <Play className="size-7 translate-x-0.5 fill-current" />}
          </span>
        </button>
      ) : null}

      {/* Bottom control bar */}
      {status === "ready" ? (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200",
            chrome ? "opacity-100" : "opacity-0",
          )}
        >
          <CtrlButton label={paused ? "Play" : "Pause"} onClick={togglePlay}>
            {paused ? <Play className="size-4 translate-x-px fill-current" /> : <Pause className="size-4 fill-current" />}
          </CtrlButton>

          <div className="flex items-center gap-1.5">
            <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-16 cursor-pointer [accent-color:white]"
            />
          </div>

          {/* LIVE badge */}
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-feed-danger/90 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
            <Radio className="size-2.5" />
            Live
          </span>

          <div className="ml-auto flex items-center gap-1">
            {levels.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setQualityOpen((v) => !v)}
                  aria-label="Quality"
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[0.7rem] font-medium text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <Settings2 className="size-3.5" />
                  {currentLabel}
                </button>
                {qualityOpen ? (
                  <div className="absolute bottom-full right-0 mb-1.5 w-28 overflow-hidden rounded-lg border border-white/15 bg-black/85 py-1 backdrop-blur-md">
                    {[{ index: -1, height: 0 }, ...levels].map((l) => (
                      <button
                        key={l.index}
                        type="button"
                        onClick={() => pickLevel(l.index)}
                        className={cn(
                          "block w-full px-3 py-1.5 text-left text-[0.72rem] transition-colors hover:bg-white/10",
                          level === l.index ? "font-semibold text-white" : "text-white/70",
                        )}
                      >
                        {l.index === -1 ? "Auto" : `${l.height}p`}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <CtrlButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </CtrlButton>
          </div>
        </div>
      ) : null}

      {/* Non-playing states (themed) */}
      {status !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center backdrop-blur-sm">
          {status === "loading" ? (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading {channel.name}&apos;s X broadcast…</p>
            </>
          ) : status === "offline" ? (
            <>
              <PlatformGlyph platform="x" className="size-9 opacity-60" />
              <p className="text-sm text-muted-foreground">{channel.name} isn&apos;t live on X right now.</p>
            </>
          ) : (
            <>
              <PlatformGlyph platform="x" className="size-9 opacity-60" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Couldn&apos;t load the X broadcast here — the chat still appears in the feed.
              </p>
              <a
                href={`https://x.com/${getHandle(channel, "x")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-overlay-weak px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-overlay-medium"
              >
                Watch on X
              </a>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
