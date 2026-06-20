"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Clapperboard, Film, MonitorPlay, Radio, Tv, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useFlag } from "@/lib/control/client";
import { DEMO_ENABLED, useDemoMode } from "@/lib/demo-mode-context";
import { walburn } from "@/lib/fonts";
import { useViewMode, type ViewMode } from "@/lib/stage-mode-context";
import { NAV_SECTIONS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MarketBubbleLogo } from "./market-bubble-logo";

export function TopNav() {
  const pathname = usePathname();
  const { isDemo, toggle } = useDemoMode();
  const demoOn = useFlag("demo");

  return (
    <header className="relative z-30 grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-hairline bg-background px-4">
      {/* Left: brand lettermark with a tagline tooltip */}
      <div className="group relative w-fit">
        <Link
          href="/"
          aria-label="Market Bubble home"
          className="flex w-fit items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MarketBubbleLogo className="h-10 w-10 text-foreground transition-opacity group-hover:opacity-85" />
        </Link>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1 top-full z-40 mt-1.5 -translate-y-1 whitespace-nowrap rounded-md border border-hairline bg-card px-2.5 py-1.5 text-[0.74rem] font-medium text-foreground opacity-0 shadow-[var(--shadow-popover)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
        >
          Invest in yourself
        </span>
      </div>

      {/* Center: primary navigation (brand face, uppercase) */}
      <nav aria-label="Primary" className="flex items-center gap-1 justify-self-center">
        {NAV_SECTIONS.map((section) => {
          const active =
            section.href === "/watch"
              ? pathname === "/watch" || pathname.startsWith("/watch/")
              : pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3.5 py-1.5 transition-colors",
                active
                  ? "bg-overlay-medium text-foreground"
                  : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground",
              )}
            >
              <span className={cn(walburn.className, "text-sm uppercase tracking-[0.06em]")}>
                {section.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Right: mode controls + Polymarket. Live/Demo and Stage act on the dashboard, so they only
          show on the Stream page. */}
      <TooltipProvider>
      <div className="flex items-center justify-self-end gap-2.5">
        {/* Live / Demo segmented control (hidden when demo is disabled for this build) */}
        {DEMO_ENABLED && demoOn && pathname === "/watch" ? (
        <div className="flex items-center gap-0.5 rounded-md border border-hairline bg-overlay-weak p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => { if (isDemo) toggle(); }}
                  aria-pressed={!isDemo}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                    !isDemo ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Radio className={cn("size-3", !isDemo && "text-feed-ok")} />
                  Live
                </button>
              }
            />
            <TooltipContent>Show the real show channels and their live status</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => { if (!isDemo) toggle(); }}
                  aria-pressed={isDemo}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                    isDemo ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Clapperboard className="size-3" />
                  Demo
                </button>
              }
            />
            <TooltipContent>Preview with a curated set of busy live channels</TooltipContent>
          </Tooltip>
        </div>
        ) : null}

        <ThemeToggle />

        {/* View-mode button — icon swaps with the user's last-chosen mode. Click toggles that mode
            on/off; hover reveals a small menu to switch between Stage / Theater / TV. */}
        {pathname === "/watch" ? <ViewModeButton /> : null}

        <a
          href="https://polymarket.com/?utm_source=marketbubble&utm_medium=referral&utm_campaign=presented_by"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Polymarket"
          className="flex items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/polymarket.svg"
            alt="Polymarket"
            className="h-5 w-auto opacity-80 transition-opacity hover:opacity-100 dark:invert"
          />
        </a>
      </div>
      </TooltipProvider>
    </header>
  );
}

/**
 * View-mode toggle: a plain icon button whose icon mirrors the user's last-chosen mode. Clicking
 * toggles that mode on/off (matching the Stage button's original behavior). Hovering opens a small
 * dropdown to pick a different mode — the choice persists, so next time the button represents the
 * new mode. Hover is intentional (200ms open / 150ms close-grace) so a brush-by doesn't trigger it
 * and the cursor can travel from button to menu without it vanishing.
 */
const VIEW_MODES: ReadonlyArray<{ id: ViewMode; label: string; icon: LucideIcon; hint: string }> = [
  { id: "stage", label: "Stage", icon: MonitorPlay, hint: "Broadcast overlay (OBS-ready)" },
  { id: "theater", label: "Theater", icon: Film, hint: "Stream-dominant — player + chat sidebar" },
  { id: "tv", label: "TV", icon: Tv, hint: "Lean-back — fullscreen player, minimal chrome" },
];

function ViewModeButton() {
  const { active, selected, toggle, selectAndEnter } = useViewMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleOpen = () => { clearTimers(); openTimer.current = window.setTimeout(() => setMenuOpen(true), 180); };
  const scheduleClose = () => { clearTimers(); closeTimer.current = window.setTimeout(() => setMenuOpen(false), 150); };
  useEffect(() => () => clearTimers(), []);

  const meta = VIEW_MODES.find((m) => m.id === selected) ?? VIEW_MODES[0];
  const Icon = meta.icon;
  const isActiveSelected = active === selected;

  return (
    <div
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={isActiveSelected ? `Exit ${meta.label}` : `Open ${meta.label}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={cn(
          "flex size-9 items-center justify-center rounded-md transition-colors",
          isActiveSelected ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-5" />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 min-w-[200px] rounded-lg border border-hairline bg-popover p-1 text-popover-foreground shadow-[var(--shadow-popover)]"
        >
          {VIEW_MODES.map((m) => {
            const IconRow = m.icon;
            const isSelected = m.id === selected;
            const isActive = m.id === active;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => { selectAndEnter(m.id); setMenuOpen(false); }}
                className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-overlay-weak"
              >
                <IconRow className="size-4 flex-none text-muted-foreground group-hover:text-foreground" />
                <span className="flex-1 leading-tight">
                  <span className="block font-medium text-foreground">{m.label}</span>
                  <span className="block text-[0.66rem] text-muted-foreground">{m.hint}</span>
                </span>
                {isActive ? (
                  <span className="flex-none text-[0.55rem] font-bold uppercase tracking-[0.14em] text-feed-ok">On</span>
                ) : isSelected ? (
                  <Check className="size-3.5 flex-none text-muted-foreground" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
