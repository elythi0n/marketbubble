import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Next 15 fully REPLACES `openGraph`/`twitter` at the page level — set only top-level fields here;
// Next auto-fills the OG/Twitter title+description and inherits the rest from the layout.
export const metadata: Metadata = {
  title: "Watch",
  description:
    "Watch Market Bubble live — Twitch, Kick and X chat in one feed, alongside real-time markets, predictions, and an AI assistant.",
};

/**
 * Per-request rendering so the `SHOWCASE_ENABLED` read below is evaluated at RUNTIME (matches the
 * /showcase layout gate). Without this, the env value would be baked into the static page at build.
 */
export const dynamic = "force-dynamic";

export default function WatchPage() {
  const showcaseEnabled = process.env.SHOWCASE_ENABLED === "1";
  return (
    <div className="marketing-shell-root">
      {/* Graphite/paper floor + grain, same ambient base as the marketing site. */}
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      <DashboardShell showcaseEnabled={showcaseEnabled} />
    </div>
  );
}
