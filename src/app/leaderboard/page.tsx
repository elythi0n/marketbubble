import type { Metadata } from "next";

import { LeaderboardContent } from "@/components/leaderboard/leaderboard-content";
import { PageShell } from "@/components/page/page-shell";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top crypto-Twitter traders and the most active chatters on MarketBubble.",
  alternates: { canonical: "/leaderboard" },
};

export default function LeaderboardPage() {
  return (
    <PageShell glow>
      <LeaderboardContent />
    </PageShell>
  );
}
