"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, MonitorPlay, Radio } from "lucide-react";

import { useFlag } from "@/lib/control/client";
import { DEMO_ENABLED, useDemoMode } from "@/lib/demo-mode-context";
import { walburn } from "@/lib/fonts";
import { useStageMode } from "@/lib/stage-mode-context";
import { NAV_SECTIONS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MarketBubbleLogo } from "./market-bubble-logo";

export function TopNav() {
  const pathname = usePathname();
  const { isDemo, toggle } = useDemoMode();
  const { setStage } = useStageMode();
  const demoOn = useFlag("demo");

  return (
    <header className="relative z-30 grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-hairline bg-background px-4">
      {/* Left: brand lettermark with a tagline tooltip */}
      <div className="group relative w-fit">
        <Link
          href="/"
          aria-label="MarketBubble home"
          className="flex w-fit items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MarketBubbleLogo className="h-10 w-10 text-foreground transition-opacity group-hover:opacity-85" />
        </Link>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1 top-full z-40 mt-1.5 -translate-y-1 whitespace-nowrap rounded-md border border-hairline bg-card px-2.5 py-1.5 text-[0.74rem] font-medium text-foreground opacity-0 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
        >
          Invest in yourself
        </span>
      </div>

      {/* Center: primary navigation (brand face, uppercase) */}
      <nav aria-label="Primary" className="flex items-center gap-1 justify-self-center">
        {NAV_SECTIONS.map((section) => {
          const active = section.href === "/" ? pathname === "/" : pathname.startsWith(section.href);
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
        {DEMO_ENABLED && demoOn && pathname === "/" ? (
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

        {/* Stage: broadcast overlay (OBS-ready) — icon-only, before Polymarket */}
        {pathname === "/" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setStage(true)}
                  aria-label="Open Stage"
                  className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  <MonitorPlay className="size-5" />
                </button>
              }
            />
            <TooltipContent>Open the broadcast overlay (chat, ticker, identity over the stream)</TooltipContent>
          </Tooltip>
        ) : null}

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
