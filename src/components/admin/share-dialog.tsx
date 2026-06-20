"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";

import { LOGO_PATHS } from "@/components/dashboard/market-bubble-logo";
import { cn } from "@/lib/utils";
import { useAdmin } from "./admin-shell";
import { GHOST_BTN, QUIET_BTN, SOLID_BTN } from "./ui";

/**
 * Share-card dialog: renders a highlight (a day's viewer stats, a giveaway winner) onto a
 * 1080×1350 portrait canvas (4:5) styled like letterpress on light stock — the brand lettermark
 * and headline are "stamped" into a #c9c7d1 ground in #232122 ink.
 *
 * "Post to X": the web intent can't attach a file, so the PNG is uploaded to /api/admin/share-card
 * and the tweet gets a /share/<id> link — X renders that page's og:image as a large picture card.
 * The image is also copied to the clipboard as a fallback for pasting directly.
 */

export type ShareCard =
  | {
      kind: "day";
      dateLabel: string;
      peak: number;
      /** Hours live / session count that day; omitted when the loaded window doesn't cover it. */
      hours?: number;
      sessions?: number;
    }
  | {
      kind: "giveaway";
      winner: string;
      platform: string;
      eligible: number;
      dateLabel: string;
    }
  | {
      kind: "session";
      streamer: string;
      platform: string;
      dateLabel: string;
      startLabel: string;
      endLabel: string;
      durationLabel: string;
      peak: number;
      avg: number;
      /** Viewer samples [ts, value] across the session — drawn as the stamped curve. */
      points: Array<[number, number]>;
    };

const W = 1080;
const H = 1350;

const BG = "#f1ede2";
const INK = "#232122";
const MUTED_INK = "rgba(35,33,34,0.56)";
const HAIRLINE = "rgba(35,33,34,0.25)";
const GOLD_INK = "#7d652c";

