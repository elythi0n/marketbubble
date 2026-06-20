import type { Metadata } from "next";
import Link from "next/link";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";
import { HeroDiorama } from "@/components/home/hero-diorama";
import { RecentBroadcasts } from "@/components/home/recent-broadcasts";
import { PageShell } from "@/components/page/page-shell";
import { SpotifyIcon, TikTokIcon, TwitchIcon, XIcon, YouTubeIcon } from "@/components/social-icons";

// Next 15 fully REPLACES `openGraph`/`twitter` at the page level — set only top-level fields here;
// Next auto-fills the OG/Twitter title+description and inherits the card/image from the layout.
export const metadata: Metadata = {
  title: { absolute: "Market Bubble — Invest in Yourself" },
  description:
    "A live show about speculation, attention and culture. Hosted by Banks and Ansem — Thursdays at 1PM PT, simulcast to Twitch, Kick and X. Watch the stream and every chat in one dashboard.",
  alternates: { canonical: "/" },
};

// Same set + handles as the /watch sidebar footer.
const SOCIALS = [
  { name: "Twitch", Icon: TwitchIcon, href: "https://www.twitch.tv/fazebanks" },
  { name: "X", Icon: XIcon, href: "https://x.com/marketbubble" },
  { name: "TikTok", Icon: TikTokIcon, href: "https://www.tiktok.com/@marketbubble" },
  { name: "YouTube", Icon: YouTubeIcon, href: "https://www.youtube.com/@MarketBubble" },
  { name: "Spotify", Icon: SpotifyIcon, href: "https://open.spotify.com/show/00yWnJPE80LSBglGwCrjZI?si=c83ecda867e94be1" },
];

export default function HomePage() {
  return (
    <PageShell glow>
      <HeroDiorama />

      {/* Recent broadcasts (watchable in-dialog, with combined-viewer counts from analytics) */}
      <RecentBroadcasts />

      {/* Footer */}
      <footer className="relative z-10 mt-10 border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-5 py-12 text-center sm:px-8">
          <Link href="/" aria-label="Market Bubble home" className="group">
            <MarketBubbleLogo className="h-12 w-12 text-foreground transition-opacity group-hover:opacity-80" />
          </Link>

          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted-foreground">
            A live show about speculation, attention and culture.
            <span className="block text-muted-foreground/70">Thursdays · 1PM PT · Twitch, Kick &amp; X</span>
          </p>

          <div className="flex items-center gap-1">
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                title={s.name}
                aria-label={s.name}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
              >
                <s.Icon className="size-[18px]" />
              </a>
            ))}
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.74rem] font-medium text-muted-foreground">
            <Link href="/watch" className="transition-colors hover:text-foreground">Watch</Link>
            <Link href="/markets" className="transition-colors hover:text-foreground">Markets</Link>
            <Link href="/news" className="transition-colors hover:text-foreground">News</Link>
            <Link href="/leaderboard" className="transition-colors hover:text-foreground">Leaderboard</Link>
            <Link href="/about" className="transition-colors hover:text-foreground">About</Link>
          </nav>

          <p className="text-[0.68rem] text-muted-foreground/50">
            © {new Date().getFullYear()} Market Bubble · Presented with Polymarket
          </p>
        </div>
      </footer>
    </PageShell>
  );
}
