"use client";

/**
 * Internal showcase of every view, panel, admin screen, and overlay across both themes. The page
 * is pinned to the dark palette so the surrounding stage reads as one consistent backdrop; the
 * screenshots themselves are real captures of both light and dark. Captured into
 * `public/screenshots/{theme}/{viewport}/[panels/]{slug}.png` by `/tmp/mb-capture.mjs` +
 * `/tmp/capture-panels.mjs`.
 *
 * Two modes:
 *  - Default: sticky left nav for in-browser browsing, click any image to open it in a lightbox.
 *  - `?screenshot=1`: chromeless rendering for the tall composite capture (no nav, no lightbox).
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Clapperboard,
  Component,
  Gift,
  Layers,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sliders,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { walburn } from "@/lib/fonts";
import { cn } from "@/lib/utils";

interface Item {
  slug: string;
  title: string;
  description: string;
  /** If true, only show the dark capture (overlays are theme-pinned). */
  darkOnly?: boolean;
  /** If true, no mobile capture exists (e.g. dashboard panels). */
  noMobile?: boolean;
  /** Sub-folder inside {theme}/{viewport}/ — used for panels (`panels`). */
  group?: "panels";
}

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  { title: "Unified Chat",       description: "Twitch, Kick and X chat merged into a single live feed.",                       icon: MessageSquare },
  { title: "Hype Meter",         description: "Track real-time audience activity, spikes, and engagement.",                    icon: Activity },
  { title: "Markets & Predictions", description: "Live quotes, crypto, movers, Polymarket predictions and news.",              icon: BarChart3 },
  { title: "AI Assistant",       description: "Context-aware assistant with live data, tool calling, and native dashboard access.", icon: Bot },
  { title: "Giveaways",          description: "Run instant giveaways, pick winners, and grow audience engagement.",            icon: Gift },
  { title: "Cast & Schedule",    description: "Manage your roster, guests, and weekly schedule with ease.",                    icon: Layers },
  { title: "Broadcast Control",  description: "Go live with announcements, polls, clip radar, and real-time show management.", icon: Sliders },
  { title: "OBS Overlays",       description: "Zero-chrome chat overlays and broadcast-ready views for your stream.",          icon: Clapperboard },
];

const MAIN_VIEWS: Item[] = [
  { slug: "stream",      title: "Stream",      description: "The dashboard. Live stream player center, channel sidebar left, dockable Twitch / Kick / X chat right. Stat band ticker across the top with viewers and hype delta." },
  { slug: "stage",       title: "Stage",       description: "Broadcast overlay presentation of the live view. Single-channel focus: identity bar, the running player, chat overlay, predictions ticker, market band — composited as one on-air canvas. Toggle with the Stage button or open directly via ?stage=1 for OBS browser sources." },
  { slug: "markets",     title: "Markets",     description: "TradingView chart, watchlist of crypto + equities, biggest movers, news drawer, Polymarket-style heatmap. Live quotes flow through every panel." },
  { slug: "news",        title: "News",        description: "Editorial homepage layout for financial news. Cashtags are highlighted, crypto stories tinted violet, categories color-coded. Reads like a paper, refreshes like a wire." },
  { slug: "leaderboard", title: "Leaderboard", description: "On-chain traders and the most active chatters, surfaced on a podium with medal accents. Tap a row to drill into a trader's positions or a chatter's recent messages." },
  { slug: "about",       title: "About",       description: "Pitch page for the show: who Banks and Ansem are, what MarketBubble is for, and how the dashboard ties live chat, markets, and culture into one screen." },
];

