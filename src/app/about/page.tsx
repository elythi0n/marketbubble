import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/page/page-shell";
import { TwitchIcon, XIcon } from "@/components/social-icons";

// Per-page `openGraph`/`twitter` overrides intentionally dropped — Next 15 wholesale-replaces
// those blocks, which would wipe the layout's card type, handles and image. Title/description
// at the top level auto-fill the OG and Twitter equivalents.
export const metadata: Metadata = {
  title: "About",
  description:
    "Market Bubble is a live show about speculation, attention and culture, hosted by Banks and Ansem (Blknoiz06). The dashboard unifies Twitch, Kick and X chat alongside live market data.",
  alternates: { canonical: "/about" },
};

const SCHEDULE = "Thursdays · 1PM PT";

interface Host {
  name: string;
  handle: string;
  avatar: string;
  role: string;
  about: string;
  links: { label: string; href: string; Icon: ComponentType<{ className?: string }> }[];
}

const HOSTS: Host[] = [
  {
    name: "Banks",
    handle: "@banks",
    avatar: "https://unavatar.io/twitch/fazebanks",
    role: "Host · Twitch, Kick & X",
    about:
      "One of the internet's most followed creators, with an audience in the tens of millions built on knowing where attention goes next. Banks runs the show live on Twitch and Kick, with the X broadcast going at the same time.",
    links: [
      { label: "Twitch", href: "https://www.twitch.tv/fazebanks", Icon: TwitchIcon },
      { label: "X", href: "https://x.com/FaZeBanks", Icon: XIcon },
    ],
  },
  {
    name: "Blknoiz06",
    handle: "@blknoiz06",
    avatar: "https://unavatar.io/twitter/blknoiz06",
    role: "Host · X",
    about:
      "Known as Ansem, one of the most followed traders on crypto Twitter. \"I love markets and I love the internet. I've made nearly all of my money being early to trends and predicting them before they happen.\" That's the show.",
    links: [{ label: "X", href: "https://x.com/blknoiz06", Icon: XIcon }],
  },
];

const THEMES = [
  {
    title: "Make money",
    text: "Live reads on stocks, crypto and prediction markets: what's moving, why, and where the hosts would put it.",
  },
  {
    title: "Command attention",
    text: "Attention is the asset. The show tracks where culture, sports and the timeline are heading before the crowd prices it in.",
  },
  {
    title: "Leverage AI",
    text: "How to actually use AI to trade, build and create faster, including the assistant built into this dashboard.",
  },
];

const DASHBOARD_FEATURES = [
  { title: "One chat", text: "Twitch, Kick and X chat merged into a single live feed, with emotes, badges and per-channel views." },
  { title: "Live markets", text: "Real-time quotes, the biggest movers, market news and Polymarket prediction odds, right next to chat." },
  { title: "Your workspace", text: "Dockable panels you can drag, split, tab and pop out. Build the layout that fits your screen." },
  { title: "AI assistant", text: "An opt-in copilot that can search the session's chat, check the markets and pull Polymarket odds." },
];

export default function AboutPage() {
  return (
    <PageShell glow>
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Hero */}
        <header className="text-center">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">About the show</p>
          <h1 className="font-brand-wordmark mt-3 text-5xl uppercase tracking-[0.01em] text-foreground sm:text-6xl">
            Market Bubble
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A live show about investing in yourself. Every week Banks and Ansem sit at the corner of speculation,
            attention and culture: prediction markets, stocks, crypto, sports and whatever the internet is about to
            care about, called live before it happens. Out of the group chats, onto the air, simulcast to Twitch,
            Kick and X with every chat and every chart in one dashboard.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-lg border border-feed-ok/25 bg-feed-ok/[0.08] px-3 py-1.5 text-[0.78rem] font-semibold text-feed-ok">
              <span className="size-1.5 rounded-full bg-feed-ok" />
              {SCHEDULE}
            </span>
            <a
              href="https://polymarket.com/?utm_source=marketbubble&utm_medium=referral&utm_campaign=presented_by"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-overlay-weak px-3 py-1.5 text-[0.78rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
            >
              Presented with
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/polymarket.svg" alt="Polymarket" className="h-4 w-auto dark:invert" />
            </a>
          </div>
        </header>

        {/* What the show is about */}
        <section className="mt-12">
          <div className="grid gap-3 sm:grid-cols-3">
            {THEMES.map((t) => (
              <div key={t.title} className="rounded-xl border border-hairline bg-overlay-weak px-4 py-4 text-center">
                <h3 className="font-brand-wordmark text-base uppercase tracking-[0.05em] text-foreground">{t.title}</h3>
                <p className="mt-1.5 text-[0.78rem] leading-relaxed text-muted-foreground">{t.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Hosts */}
        <section className="mt-14">
          <h2 className="font-brand-wordmark text-center text-2xl uppercase tracking-[0.04em] text-foreground">The Hosts</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {HOSTS.map((host) => (
              <article
                key={host.name}
                className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-4 border-b border-hairline bg-overlay-weak px-5 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={host.avatar}
                    alt={host.name}
                    className="size-16 rounded-full border border-hairline object-cover"
                  />
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-foreground">{host.name}</h3>
                    <p className="text-[0.72rem] text-muted-foreground">
                      {host.handle} · {host.role}
                    </p>
                  </div>
                </div>
                <p className="flex-1 px-5 py-4 text-sm leading-relaxed text-muted-foreground">{host.about}</p>
                <div className="flex items-center gap-1.5 px-5 pb-4">
                  {host.links.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-overlay-weak px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
                    >
                      <l.Icon className="size-3" />
                      {l.label}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* The dashboard */}
        <section className="mt-14">
          <h2 className="font-brand-wordmark text-center text-2xl uppercase tracking-[0.04em] text-foreground">The Dashboard</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
            The show runs on three platforms at once, so we built one place to watch all of it. This site is that
            place: the stream, every chat and the markets the show talks about, live.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {DASHBOARD_FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-hairline bg-overlay-weak px-4 py-3.5">
                <h3 className="text-[0.85rem] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-[0.78rem] leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="mt-14 text-center">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Watch live
          </Link>
          <p className="mt-2.5 text-[0.7rem] text-muted-foreground/70">{SCHEDULE} · Twitch, Kick and X</p>
        </div>
      </div>
    </PageShell>
  );
}