const SANS = `system-ui, -apple-system, "Segoe UI", sans-serif`;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Deterministic PRNG so textures/confetti are stable for a given seed. */
function mulberry(seedStr: string): () => number {
  let seed = 0;
  for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The brand display face (Walburn) as a canvas-usable family list, loaded before painting. */
async function displayFont(): Promise<string> {
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-walburn").trim();
  const family = fam || `Georgia, "Times New Roman", serif`;
  try {
    await document.fonts.load(`400 100px ${family.split(",")[0]}`);
  } catch {
    /* fall back to whatever resolves */
  }
  return family;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, startPx: number, maxWidth: number): number {
  let px = startPx;
  for (; px > 28; px -= 4) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return px;
}

/**
 * Letterpress: a light edge catching below the impression, a sliver of shadow tucked into the
 * top, then slightly translucent ink so the paper grain shows through the fill.
 */
function stamp(ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save();
  ctx.translate(0, 2.5);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#ffffff";
  draw(ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(0, -1.5);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000000";
  draw(ctx);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = INK;
  draw(ctx);
  ctx.restore();
}

function stampText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  stamp(ctx, (c) => c.fillText(text, x, y));
}

/** Same letterpress passes for stroked paths (the session viewer curve). */
function stampStroke(ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save();
  ctx.translate(0, 2.5);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#ffffff";
  draw(ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(0, -1.5);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#000000";
  draw(ctx);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = INK;
  draw(ctx);
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const paths = LOGO_PATHS.map((d) => new Path2D(d));
  const s = size / 400;
  stamp(ctx, (c) => {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    for (const p of paths) c.fill(p);
    c.restore();
  });
}

/** Light stock with a fine deterministic grain, hairline frame, stamped lettermark, date. */
function paintBase(ctx: CanvasRenderingContext2D, dateLabel: string, footerRight: string) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Paper grain — subtle dark and light specks.
  const rnd = mulberry("mb-grain");
  for (let i = 0; i < 2400; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const dark = rnd() > 0.45;
    ctx.fillStyle = dark ? `rgba(35,33,34,${0.015 + rnd() * 0.035})` : `rgba(255,255,255,${0.02 + rnd() * 0.05})`;
    ctx.fillRect(x, y, 1 + rnd(), 1 + rnd());
  }

  // Frame: one hairline, generous margins — stationery, not a poster.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  drawLogo(ctx, 84, 84, 168);

  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.font = `600 25px ${SANS}`;
  setSpacing(ctx, 3);
  ctx.fillStyle = MUTED_INK;
  ctx.fillText(dateLabel.toUpperCase(), W - 88, 122);
  setSpacing(ctx, 0);

  // Footer: hairline rule, host left, context right — both small caps.
  ctx.strokeStyle = HAIRLINE;
  ctx.beginPath();
  ctx.moveTo(88, H - 132);
  ctx.lineTo(W - 88, H - 132);
  ctx.stroke();
  ctx.font = `600 23px ${SANS}`;
  setSpacing(ctx, 3);
  ctx.fillStyle = MUTED_INK;
  ctx.textAlign = "left";
  ctx.fillText(window.location.host.toUpperCase(), 88, H - 92);
  ctx.textAlign = "right";
  ctx.fillText(footerRight.toUpperCase(), W - 88, H - 92);
  setSpacing(ctx, 0);
}

/** Spaced small-caps section label with a short centered rule underneath. */
function sectionLabel(ctx: CanvasRenderingContext2D, text: string, color: string, y: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 27px ${SANS}`;
  setSpacing(ctx, 9);
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2 + 4.5, y); // +half the trailing letterspace to keep it optically centered
  setSpacing(ctx, 0);

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 44, y + 38);
  ctx.lineTo(W / 2 + 44, y + 38);
  ctx.stroke();
}

function paintDayCard(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: "day" }>, display: string, opt: ShareOptions) {
  paintBase(ctx, card.dateLabel, "live analytics");

  sectionLabel(ctx, "PEAK COMBINED VIEWERS", MUTED_INK, 480);

  const big = fmt(card.peak);
  const px = fitFont(ctx, big, (p) => `400 ${p}px ${display}`, 230, W - 220);
  ctx.font = `400 ${px}px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  stampText(ctx, big, W / 2, 640);

  const parts: string[] = [];
  if (opt.hours && card.hours !== undefined) parts.push(`${card.hours.toFixed(1)} hours live`);
  if (opt.sessions && card.sessions !== undefined) parts.push(`${card.sessions} session${card.sessions === 1 ? "" : "s"}`);
  if (parts.length > 0) {
    ctx.font = `500 31px ${SANS}`;
    ctx.fillStyle = MUTED_INK;
    ctx.fillText(parts.join("   ·   "), W / 2, 780);
  }
}

function paintGiveawayCard(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: "giveaway" }>, display: string) {
  paintBase(ctx, card.dateLabel, `giveaway · ${card.platform}`);

  // Restrained confetti in ink tones, clear of the text band.
  const rnd = mulberry(card.winner);
  const colors = [GOLD_INK, "#2f6f3c", "#44506b", INK];
  for (let i = 0; i < 90; i++) {
    const x = 80 + rnd() * (W - 160);
    const y = 290 + rnd() * (H - 470);
    if (y > 440 && y < 880 && x > 130 && x < W - 130) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.globalAlpha = 0.16 + rnd() * 0.22;
    ctx.fillRect(-5, -2.5, 10, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  sectionLabel(ctx, "WINNER", GOLD_INK, 530);

  const px = fitFont(ctx, card.winner, (p) => `400 ${p}px ${display}`, 150, W - 180);
  ctx.font = `400 ${px}px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  stampText(ctx, card.winner, W / 2, 690);
}

function drawSessionCurve(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, x0: number, y0: number, w: number, h: number) {
  const minX = points[0][0];
  const maxX = points[points.length - 1][0];
  const maxY = Math.max(1, ...points.map(([, v]) => v));
  const X = (t: number) => x0 + ((t - minX) / (maxX - minX || 1)) * w;
  const Y = (v: number) => y0 + h - (v / maxY) * h;

  // Faint area wash under the curve, then a hairline baseline.
  ctx.beginPath();
  points.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
  ctx.lineTo(X(maxX), y0 + h);
  ctx.lineTo(X(minX), y0 + h);
  ctx.closePath();
  ctx.fillStyle = "rgba(35,33,34,0.07)";
  ctx.fill();

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.stroke();

  stampStroke(ctx, (c) => {
    c.beginPath();
    points.forEach(([t, v], i) => (i ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v))));
    c.lineWidth = 3.5;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();
  });
}

function paintSessionCard(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: "session" }>, display: string, opt: ShareOptions) {
  paintBase(ctx, card.dateLabel, `stream session · ${card.platform}`);

  sectionLabel(ctx, "STREAM SESSION", MUTED_INK, 400);

  const px = fitFont(ctx, card.streamer, (p) => `400 ${p}px ${display}`, 140, W - 200);
  ctx.font = `400 ${px}px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  stampText(ctx, card.streamer, W / 2, 545);

  // Optional blocks flow vertically from here, so toggling any off reflows cleanly (no gaps).
  let y = 660;

  if (opt.range) {
    ctx.font = `500 31px ${SANS}`;
    ctx.fillStyle = MUTED_INK;
    ctx.textAlign = "center";
    ctx.fillText(`${card.startLabel} → ${card.endLabel}   ·   ${card.durationLabel}`, W / 2, y);
    y += 85;
  }

  if (opt.graph && card.points.length > 1) {
    drawSessionCurve(ctx, card.points, 170, y, W - 340, 240);
    y += 240 + 70;
  }

  const chips: string[] = [];
  if (opt.peak) chips.push(`↑ ${fmt(card.peak)} peak`);
  if (opt.average) chips.push(`ø ${fmt(card.avg)} average`);
  if (chips.length > 0) {
    ctx.font = `600 28px ${SANS}`;
    const chipH = 66;
    const gap = 22;
    const widths = chips.map((t) => ctx.measureText(t).width + 64);
    let x = (W - widths.reduce((a, b) => a + b, 0) - (chips.length - 1) * gap) / 2;
    for (let i = 0; i < chips.length; i++) {
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, widths[i], chipH, chipH / 2);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.fillText(chips[i], x + widths[i] / 2, y + chipH / 2 + 1);
      x += widths[i] + gap;
    }
  }
}

function shareText(card: ShareCard): string {
  if (card.kind === "day") {
    return `Peak ${fmt(card.peak)} concurrent viewers on ${card.dateLabel}`;
  }
  if (card.kind === "session") {
    return `${card.streamer} was live for ${card.durationLabel} on ${card.dateLabel} — peak ${fmt(card.peak)} viewers`;
  }
  return `${card.winner} won the giveaway`;
}

/** Which optional elements a card exposes as toggles. Only data-backed ones are offered. */
export type ShareOptions = Record<string, boolean>;
interface ToggleDef {
  key: string;
  label: string;
}
function togglesFor(card: ShareCard): ToggleDef[] {
  if (card.kind === "session") {
    const t: ToggleDef[] = [{ key: "range", label: "Time & duration" }];
    if (card.points.length > 1) t.push({ key: "graph", label: "Viewer graph" });
    t.push({ key: "peak", label: "Peak" }, { key: "average", label: "Average" });
    return t;
  }
  if (card.kind === "day") {
    const t: ToggleDef[] = [];
    if (card.hours !== undefined) t.push({ key: "hours", label: "Hours live" });
    if (card.sessions !== undefined) t.push({ key: "sessions", label: "Sessions" });
    return t;
  }
  return [];
}

export function ShareDialog({ card, onClose }: { card: ShareCard | null; onClose: () => void }) {
  const { call } = useAdmin();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [options, setOptions] = useState<ShareOptions>({});

  const toggles = card ? togglesFor(card) : [];

  // Reset toggles (all on) whenever a new card opens.
  useEffect(() => {
    if (!card) return;
    setOptions(Object.fromEntries(togglesFor(card).map((t) => [t.key, true])));
  }, [card]);

  useEffect(() => {
    setCopied(false);
    if (!card) return;
    let stale = false;
    void displayFont().then((display) => {
      if (stale) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      if (card.kind === "day") paintDayCard(ctx, card, display, options);
      else if (card.kind === "session") paintSessionCard(ctx, card, display, options);
      else paintGiveawayCard(ctx, card, display);
    });
    return () => {
      stale = true;
    };
  }, [card, options]);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        canvasRef.current?.toBlob((b) => resolve(b), "image/png");
      }),
    [],
  );

  const copyImage = useCallback(async (): Promise<boolean> => {
    try {
      const blob = await toBlob();
      if (!blob) return false;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  }, [toBlob]);

  if (!card) return null;

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `marketbubble-${card.kind}-${card.dateLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    a.click();
  };

  const postToX = async () => {
    setPosting(true);
    try {
      // Host the PNG so the tweet's link carries the picture (the intent itself can't attach files).
      let link = "";
      const blob = await toBlob();
      if (blob) {
        try {
          const res = await call("/api/admin/share-card", {
            method: "POST",
            body: blob,
            headers: { "Content-Type": "image/png" },
          });
          if (res.ok) {
            const { path } = (await res.json()) as { path: string };
            link = `${window.location.origin}${path}`;
          }
        } catch {
          /* hosting unavailable — clipboard fallback below */
        }
      }
      if (!link) await copyImage();
      const text = `${shareText(card)} ${link || window.location.host}`;
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Share highlight"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-hairline bg-sidebar p-4 shadow-[var(--shadow-modal)]">
        <div className="flex items-center gap-2">
          <h2 className="text-[0.9rem] font-semibold text-foreground">Share highlight</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="mx-auto h-auto max-h-[62vh] w-auto max-w-full rounded-xl border border-hairline"
        />

        {toggles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Show</span>
            {toggles.map((t) => {
              const on = options[t.key] !== false;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, [t.key]: !on }))}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition-colors",
                    on
                      ? "border-transparent bg-overlay-medium text-foreground"
                      : "border-hairline-strong bg-overlay-weak text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", on ? "bg-feed-ok" : "bg-muted-foreground/40")} />
                  {t.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copyImage()} className={GHOST_BTN}>
            {copied ? <Check className="size-3.5 text-feed-ok" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy image"}
          </button>
          <button type="button" onClick={download} className={QUIET_BTN}>
            <Download className="size-3.5" />
            Download
          </button>
          <button type="button" onClick={() => void postToX()} disabled={posting} className={cn(SOLID_BTN, "ml-auto")}>
            <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {posting ? "Preparing…" : "Post to X"}
          </button>
        </div>
        <p className="text-[0.64rem] text-muted-foreground/70">
          Posting opens X with the caption and a hosted link to this image — X shows it as a large picture card.
          (If hosting fails, the image lands on your clipboard instead — paste it into the post.)
        </p>
      </div>
    </div>
  );
}
