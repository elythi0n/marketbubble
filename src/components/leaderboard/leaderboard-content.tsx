"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Crown, MessageSquare, Star } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { Platform } from "@/lib/feed/types";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

interface Trader {
  address: string;
  pnl30d: number;
  pnl30dUsd: number;
  winRate: number;
  volume: number;
  bias: "long" | "short" | null;
  mainToken: string;
  grade: string;
}

interface Chatter {
  name: string;
  platform: Platform;
  messages: number;
  isSubscriber?: boolean;
}


function rankColor(rank: number): string {
  if (rank === 1) return "text-feed-warn";
  if (rank === 2) return "text-foreground/80";
  if (rank === 3) return "text-[#c08457]"; // bronze medal: decorative, no token; legible on both themes
  return "text-muted-foreground";
}

function compactUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function compactCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatPct(n: number): string {
  const d = Math.abs(n) >= 100 ? 0 : 1;
  return `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;
}

function formatAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function initials(name: string): string {
  const p = name.replace(/[^a-z0-9 ]/gi, "").trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

function hueFrom(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i += 1) h = (h * 33 + str.charCodeAt(i)) % 360;
  return h;
}

/** Public profile for a chatter on their platform. */
function profileUrl(name: string, platform: Platform): string {
  if (platform === "twitch") return `https://twitch.tv/${name.toLowerCase()}`;
  if (platform === "kick") return `https://kick.com/${name.toLowerCase()}`;
  return `https://x.com/${name}`;
}

const SUB_COLOR: Record<Platform, string> = {
  twitch: "var(--plat-twitch)",
  kick: "var(--plat-kick)",
  x: "var(--foreground)",
};

function SubBadge({ platform }: { platform: Platform }) {
  return (
    <span
      title="Platform subscriber"
      className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[0.56rem] font-bold uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${SUB_COLOR[platform]} 13%, transparent)`, color: SUB_COLOR[platform] }}
    >
      <Star className="size-2.5 fill-current" />
      SUB
    </span>
  );
}

/** Deterministic gradient identicon for on-chain wallets (no profile pic available). */
function WalletAvatar({ address, size = 30 }: { address: string; size?: number }) {
  const h1 = hueFrom(address, 7);
  const h2 = hueFrom(address, 53);
  return (
    <span
      className="shrink-0 rounded-full border border-hairline"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h1} 55% 52%), hsl(${h2} 52% 38%))` }}
      aria-hidden
    />
  );
}

function ChatterAvatar({ name, platform, size = 30 }: { name: string; platform?: Platform; size?: number }) {
  const [err, setErr] = useState(false);
  const provider = platform === "x" ? "twitter" : platform;
  const url = provider && !err ? `https://unavatar.io/${provider}/${encodeURIComponent(name)}?fallback=false` : null;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
        className="shrink-0 rounded-full border border-hairline object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-hairline bg-overlay-weak font-semibold text-foreground/85"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  );
}

type Tab = "traders" | "chatters";
type TraderKey = "pnl30d" | "winRate" | "volume";

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2.5 text-[0.74rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active ? dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}
      </button>
    </th>
  );
}

const PODIUM_TINT: Record<number, { border: string; grad: string; ring: string }> = {
  1: {
    border: "border-[#d8b25a]/45",
    grad: "linear-gradient(180deg, rgba(216,178,90,0.26), rgba(216,178,90,0.07) 100%), var(--card)",
    ring: "rgba(216,178,90,0.22)",
  },
  2: {
    border: "border-[#c6c6cc]/30",
    grad: "linear-gradient(180deg, rgba(198,198,204,0.18), rgba(198,198,204,0.05) 100%), var(--card)",
    ring: "rgba(198,198,204,0.15)",
  },
  3: {
    border: "border-[#c08457]/32",
    grad: "linear-gradient(180deg, rgba(192,132,87,0.2), rgba(192,132,87,0.05) 100%), var(--card)",
    ring: "rgba(192,132,87,0.16)",
  },
};