const PANELS: Item[] = [
  { slug: "panel-stream",       title: "Stream Pane",      description: "Embedded Twitch / Kick player for the selected channel. Falls back to a clip + schedule view when the channel is offline.", noMobile: true, group: "panels" },
  { slug: "panel-chat",         title: "Unified Chat",     description: "Twitch IRC + Kick Pusher + X broadcast chat merged into one feed. Real emotes, real badges, real subs.",                     noMobile: true, group: "panels" },
  { slug: "panel-gifts",        title: "Gifts",            description: "Bits, subs, donations and other monetary events lifted out of the chat firehose into their own ledger.",                      noMobile: true, group: "panels" },
  { slug: "panel-market-news",  title: "Market News",      description: "Recent financial wires, in-pane. Same source as the /news route, scoped to a dock panel.",                                    noMobile: true, group: "panels" },
  { slug: "panel-markets",      title: "Markets Pane",     description: "Watchlist + biggest movers + Fear & Greed gauge, dockable next to chat for traders watching the tape.",                       noMobile: true, group: "panels" },
  { slug: "panel-predictions",  title: "Predictions",      description: "Live Polymarket odds for the markets the show is tracking. Updates as the order book moves.",                                 noMobile: true, group: "panels" },
  { slug: "panel-mentions",     title: "X Mentions",       description: "Mentions of the show across configured X accounts, deduped and threaded by author.",                                          noMobile: true, group: "panels" },
  { slug: "panel-hyperliquid",  title: "Hyperliquid",      description: "Live order flow on Hyperliquid — perp positions, big fills, and funding. Trader-facing tape.",                                noMobile: true, group: "panels" },
  { slug: "panel-hype",         title: "Hype Meter",       description: "Sparkline of chat velocity across all platforms, with spike markers. Drill in by clicking a moment to jump the chat to that point.", noMobile: true, group: "panels" },
  { slug: "panel-trends",       title: "Tickers in Chat",  description: "Live leaderboard of cashtags ($BTC, $TSLA, …) mentioned in chat over the last 3 minutes — what the room is actually talking about.", noMobile: true, group: "panels" },
  { slug: "panel-chatters",     title: "Chat Roster",      description: "Active chatters sorted by message count, with badge counts, subscriber status, and a quick-jump to their last message.",     noMobile: true, group: "panels" },
  { slug: "panel-highlights",   title: "Highlights",       description: "Mod-pinned and AI-auto-flagged messages that should not scroll past — the moments worth re-reading.",                          noMobile: true, group: "panels" },
  { slug: "panel-settings",     title: "Settings",         description: "Workspace prefs: theme switcher, animations toggle, go-live notifications, OBS overlay URLs, layout reset.",                  noMobile: true, group: "panels" },
  { slug: "panel-assistant",    title: "Assistant",        description: "Opt-in AI copilot scoped to the session: can search the live chat, pull market quotes, fetch Polymarket odds, summarize chat moments.", noMobile: true, group: "panels" },
  { slug: "panel-inbox",        title: "Mention Inbox",    description: "Triageable list of @-mentions of the show's accounts; bulk archive, snooze, or reply directly into the chat overlay.",        noMobile: true, group: "panels" },
];

const ADMIN_PAGES: Item[] = [
  { slug: "admin-engage",    title: "Admin · Engage",    description: "Operator-side control surface for the live show: open polls, post a Coming Up banner, push announcements over the control SSE stream." },
  { slug: "admin-roster",    title: "Admin · Roster",    description: "Edit the configured channel list — handles, pinning, platform mapping. Changes propagate to viewers without a deploy." },
  { slug: "admin-controls",  title: "Admin · Controls",  description: "Runtime feature flags (panels on/off), clip-radar tuning, chat filters, OBS source URLs, maintenance and buffer flush." },
  { slug: "admin-giveaway",  title: "Admin · Giveaway",  description: "Configure entry criteria, roll a winner, push the deterministic reel to the on-stream overlay. Survives reload via the giveaway store." },
  { slug: "admin-analytics", title: "Admin · Analytics", description: "Per-stream session metrics: viewer history sparkline, chatter activity heatmap, channel and chatter leaderboards." },
  { slug: "admin-health",    title: "Admin · Health",    description: "End-to-end health of the chat bridges, control SSE, persistence, and external APIs (Twitch GQL, Kick Pusher, X bridge)." },
];

const OVERLAYS: Item[] = [
  { slug: "overlay",          title: "Chat Overlay",     description: "Zero-chrome unified chat feed for OBS browser sources. Composites on top of the live stream with theme-pinned dark glyphs.", darkOnly: true },
  { slug: "overlay-poll",     title: "Poll Overlay",     description: "Renders only when a poll is active; live tallies push over the control SSE stream. Off-air → invisible.", darkOnly: true },
  { slug: "overlay-giveaway", title: "Giveaway Overlay", description: "Deterministic reel that matches the admin page; clears when the operator clears the giveaway. Pinned dark, theme-independent.", darkOnly: true },
];

interface SectionMeta {
  id: string;
  label: string;
  code: string;
  icon: LucideIcon;
  /** Sub-items rendered under this section in the nav when it's active. */
  items: Item[];
}

