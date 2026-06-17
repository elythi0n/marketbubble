import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Next 15 fully REPLACES `openGraph` and `twitter` blocks at the page level — adding even a
// partial override here would wipe the layout's `card`, `site`, `creator`, and `images`. Set
// only the top-level fields; Next auto-fills `og:title`/`twitter:title` from `title`, and
// `og:description`/`twitter:description` from `description`, while inheriting the rest.
export const metadata: Metadata = {
  title: { absolute: "Market Bubble — Invest in Yourself" },
  description:
    "A live show about speculation, attention and culture. Hosted by Banks and Ansem — Thursdays at 1PM PT, simulcast to Twitch, Kick and X.",
};

/**
 * Per-request rendering so the `SHOWCASE_ENABLED` read below is evaluated at RUNTIME (matches the
 * /showcase layout gate). Without this, the bundled value of the env at build time would be baked
 * into the static page and toggling the env on the running container would have no effect.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  const showcaseEnabled = process.env.SHOWCASE_ENABLED === "1";
  return (
    <div className="marketing-shell-root">
      {/* Deep-navy floor + grain, same ambient base as the marketing site. */}
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      <DashboardShell showcaseEnabled={showcaseEnabled} />
    </div>
  );
}
