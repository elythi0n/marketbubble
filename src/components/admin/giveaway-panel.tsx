"use client";

import { useEffect, useState } from "react";
import { Dices, Gift, Share2, Trash2 } from "lucide-react";

import { GiveawayReel } from "@/components/giveaway/giveaway-reel";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { GiveawayPreview } from "@/app/api/admin/giveaway/route";
import { useControl } from "@/lib/control/client";
import type { Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { useAdmin } from "./admin-shell";
import { ShareDialog, type ShareCard } from "./share-dialog";
import { CopyButton, INPUT, LiveChip, QUIET_BTN, Select, SOLID_BTN } from "./ui";

type PlatformChoice = "all" | "twitch" | "kick" | "x";

const ACTIVE_WINDOWS = [
  { value: "0", label: "Any time" },
  { value: "60", label: "Last hour" },
  { value: "360", label: "Last 6 hours" },
  { value: "1440", label: "Last 24 hours" },
  { value: "10080", label: "Last 7 days" },
] as const;

const DURATIONS = [5, 8, 12];

// ── Demo mode (?demo=1): a fake chatter pool so the roll can be tested without a database ──────
const DEMO_NAMES = [
  "diamondhandz", "bagholder99", "moon_mission", "chartgoblin", "wickhunter", "fomo_frank",
  "rugpull_survivor", "satoshi_lite", "deltadegen", "thetagang", "liquidated_larry", "stoploss_steve",
  "candle_wizard", "greenwick", "bearwhale", "apefluencer", "gasfee_enjoyer", "ledger_lou",
  "papertrader", "vwap_viper", "0xroach", "breakout_bob", "memecoin_mary", "shortsqueezer",
  "hodl_henry", "scalp_sally", "frontrun_fred", "exit_liquidity", "limit_larry", "orderflow_oz",
  "spoofy", "tape_reader", "max_pain", "perma_bull", "perma_bear", "alpha_leak", "degen_dave",
  "funding_rate", "basis_trader", "chop_city", "trendline_tom", "fib_freak", "candlecrusher",
  "pump_andy", "sniped_u",
];

interface DemoChatter {
  platform: "twitch" | "kick" | "x";
  name: string;
  count: number;
  updatedAt: number;
}

/** Deterministic pool: platforms cycle, counts follow a power curve, half are "recently active". */
function demoChatters(now: number): DemoChatter[] {
  return DEMO_NAMES.map((name, i) => ({
    platform: (["twitch", "kick", "x"] as const)[i % 3],
    name,
    count: Math.ceil(Math.pow(i + 2, 1.6)),
    updatedAt: i % 2 === 0 ? now - i * 5 * 60_000 : now - 3 * 86_400_000,
  }));
}

function filterDemo(pool: DemoChatter[], platform: PlatformChoice, minCount: number, activeWithinMin: number, now: number): DemoChatter[] {
  return pool.filter(
    (c) =>
      c.count >= minCount &&
      (platform === "all" || c.platform === platform) &&
      (activeWithinMin <= 0 || c.updatedAt >= now - activeWithinMin * 60_000),
  );
}

/**
 * Random-viewer giveaway. The server draws from the durable chatters table (everyone who has
 * chatted on the connected channels, online or offline) and broadcasts the roll over the control
 * stream — the reel below and the OBS overlay play the exact same animation.
 */
export function GiveawayPanel() {
  const { call, status, busy, setBusy } = useAdmin();
  const { giveaway: liveGiveaway } = useControl();

  // ?demo=1 — everything runs on a local mock pool; nothing is broadcast (so no overlay mirror).
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);
  const [demoGiveaway, setDemoGiveaway] = useState<NonNullable<typeof liveGiveaway> | null>(null);

  const giveaway = demo ? demoGiveaway : liveGiveaway;
  const dbReady = demo || (status?.database.ok ?? false);

  const [platform, setPlatform] = useState<PlatformChoice>("all");
  const [minCount, setMinCount] = useState("1");
  const [activeWithin, setActiveWithin] = useState<(typeof ACTIVE_WINDOWS)[number]["value"]>("0");
  const [durationSec, setDurationSec] = useState(8);
  const [eligible, setEligible] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [share, setShare] = useState<ShareCard | null>(null);

  // Live preview of the entry pool whenever a filter changes.
  useEffect(() => {
    if (!dbReady) return;
    if (demo) {
      const now = Date.now();
      setEligible(filterDemo(demoChatters(now), platform, Math.max(1, Number(minCount) || 1), Number(activeWithin), now).length);
      return;
    }
    const params = new URLSearchParams({
      minCount: String(Math.max(1, Number(minCount) || 1)),
      activeWithinMin: activeWithin,
    });
    if (platform !== "all") params.set("platform", platform);
    let stale = false;
    call(`/api/admin/giveaway?${params}`)
      .then(async (res) => {
        if (stale) return;
        if (res.ok) setEligible(((await res.json()) as GiveawayPreview).eligible);
        else setEligible(null);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [call, dbReady, demo, platform, minCount, activeWithin, giveaway?.id]);

  const start = async () => {
    setErr("");
    if (demo) {
      const now = Date.now();
      const pool = filterDemo(demoChatters(now), platform, Math.max(1, Number(minCount) || 1), Number(activeWithin), now);
      if (pool.length === 0) {
        setErr("no eligible chatters under these filters");
        return;
      }
      const winner = pool[Math.floor(Math.random() * pool.length)];
      const names = [...pool.filter((c) => c.name !== winner.name).map((c) => c.name)]
        .sort(() => Math.random() - 0.5)
        .slice(0, 24)
        .concat(winner.name)
        .sort(() => Math.random() - 0.5);
      setDemoGiveaway({
        id: `demo_${now.toString(36)}`,
        names,
        winner: winner.name,
        winnerPlatform: winner.platform,
        eligible: pool.length,
        startedAt: now,
        durationMs: durationSec * 1000,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await call("/api/admin/giveaway", {
        method: "POST",
        body: JSON.stringify({
          platform: platform === "all" ? null : platform,
          minCount: Math.max(1, Number(minCount) || 1),
          activeWithinMin: Number(activeWithin),
          durationSec,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(data?.error ?? `failed (${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (demo) {
      setDemoGiveaway(null);
      return;
    }
    setBusy(true);
    try {
      await call("/api/admin/giveaway", { method: "DELETE" });
    } finally {
      setBusy(false);
    }
  };

  const rolling = giveaway != null && Date.now() < giveaway.startedAt + giveaway.durationMs;
  // The reel animates itself; this re-renders the surrounding chrome when the roll lands.
  const [, setLanded] = useState(0);
  useEffect(() => {
    if (!giveaway) return;
    const remaining = giveaway.startedAt + giveaway.durationMs - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setLanded((n) => n + 1), remaining + 60);
    return () => clearTimeout(id);
  }, [giveaway]);

  if (!dbReady) {
    return (
      <Card title="Giveaway" hint="Pick a random viewer from the saved chatters" icon={Gift}>
        <p className="text-[0.78rem] text-muted-foreground">
          Requires the database — chatters are saved durably only when{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[0.7rem]">DATABASE_PATH</code> is set.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <Card
        title="Draw setup"
        hint={demo ? "Demo mode — rolling against a mock chatter pool" : "Who can win, and how long the roll runs"}
        icon={Dices}
        className="lg:col-span-2"
        status={demo ? <LiveChip label="demo data" /> : undefined}
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Platform
            <Select
              value={platform}
              onChange={setPlatform}
              ariaLabel="Giveaway platform"
              options={[
                { value: "all", label: "All platforms" },
                { value: "twitch", label: "Twitch" },
                { value: "kick", label: "Kick" },
                { value: "x", label: "X" },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Min messages
            <input
              type="number"
              min={1}
              value={minCount}
              onChange={(e) => setMinCount(e.target.value)}
              aria-label="Minimum messages to enter"
              className={cn(INPUT, "py-1.5")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Active within
            <Select value={activeWithin} onChange={setActiveWithin} ariaLabel="Active within" options={[...ACTIVE_WINDOWS]} />
          </label>
          <div className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Roll duration
            <div className="flex items-center gap-0.5 self-start rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationSec(d)}
                  aria-pressed={durationSec === d}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[0.7rem] font-medium normal-case tracking-normal transition-colors",
                    durationSec === d ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.05] pt-3">
            <button type="button" onClick={() => void start()} disabled={busy || rolling || eligible === 0} className={SOLID_BTN}>
              <Dices className="size-3.5" />
              {giveaway && !rolling ? "Roll again" : "Start roll"}
            </button>
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {eligible === null ? "…" : `${eligible.toLocaleString()} eligible`}
            </span>
          </div>
          {err ? <p className="text-[0.72rem] text-[#ef6a61]">{err}</p> : null}
          <p className="text-[0.64rem] text-muted-foreground/70">
            Entries come from every chatter the relay and X bridge have saved — chat counts accumulate even
            while streams are offline. One ticket per name and platform, drawn uniformly.
          </p>
        </div>
      </Card>

      <Card
        title="The draw"
        hint="What viewers see — mirror this on stream via the OBS overlay"
        icon={Gift}
        className="lg:col-span-3"
        bodyClassName="flex flex-col"
        status={rolling ? <LiveChip label="rolling" /> : giveaway ? <LiveChip label="winner up" /> : undefined}
      >
        {giveaway ? (
          <div className="flex flex-1 flex-col">
            <GiveawayReel giveaway={giveaway} className="flex-1 text-[1.05rem]" />
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-3">
              {!rolling ? (
                <span className="flex items-center gap-1.5 text-[0.78rem] text-foreground/90">
                  <PlatformGlyph platform={giveaway.winnerPlatform as Streamer["platforms"][number]} className="size-3.5" />
                  <span className="font-semibold">{giveaway.winner}</span>
                  <span className="text-muted-foreground">on {giveaway.winnerPlatform}</span>
                </span>
              ) : null}
              {!rolling ? (
                <button
                  type="button"
                  onClick={() =>
                    setShare({
                      kind: "giveaway",
                      winner: giveaway.winner,
                      platform: giveaway.winnerPlatform,
                      eligible: giveaway.eligible,
                      dateLabel: new Date(giveaway.startedAt).toLocaleDateString([], {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      }),
                    })
                  }
                  className={cn(QUIET_BTN, "ml-auto")}
                >
                  <Share2 className="size-3.5" />
                  Share
                </button>
              ) : null}
              <button type="button" onClick={() => void clear()} disabled={busy} className={cn(QUIET_BTN, !rolling ? "" : "ml-auto")}>
                <Trash2 className="size-3.5" />
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-sm text-center text-[0.78rem] text-muted-foreground">
              No draw yet — set the filters and start a roll. The winner stays on screen (and on the overlay)
              until cleared.
            </p>
          </div>
        )}
        <p className="mt-3 flex items-center gap-1 text-[0.64rem] text-muted-foreground/70">
          {demo ? (
            "Demo rolls stay on this page — they are not broadcast, so the OBS overlay won't mirror them."
          ) : (
            <>
              OBS source: <span className="font-mono">/overlay-giveaway?bg=transparent</span>
              <CopyButton label="Copy overlay URL" value={() => `${window.location.origin}/overlay-giveaway?bg=transparent`} />
            </>
          )}
        </p>
      </Card>

      <ShareDialog card={share} onClose={() => setShare(null)} />
    </div>
  );
}
