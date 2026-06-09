"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Radio } from "lucide-react";

import { useDemoMode } from "@/lib/demo-mode-context";
import { NAV_SECTIONS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";

export function TopNav() {
  const pathname = usePathname();
  const { isDemo, toggle } = useDemoMode();

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

      {/* Right: mode toggle + Polymarket */}
      <div className="flex items-center justify-self-end gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={isDemo}
          title={isDemo ? "Switch to live mode" : "Switch to demo mode"}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.68rem] font-semibold tracking-wide transition-colors",
            isDemo
              ? "border-[#a8a8f8]/30 bg-[#a8a8f8]/10 text-[#a8a8f8]"
              : "border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:text-foreground",
          )}
        >
          {isDemo ? (
            <Clapperboard className="size-3" />
          ) : (
            <Radio className="size-3" />
          )}
          {isDemo ? "Demo" : "Live"}
        </button>

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
    </header>
  );
}