const SECTIONS: SectionMeta[] = [
  { id: "features",   label: "Features",     code: "00", icon: Sparkles,        items: [] },
  { id: "main-views", label: "Main views",   code: "01", icon: LayoutDashboard, items: MAIN_VIEWS },
  { id: "panels",     label: "Panels",       code: "02", icon: Component,       items: PANELS },
  { id: "admin",      label: "Admin",        code: "03", icon: ShieldCheck,     items: ADMIN_PAGES },
  { id: "overlays",   label: "OBS overlays", code: "04", icon: Clapperboard,    items: OVERLAYS },
];

const PALETTE: Record<"light" | "dark", { name: string; hex: string; role: string }[]> = {
  light: [
    { name: "background",    hex: "#f1ede2", role: "Warm paper" },
    { name: "foreground",    hex: "#1a1a1a", role: "Ink" },
    { name: "card",          hex: "#f8f5ec", role: "Lift" },
    { name: "feed-ok",       hex: "#2f6b4f", role: "Gain" },
    { name: "feed-danger",   hex: "#a43228", role: "Loss" },
    { name: "feed-warn",     hex: "#b7893c", role: "Caution" },
    { name: "feed-link",     hex: "#3a5f8a", role: "Link" },
    { name: "accent-violet", hex: "#5b5dc6", role: "Crypto" },
  ],
  dark: [
    { name: "background",    hex: "#141416", role: "Graphite floor" },
    { name: "foreground",    hex: "#ededed", role: "Ink" },
    { name: "card",          hex: "#1b1b1f", role: "Lift" },
    { name: "feed-ok",       hex: "#46c45a", role: "Gain" },
    { name: "feed-danger",   hex: "#ef6a61", role: "Loss" },
    { name: "feed-warn",     hex: "#d8a13a", role: "Caution" },
    { name: "feed-link",     hex: "#aab3c0", role: "Link" },
    { name: "accent-violet", hex: "#a8a8f8", role: "Crypto" },
  ],
};

function src(item: Item, theme: "light" | "dark", viewport: "desktop" | "mobile") {
  const sub = item.group ? `${item.group}/` : "";
  return `/screenshots/${theme}/${viewport}/${sub}${item.slug}.png`;
}

