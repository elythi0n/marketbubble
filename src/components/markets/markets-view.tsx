"use client";

import dynamic from "next/dynamic";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { TopNav } from "@/components/dashboard/top-nav";
import { useIsMobile } from "@/lib/use-is-mobile";
import { MobileMarkets } from "./mobile-markets";

const MarketsDock = dynamic(() => import("./markets-dock").then((m) => m.MarketsDock), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

export function MarketsView() {
  const isMobile = useIsMobile();

  return (
    <div className="marketing-shell-root">
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
        {isMobile ? null : <TopNav />}
        {isMobile ? (
          <main className="mb-scroll flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
            <MobileMarkets />
          </main>
        ) : (
          <main className="min-h-0 flex-1">
            <MarketsDock />
          </main>
        )}
        {isMobile ? <BottomNav /> : null}
      </div>
    </div>
  );
}
