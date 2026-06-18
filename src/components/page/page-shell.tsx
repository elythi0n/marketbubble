"use client";

import type { ReactNode } from "react";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { TopNav } from "@/components/dashboard/top-nav";
import { MobileThemeChip } from "@/components/theme-toggle";

// Nav swap is CSS-only here (TopNav and BottomNav are always rendered, toggled via `md:`)
// so PageShell's React tree shape is stable across resize. Other surfaces in the app still
// use `useIsMobile` for state-driven layout swaps where a CSS-only solution doesn't fit.
export function PageShell({ children, glow = false }: { children: ReactNode; glow?: boolean }) {
  return (
    <div className="marketing-shell-root">
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      {glow ? (
        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
          <div className="mb-glow mb-glow-1" />
          <div className="mb-glow mb-glow-2" />
          <div className="mb-glow mb-glow-3" />
        </div>
      ) : null}
      <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
        <div className="hidden md:contents">
          <TopNav />
        </div>
        <main className="mb-scroll flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <div className="contents md:hidden">
          <BottomNav />
        </div>
      </div>
      {/* Floating theme toggle — self-gated with `sm:hidden`, safe to always render. */}
      <MobileThemeChip />
    </div>
  );
}
