import type { Metadata } from "next";

import { LeaderboardContent } from "@/components/leaderboard/leaderboard-content";
import { PageShell } from "@/components/page/page-shell";

// Per-page `openGraph`/`twitter` overrides intentionally dropped — see other pages for why.
export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Top crypto-Twitter traders and the most active chatters in the Market Bubble community.",
  alternates: { canonical: "/leaderboard" },
};

export default function LeaderboardPage() {
  return (
    <PageShell glow>
      <LeaderboardContent />
    </PageShell>
  );
}