interface PodiumRow {
  rank: number;
  title: string;
  sub?: string;
  metric: string;
  avatar: ReactNode;
  isSubscriber?: boolean;
  platform?: Platform;
}

function Podium({ rows, compact = false }: { rows: PodiumRow[]; compact?: boolean }) {
  const order = [1, 0, 2]; // 2nd, 1st, 3rd visual order
  return (
    <div className={cn("grid grid-cols-3 items-end", compact ? "mb-5 gap-2" : "mb-7 gap-3")}>
      {order.map((idx) => {
        const r = rows[idx];
        if (!r) return <div key={idx} />;
        const first = r.rank === 1;
        const tint = PODIUM_TINT[r.rank] ?? PODIUM_TINT[3];
        return (
          <motion.div
            key={r.title}
            whileHover={{ y: -10, scale: 1.025 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className={cn(
              "group relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl border text-center",
              "shadow-[0_18px_46px_-26px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.05)]",
              tint.border,
              compact
                ? first
                  ? "px-2 pb-3.5 pt-4 -mt-2"
                  : "px-2 pb-3 pt-3.5 mt-1"
                : first
                  ? "px-5 pb-6 pt-7 -mt-3"
                  : "px-5 pb-5 pt-6 mt-1",
            )}
            style={{ backgroundImage: tint.grad }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80 transition-opacity duration-200 group-hover:opacity-100"
              style={{ background: `radial-gradient(62% 100% at 50% 0%, ${tint.ring}, transparent)` }}
            />
            {first ? <Crown className={cn("relative mb-1 text-[#d8b25a]", compact ? "size-4" : "size-5")} /> : null}
            <span className={cn("relative font-mono font-bold", compact ? "mb-1.5 text-[0.68rem]" : "mb-2.5 text-[0.82rem]", rankColor(r.rank))}>
              #{r.rank}
            </span>
            <div className="relative">{r.avatar}</div>
            <span className={cn("relative w-full truncate font-semibold text-foreground", compact ? "mt-2 text-[0.78rem]" : "mt-3 text-[1.02rem]")}>
              {r.title}
            </span>
            {r.isSubscriber && r.platform ? (
              <span className="relative mt-1">
                <SubBadge platform={r.platform} />
              </span>
            ) : null}
            {r.sub ? (
              <span className={cn("relative w-full truncate text-muted-foreground", compact ? "text-[0.6rem]" : "text-[0.74rem]")}>{r.sub}</span>
            ) : null}
            <span className={cn("relative font-mono font-bold tabular-nums text-foreground", compact ? "mt-1.5 text-[0.95rem]" : "mt-2.5 text-[1.2rem]")}>
              {r.metric}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Ghost podium shown when no chatter data is available yet. */
function EmptyChattersPodium({ compact = false }: { compact?: boolean }) {
  const slots = [
    { rank: 2, first: false },
    { rank: 1, first: true },
    { rank: 3, first: false },
  ];
  return (
    <div className={cn("grid grid-cols-3 items-end", compact ? "mb-5 gap-2" : "mb-7 gap-3")}>
      {slots.map(({ rank, first }) => (
        <div
          key={rank}
          className={cn(
            "flex min-w-0 flex-col items-center rounded-2xl border text-center",
            first
              ? "border-dashed border-[#d8b25a]/20 bg-[#d8b25a]/[0.025] -mt-2"
              : "border-dashed border-hairline mt-1",
            compact
              ? first ? "px-2 pb-3.5 pt-4" : "px-2 pb-3 pt-3.5"
              : first ? "px-5 pb-6 pt-7" : "px-5 pb-5 pt-6",
          )}
        >
          {first ? <Crown className={cn("mb-1 text-[#d8b25a]/30", compact ? "size-4" : "size-5")} /> : null}
          <span className={cn("font-mono font-bold opacity-25", compact ? "mb-1.5 text-[0.68rem]" : "mb-2.5 text-[0.82rem]", rankColor(rank))}>
            #{rank}
          </span>
          <span
            className="rounded-full border border-dashed border-hairline-strong bg-overlay-weak"
            style={{
              width: first ? (compact ? 46 : 64) : compact ? 38 : 50,
              height: first ? (compact ? 46 : 64) : compact ? 38 : 50,
            }}
          />
          {first ? (
            <>
              <span className={cn("mt-3 font-medium text-muted-foreground/50", compact ? "text-[0.72rem]" : "text-[0.9rem]")}>
                You could be here?
              </span>
              <span className={cn("text-muted-foreground/35", compact ? "mt-0.5 text-[0.58rem]" : "mt-1 text-[0.68rem]")}>
                Chat during the stream
              </span>
            </>
          ) : (
            <span className={cn("mt-2 font-mono text-muted-foreground/25", compact ? "text-[0.9rem]" : "text-[1.1rem]")}>—</span>
          )}
        </div>
      ))}
    </div>
  );
}

const TH = "px-3 py-2.5 text-[0.74rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground";

export function LeaderboardContent() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("chatters");
  const [rawTraders, setRawTraders] = useState<Trader[] | null>(null);
  const [source, setSource] = useState("Hyperliquid");
  const [rawChatters, setRawChatters] = useState<Chatter[] | null>(null);
  const [chattersFetched, setChattersFetched] = useState(false);
  const [chatterSource, setChatterSource] = useState<string | null>(null);
  const [traderSort, setTraderSort] = useState<{ key: TraderKey; dir: "asc" | "desc" }>({ key: "pnl30d", dir: "desc" });
  const [chatterSort, setChatterSort] = useState<{ dir: "asc" | "desc" }>({ dir: "desc" });

  useEffect(() => {
    let alive = true;
    fetch("/api/leaderboard/traders")
      .then((r) => r.json())
      .then((d: { source?: string; traders?: Trader[] }) => {
        if (!alive) return;
        setRawTraders(d.traders ?? []);
        if (d.source) setSource(d.source);
      })
      .catch(() => alive && setRawTraders([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/leaderboard/chatters")
      .then((r) => r.json())
      .then((d: { source?: string | null; chatters?: Array<{ name: string; platform: Platform; count: number; sub?: boolean }> }) => {
        if (!alive) return;
        const list = (d.chatters ?? []).map((c) => ({ name: c.name, platform: c.platform as Platform, messages: c.count, isSubscriber: c.sub === true }));
        setRawChatters(list);
        setChattersFetched(true);
        if (list.length > 0) setChatterSource(d.source ?? "Live chat");
      })
      .catch(() => { if (alive) setChattersFetched(true); });
    return () => {
      alive = false;
    };
  }, []);

  const traders = useMemo(() => {
    const list = rawTraders ?? [];
    const sign = traderSort.dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => sign * (a[traderSort.key] - b[traderSort.key]));
  }, [rawTraders, traderSort]);

  const chatterList = useMemo(() => rawChatters ?? [], [rawChatters]);
  const chatters = useMemo(() => {
    const sign = chatterSort.dir === "desc" ? -1 : 1;
    return [...chatterList].sort((a, b) => sign * (a.messages - b.messages));
  }, [chatterList, chatterSort]);

  const traderPodium: PodiumRow[] = useMemo(
    () =>
      [...(rawTraders ?? [])]
        .sort((a, b) => b.pnl30d - a.pnl30d)
        .slice(0, 3)
        .map((t, i) => ({
          rank: i + 1,
          title: formatAddr(t.address),
          sub: t.mainToken ? `${t.mainToken} · ${t.grade || "—"}` : undefined,
          metric: formatPct(t.pnl30d),
          avatar: <WalletAvatar address={t.address} size={i === 0 ? (isMobile ? 46 : 64) : isMobile ? 38 : 50} />,
        })),
    [rawTraders, isMobile],
  );

  const chatterPodium: PodiumRow[] = useMemo(
    () =>
      [...chatterList]
        .sort((a, b) => b.messages - a.messages)
        .slice(0, 3)
        .map((c, i) => ({
          rank: i + 1,
          title: c.name,
          metric: `${compactCount(c.messages)} msgs`,
          avatar: <ChatterAvatar name={c.name} platform={c.platform} size={i === 0 ? (isMobile ? 46 : 64) : isMobile ? 38 : 50} />,
          isSubscriber: c.isSubscriber,
          platform: c.platform,
        })),
    [chatterList, isMobile],
  );

  const maxMsgs = Math.max(1, ...chatterList.map((c) => c.messages));
  const toggleTrader = (key: TraderKey) =>
    setTraderSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const loading = rawTraders === null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <h1 className="font-brand-wordmark text-4xl uppercase tracking-[0.01em] text-foreground sm:text-5xl">Leaderboard</h1>
        <p className="mt-2.5 text-base text-muted-foreground">Real on-chain traders and the most active chatters.</p>
      </header>

      <div className="mt-6 inline-flex rounded-lg border border-hairline bg-overlay-weak p-0.5">
        {(["chatters", "traders"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-[0.8rem] font-medium transition-colors",
              tab === t ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "traders" ? "Top traders" : "Top chatters"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "traders" ? (
          <Podium rows={traderPodium} compact={isMobile} />
        ) : chattersFetched && chatters.length === 0 ? (
          <EmptyChattersPodium compact={isMobile} />
        ) : (
          <Podium rows={chatterPodium} compact={isMobile} />
        )}

        {tab === "chatters" && chattersFetched && chatters.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card shadow-[0_16px_40px_-28px_rgba(0,0,0,0.8)]">
            <div className="flex flex-col items-center gap-2.5 py-14 text-center">
              <MessageSquare className="size-8 text-muted-foreground/25" />
              <p className="text-[0.95rem] font-medium text-muted-foreground">No chatters yet</p>
              <p className="max-w-xs text-[0.72rem] leading-relaxed text-muted-foreground/55">
                Message counts are tallied live during active streams — check back when someone is live
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-hairline bg-card shadow-[0_16px_40px_-28px_rgba(0,0,0,0.8)]">
            <table className="w-full border-collapse">
              {tab === "traders" ? (
                <>
                  <thead className="border-b border-hairline bg-overlay-weak text-left">
                    <tr>
                      <th className={cn("w-12", TH)}>#</th>
                      <th className={TH}>Trader</th>
                      <SortHeader label="30D PnL" active={traderSort.key === "pnl30d"} dir={traderSort.dir} onClick={() => toggleTrader("pnl30d")} className="text-right" />
                      <SortHeader label="Win rate" active={traderSort.key === "winRate"} dir={traderSort.dir} onClick={() => toggleTrader("winRate")} className="hidden text-right sm:table-cell" />
                      <SortHeader label="Volume" active={traderSort.key === "volume"} dir={traderSort.dir} onClick={() => toggleTrader("volume")} className="hidden text-right md:table-cell" />
                      <th className={cn("text-right", TH)}>Bias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">Loading live traders…</td>
                      </tr>
                    ) : (
                      traders.map((t, i) => {
                        const up = t.pnl30d >= 0;
                        return (
                          <tr key={t.address} className="border-b border-hairline transition-colors last:border-b-0 hover:bg-overlay-weak">
                            <td className={cn("px-3 py-3 font-mono text-[0.95rem] font-bold tabular-nums", rankColor(i + 1))}>{i + 1}</td>
                            <td className="px-3 py-3">
                              <a
                                href={`https://hyperstats.org/wallet/${t.address}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="flex items-center gap-2.5"
                              >
                                <WalletAvatar address={t.address} size={30} />
                                <span className="flex min-w-0 flex-col leading-tight">
                                  <span className="truncate font-mono text-[0.9rem] font-medium text-foreground">{formatAddr(t.address)}</span>
                                  <span className="truncate text-[0.68rem] text-muted-foreground">{t.mainToken || "—"}</span>
                                </span>
                              </a>
                            </td>
                            <td className={cn("px-3 py-3 text-right font-mono text-[0.9rem] font-semibold tabular-nums", up ? "text-feed-ok" : "text-feed-danger")}>
                              {formatPct(t.pnl30d)}
                            </td>
                            <td className="hidden px-3 py-3 text-right font-mono text-[0.86rem] tabular-nums text-foreground sm:table-cell">{t.winRate}%</td>
                            <td className="hidden px-3 py-3 text-right font-mono text-[0.86rem] tabular-nums text-muted-foreground md:table-cell">{compactUsd(t.volume)}</td>
                            <td className="px-3 py-3 text-right">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide",
                                  t.bias === "short" ? "bg-feed-danger/15 text-feed-danger" : "bg-feed-ok/15 text-feed-ok",
                                )}
                              >
                                {t.bias === "short" ? "Short" : "Long"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead className="border-b border-hairline bg-overlay-weak text-left">
                    <tr>
                      <th className={cn("w-12", TH)}>#</th>
                      <th className={TH}>Chatter</th>
                      <th className={cn("hidden sm:table-cell", TH)}>Activity</th>
                      <SortHeader label="Messages" active dir={chatterSort.dir} onClick={() => setChatterSort((s) => ({ dir: s.dir === "desc" ? "asc" : "desc" }))} className="text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {!chattersFetched ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-sm text-muted-foreground">Loading…</td>
                      </tr>
                    ) : (
                      chatters.map((c, i) => (
                        <tr
                          key={`${c.platform}:${c.name}`}
                          className="border-b border-hairline transition-colors last:border-b-0 hover:bg-overlay-weak"
                          style={c.isSubscriber ? { background: `color-mix(in srgb, ${SUB_COLOR[c.platform]} 3%, transparent)` } : undefined}
                        >
                          <td className={cn("px-3 py-3 font-mono text-[0.95rem] font-bold tabular-nums", rankColor(i + 1))}>{i + 1}</td>
                          <td className="px-3 py-3">
                            <a
                              href={profileUrl(c.name, c.platform)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="flex items-center gap-2.5"
                            >
                              <ChatterAvatar name={c.name} platform={c.platform} size={30} />
                              <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                                <span className="flex max-w-full items-center gap-1.5">
                                  <span className="truncate text-[0.92rem] font-medium text-foreground">{c.name}</span>
                                  <PlatformGlyph platform={c.platform} className="size-3 shrink-0" />
                                </span>
                                {c.isSubscriber ? <SubBadge platform={c.platform} /> : null}
                              </span>
                            </a>
                          </td>
                          <td className="hidden px-3 py-3 sm:table-cell">
                            <span className="block h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-overlay-weak">
                              <span className="block h-full rounded-full bg-feed-link/70" style={{ width: `${(c.messages / maxMsgs) * 100}%` }} />
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[0.9rem] font-semibold tabular-nums text-foreground">{compactCount(c.messages)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        )}

        <div className="mt-5 flex flex-col items-center gap-1.5">
          <p className="text-center text-[0.72rem] text-muted-foreground/80">
            {tab === "traders"
              ? `Source: ${source}`
              : chatterSource
                ? `Source: ${chatterSource}`
                : "Chat data is counted live during active streams"}
          </p>
          {tab === "chatters" && chatters.some((c) => c.isSubscriber) ? (
            <p className="flex items-center gap-1 text-[0.66rem] text-muted-foreground/50">
              <Star className="size-2.5 fill-current" />
              SUB badge shown for platform subscribers spotted in chat
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
