"use client";

import type { ReactNode } from "react";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { TopNav } from "@/components/dashboard/top-nav";
import { MobileThemeChip } from "@/components/theme-toggle";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

/** Standalone page chrome: top nav (desktop) or bottom nav (mobile) over scrollable content. */
export function PageShell({ children, glow = false }: { children: ReactNode; glow?: boolean }) {
  const isMobile = useIsMobile();

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
        {isMobile ? null : <TopNav />}
        <main
          className={cn("mb-scroll flex-1 overflow-y-auto", isMobile && "pb-[calc(3.5rem+env(safe-area-inset-bottom))]")}
        >
          {children}
        </main>
        {isMobile ? <BottomNav /> : null}
      </div>
      {/* Floating theme toggle for mobile — visible on every page-shell route. */}
      {isMobile ? <MobileThemeChip /> : null}
    </div>
  );
}
