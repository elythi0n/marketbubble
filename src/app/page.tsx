import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = {
  title: { absolute: "MarketBubble - Invest in Yourself" },
};

export default function Page() {
  return (
    <div className="marketing-shell-root">
      {/* Deep-navy floor + grain, same ambient base as the marketing site. */}
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      <DashboardShell />
    </div>
  );
}