function PaletteSwatches({ name, swatches }: { name: string; swatches: { name: string; hex: string; role: string }[] }) {
  return (
    <div className="flex-1 rounded-2xl border border-hairline bg-overlay-weak p-5">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{name} palette</p>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {swatches.map((s) => (
          <div key={s.name} className="flex flex-col items-start gap-1">
            <div className="h-12 w-full rounded-md border border-hairline" style={{ backgroundColor: s.hex }} />
            <span className="font-mono text-[0.6rem] leading-tight text-muted-foreground">{s.hex}</span>
            <span className="text-[0.66rem] leading-tight text-foreground/90">{s.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ title, description, icon: Icon }: (typeof FEATURES)[number]) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-hairline bg-card/80 px-5 py-6 text-center shadow-[var(--shadow-card)]">
      <div className="flex size-11 items-center justify-center rounded-full border border-hairline-strong bg-overlay-weak">
        <Icon className="size-5 text-foreground" />
      </div>
      <h3 className={cn(walburn.className, "mt-3.5 text-xl uppercase tracking-[0.04em] text-foreground")}>{title}</h3>
      <p className="mt-1.5 text-[0.78rem] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

interface LightboxImage {
  src: string;
  alt: string;
}

/**
 * Native screenshot dimensions per capture mode. Used as width/height attributes on the <img>
 * elements so the browser reserves layout space before the image loads — without these, lazy
 * image loads cause the page to grow as the user scrolls, and a smooth-scroll-to-anchor that
 * had to pass through a not-yet-loaded section ends up stopping short of its target.
 */
function dimsFor(viewport: "desktop" | "mobile", group: "panels" | undefined) {
  if (group === "panels") return { w: 764, h: 956 };
  if (viewport === "mobile") return { w: 390, h: 844 };
  return { w: 1920, h: 1080 };
}

function ScreenshotTile({
  item,
  theme,
  viewport,
  size,
  onOpen,
}: {
  item: Item;
  theme: "light" | "dark";
  viewport: "desktop" | "mobile";
  size: "lg" | "sm";
  onOpen: ((img: LightboxImage) => void) | null;
}) {
  const url = src(item, theme, viewport);
  const alt = `${item.title} (${theme}${viewport === "mobile" ? ", mobile" : ""})`;
  const { w, h } = dimsFor(viewport, item.group);
  const wrap = size === "lg"
    ? "overflow-hidden rounded-xl border border-hairline shadow-[var(--shadow-card)]"
    : "flex-1 overflow-hidden rounded-lg border border-hairline shadow-[var(--shadow-popover)]";
  // Without a lightbox handler we render a plain div (used in `?screenshot=1` mode so the capture
  // is pristine — no button affordance, no group-hover decoration).
  if (!onOpen) {
    return (
      <div className={wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} width={w} height={h} className="block h-auto w-full" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen({ src: url, alt })}
      className={cn(wrap, "group relative cursor-zoom-in transition-transform hover:-translate-y-0.5")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} width={w} height={h} className="block h-auto w-full transition-opacity duration-200 group-hover:opacity-90" />
    </button>
  );
}

function ShowcaseRow({ item, onOpen }: { item: Item; onOpen: ((img: LightboxImage) => void) | null }) {
  return (
    // id is the item slug — the sidebar nav uses it to scroll to this row and to highlight
    // itself when this row enters the viewport.
    <article id={item.slug} className="scroll-mt-8 flex flex-col gap-5">
      <header className="mx-auto max-w-3xl text-center">
        <h3 className={cn(walburn.className, "text-3xl uppercase tracking-[0.04em] text-foreground sm:text-4xl")}>
          {item.title}
        </h3>
        <p className="mt-2 text-[0.86rem] leading-relaxed text-muted-foreground sm:text-sm">{item.description}</p>
      </header>

      {item.darkOnly ? (
        <div className="mx-auto w-full max-w-5xl">
          <ScreenshotTile item={item} theme="dark" viewport="desktop" size="lg" onOpen={onOpen} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(["light", "dark"] as const).map((t) => (
            <ScreenshotTile key={t} item={item} theme={t} viewport="desktop" size="lg" onOpen={onOpen} />
          ))}
        </div>
      )}

      {!item.noMobile && !item.darkOnly ? (
        <div className="mx-auto flex w-full max-w-2xl items-start justify-center gap-5">
          {(["light", "dark"] as const).map((t) => (
            <ScreenshotTile key={t} item={item} theme={t} viewport="mobile" size="sm" onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Section({
  id,
  title,
  subtitle,
  icon: Icon,
  items,
  wide,
  onOpen,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  items: Item[];
  wide?: boolean;
  onOpen: ((img: LightboxImage) => void) | null;
}) {
  return (
    <section id={id} className={cn("scroll-mt-8 mx-auto w-full px-6 py-16 sm:px-10", wide ? "max-w-[1600px]" : "max-w-6xl")}>
      <header className="flex items-center gap-4 border-b border-hairline pb-6">
        <Icon className="size-10 flex-none text-foreground sm:size-11" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{subtitle}</p>
          <h2 className={cn(walburn.className, "mt-1 text-5xl uppercase leading-none tracking-[0.02em] text-foreground sm:text-6xl")}>{title}</h2>
        </div>
      </header>
      <div className="mt-12 flex flex-col gap-20">
        {items.map((item) => <ShowcaseRow key={item.slug} item={item} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

/**
 * RAF-driven smooth scroll. We can't use native `scrollIntoView({behavior:"smooth"})` here:
 * Chromium silently stops the animation around one viewport's worth on very-long-page jumps
 * (~30k+ px), so clicking "OBS overlays" from the top would land at ~y=1700 instead of the
 * intended ~y=35000. The native API also can't be interrupted/replaced cleanly when the user
 * clicks a different nav entry mid-scroll.
 */
let activeScrollHandle: number | null = null;
function smoothScrollToY(targetY: number, duration = 900) {
  if (activeScrollHandle !== null) cancelAnimationFrame(activeScrollHandle);
  const html = document.documentElement;
  const maxY = html.scrollHeight - html.clientHeight;
  const endY = Math.max(0, Math.min(targetY, maxY));
  const startY = html.scrollTop;
  if (Math.abs(endY - startY) < 2) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    // ease-in-out-cubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    html.scrollTop = startY + (endY - startY) * eased;
    if (t < 1) {
      activeScrollHandle = requestAnimationFrame(step);
    } else {
      activeScrollHandle = null;
    }
  };
  activeScrollHandle = requestAnimationFrame(step);
}

/** Smooth-scroll a hash target into view, then update the URL fragment without jumping. */
function scrollToHash(hash: string) {
  const el = document.getElementById(hash);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // Use html.scrollTop because we made <html> the scroll surface in the page effect.
  const targetY = document.documentElement.scrollTop + rect.top - 16; // small breathing room
  smoothScrollToY(targetY);
  // Update the URL so a back/refresh still reflects where you are. replaceState avoids stacking
  // history entries for every nav click.
  history.replaceState(null, "", `#${hash}`);
}

function ShowcaseNav({ activeSection, activeItem }: { activeSection: string; activeItem: string | null }) {
  // Vertically centered in the viewport, fixed (always in view), no card / no background. The
  // active section expands to reveal its individual rows nested below it, animating in/out.
  return (
    <nav
      aria-label="Showcase sections"
      className="pointer-events-none fixed left-6 top-1/2 z-30 hidden max-h-[calc(100dvh-4rem)] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto pr-1 xl:flex"
    >
      {SECTIONS.map((s) => {
        const active = activeSection === s.id;
        const Icon = s.icon;
        const onClick = (e: React.MouseEvent) => {
          e.preventDefault();
          scrollToHash(s.id);
        };
        return (
          <div key={s.id} className="flex flex-col">
            <a
              href={`#${s.id}`}
              onClick={onClick}
              className={cn(
                "pointer-events-auto group flex items-center gap-2.5 py-1.5 text-[0.78rem] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground/55 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-3.5 transition-colors", active ? "text-foreground" : "text-muted-foreground/45")} />
              <span className={cn("font-mono text-[0.66rem] tabular-nums transition-colors", active ? "text-foreground/80" : "text-muted-foreground/40")}>{s.code}</span>
              <span>{s.label}</span>
            </a>

            <AnimatePresence initial={false}>
              {active && s.items.length > 0 ? (
                <motion.div
                  key="items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <ul className="ml-[1.6rem] flex flex-col gap-px border-l border-hairline pl-2.5 pt-1">
                    {s.items.map((item) => {
                      const itemActive = activeItem === item.slug;
                      return (
                        <li key={item.slug}>
                          <a
                            href={`#${item.slug}`}
                            onClick={(e) => { e.preventDefault(); scrollToHash(item.slug); }}
                            className={cn(
                              "pointer-events-auto block py-1 pl-1.5 text-[0.72rem] transition-colors",
                              itemActive ? "text-foreground" : "text-muted-foreground/45 hover:text-foreground/80",
                            )}
                          >
                            {item.title}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

function Lightbox({ image, onClose }: { image: LightboxImage | null; onClose: () => void }) {
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image, onClose]);
  return (
    <AnimatePresence>
      {image ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim/95 p-6 sm:p-10 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-full max-w-[1700px]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute -right-2 -top-12 inline-flex size-9 items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground transition-colors hover:bg-overlay-medium"
            >
              <X className="size-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.alt}
              className="block max-h-[calc(100dvh-7rem)] w-auto rounded-xl border border-hairline shadow-[var(--shadow-modal)]"
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function ShowcasePage() {
  const params = useSearchParams();
  const captureMode = params.get("screenshot") === "1";
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const onOpen = captureMode ? null : setLightbox;

  // Override the dashboard's html/body overflow:hidden so the showcase scrolls as one tall page.
  // Also pin the html background so any space the user might scroll past the body matches the
  // graphite floor instead of revealing the browser's default white.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      htmlBackground: html.style.background,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
    };
    html.style.overflow = "auto";
    html.style.height = "auto";
    html.style.background = "var(--background)";
    body.style.overflow = "visible";
    body.style.height = "auto";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      html.style.background = prev.htmlBackground;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  // Track which section AND which row are currently in view so the nav highlights at both
  // levels. Two IntersectionObservers sharing the same root margin (band centered ~30% from the
  // top of the viewport) — whatever crosses that band is "current".
  const [activeSection, setActiveSection] = useState<string>("features");
  const [activeItem, setActiveItem] = useState<string | null>(null);
  useEffect(() => {
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const itemEls = SECTIONS.flatMap((s) => s.items.map((i) => document.getElementById(i.slug))).filter(
      (el): el is HTMLElement => !!el,
    );
    if (sectionEls.length === 0) return;

    const pickTop = (entries: IntersectionObserverEntry[]): string | null => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      return visible[0]?.target.id ?? null;
    };

    const sectionIO = new IntersectionObserver(
      (entries) => {
        const id = pickTop(entries);
        if (id) setActiveSection(id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sectionEls.forEach((el) => sectionIO.observe(el));

    const itemIO = new IntersectionObserver(
      (entries) => {
        const id = pickTop(entries);
        // Null when nothing is in the band (e.g. between sections) — collapses item highlight.
        setActiveItem(id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    itemEls.forEach((el) => itemIO.observe(el));

    return () => {
      sectionIO.disconnect();
      itemIO.disconnect();
    };
  }, []);

  const mainContent = useMemo(
    () => (
      <>
        <header className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-14 sm:px-10 sm:pb-16 sm:pt-20">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <MarketBubbleLogo className="h-12 w-12 text-foreground" />
              <div className="flex flex-col leading-none">
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Brand · System</span>
                <span className={cn(walburn.className, "mt-1.5 text-2xl uppercase tracking-[0.04em] text-foreground")}>MarketBubble</span>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <p className="hidden max-w-sm text-right text-[0.78rem] text-muted-foreground sm:block">
                Showcase of every view, panel, admin screen, and OBS overlay across the light paper and dark graphite themes.
              </p>
              {/* Theme switcher is hidden in capture mode so the composite stays chromeless. */}
              {captureMode ? null : <ThemeToggle standalone />}
            </div>
          </div>

          <h1 className={cn(walburn.className, "mt-10 text-6xl uppercase leading-[0.95] tracking-[0.02em] text-foreground sm:mt-14 sm:text-8xl")}>
            The dashboard,<br />in two palettes
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            MarketBubble runs on a token-driven theme system. Every surface, hairline, shadow, and accent
            flips on a single switch. Below: the features, the palettes, and the same product in light
            paper and dark graphite, screen by screen.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PaletteSwatches name="Light · Paper" swatches={PALETTE.light} />
            <PaletteSwatches name="Dark · Graphite" swatches={PALETTE.dark} />
          </div>
        </header>

        <section id="features" className="scroll-mt-8 mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
          <header className="flex items-center gap-4 border-b border-hairline pb-6">
            <Sparkles className="size-10 flex-none text-foreground sm:size-11" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">00 · Features</p>
              <h2 className={cn(walburn.className, "mt-1 text-5xl uppercase leading-none tracking-[0.02em] text-foreground sm:text-6xl")}>What it does</h2>
            </div>
          </header>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </section>

        <Section id="main-views" title="Main views"   subtitle="01 · Pages"        icon={LayoutDashboard} items={MAIN_VIEWS}  wide onOpen={onOpen} />
        <Section id="panels"     title="Panels"       subtitle="02 · Dock panes"   icon={Component}       items={PANELS}      wide onOpen={onOpen} />
        <Section id="admin"      title="Admin"        subtitle="03 · Control room" icon={ShieldCheck}     items={ADMIN_PAGES} wide onOpen={onOpen} />
        <Section id="overlays"   title="OBS overlays" subtitle="04 · Broadcast"    icon={Clapperboard}    items={OVERLAYS}    wide onOpen={onOpen} />

        <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-10 sm:px-10">
          <p className="border-t border-hairline pt-6 text-center text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            MarketBubble · Theme system showcase
          </p>
        </footer>
      </>
    ),
    [onOpen, captureMode],
  );

  return (
    // overflow-clip (both axes, not -hidden) contains the absolutely-positioned mb-glow blobs
    // that overhang the right edge AND extend past the footer (`bottom: -12%` on .mb-glow-2 adds
    // ~4500px of phantom scroll height otherwise). Unlike overflow:hidden, `clip` doesn't turn
    // the wrapper into a scroll surface, so we don't get a second scrollbar.
    <div className="marketing-ambient-base relative min-h-dvh w-full overflow-clip">
      <div className="mb-glow mb-glow-1" aria-hidden />
      <div className="mb-glow mb-glow-2" aria-hidden />
      <div className="mb-glow mb-glow-3" aria-hidden />

      <div className="relative z-10">{mainContent}</div>
      {/* Nav is fixed-positioned (vertically centered), so it overlays the content without
          changing its layout. Hidden entirely in capture mode. */}
      {captureMode ? null : <ShowcaseNav activeSection={activeSection} activeItem={activeItem} />}

      {!captureMode ? <Lightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
