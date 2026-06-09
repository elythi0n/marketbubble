"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, MonitorPlay, Radio } from "lucide-react";

import { DEMO_ENABLED, useDemoMode } from "@/lib/demo-mode-context";
import { useStageMode } from "@/lib/stage-mode-context";
import { NAV_SECTIONS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MarketBubbleLogo } from "./market-bubble-logo";

export function TopNav() {
  const pathname = usePathname();
  const { isDemo, toggle } = useDemoMode();
  const { setStage } = useStageMode();

  return (
    <header className="relative z-30 grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-white/[0.07] bg-[#141416] px-4">
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
          className="pointer-events-none absolute left-1 top-full z-40 mt-1.5 -translate-y-1 whitespace-nowrap rounded-md border border-white/10 bg-[#1b1b1f] px-2.5 py-1.5 text-[0.74rem] font-medium text-foreground opacity-0 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
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
                "font-brand-wordmark rounded-md px-3.5 py-1.5 text-[0.82rem] uppercase tracking-[0.06em] transition-colors",
                active
                  ? "bg-white/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      {/* Right: mode controls + Polymarket */}
      <TooltipProvider>
      <div className="flex items-center justify-self-end gap-2.5">
        {/* Live / Demo segmented control (hidden when demo is disabled for this build) */}
        {DEMO_ENABLED ? (
        <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => { if (isDemo) toggle(); }}
                  aria-pressed={!isDemo}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                    !isDemo ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Radio className={cn("size-3", !isDemo && "text-[#46c45a]")} />
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
                    isDemo ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
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
            className="h-5 w-auto opacity-80 invert transition-opacity hover:opacity-100"
          />
        </a>
      </div>
      </TooltipProvider>
    </header>
  );
}
