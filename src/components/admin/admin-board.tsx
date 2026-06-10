"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  Filter,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  MonitorPlay,
  Pin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ToggleRight,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { AdminStatusPayload } from "@/app/api/admin/status/route";
import { useControl } from "@/lib/control/client";
import { MOCK_STREAMERS, type Streamer } from "@/lib/streamers/mock";
import { useStreamers } from "@/lib/streamers/use-streamers";
import { cn } from "@/lib/utils";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Card: icon chip + title + hint header, optional right-side status slot, padded body. */
function Card({
  title,
  hint,
  icon: Icon,
  status,
  children,
  className,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#161619]/85", className)}>
      <header className="flex flex-none items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h3 className="text-[0.84rem] font-semibold text-foreground">{title}</h3>
          {hint ? <p className="mt-0.5 truncate text-[0.64rem] text-muted-foreground">{hint}</p> : null}
        </div>
        {status}
      </header>
      <div className="flex-1 px-4 py-3.5">{children}</div>
    </div>
  );
}

function LiveChip({ label = "live" }: { label?: string }) {
  return (
    <span className="flex flex-none items-center gap-1.5 rounded-md border border-[#46c45a]/25 bg-[#46c45a]/[0.08] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-[#46c45a]">
      <span className="size-1.5 rounded-full bg-[#46c45a]" />
      {label}
    </span>
  );
}

function FinalChip() {
  return (
    <span className="flex flex-none items-center gap-1.5 rounded-md border border-[#d8b25a]/30 bg-[#d8b25a]/[0.1] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-[#d8b25a]">
      <Lock className="size-3" />
      Final
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      className={cn(
        "size-2 flex-none rounded-full",
        ok === null ? "bg-muted-foreground/50" : ok ? "bg-[#46c45a] shadow-[0_0_6px_rgba(70,196,90,0.5)]" : "bg-[#ef6a61]",
      )}
      aria-hidden
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[18px] w-8 flex-none rounded-full transition-colors", checked ? "bg-[#46c45a]/80" : "bg-white/[0.12]")}
    >
      <span className={cn("absolute left-[2px] top-[2px] size-[14px] rounded-full bg-foreground transition-transform", checked ? "translate-x-[14px]" : "translate-x-0")} />
    </button>
  );
}

/** Native select dressed to match the inputs: themed chrome, custom chevron, dark option list. */
function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <span className="relative inline-flex w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={ariaLabel}
        className={cn(INPUT, "cursor-pointer appearance-none py-1.5 pr-7 text-[0.76rem]")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1b1b1f] text-foreground">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

const SOLID_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[0.76rem] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-30";
const GHOST_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-[0.76rem] font-medium text-foreground transition-colors hover:bg-white/[0.1] disabled:opacity-35";
const QUIET_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.76rem] font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-35";
const INPUT =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[0.8rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-white/20";

const POLL_DURATIONS = [
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "No limit" },
];

type AdminTab = "engage" | "roster" | "controls" | "health";

const TABS: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: "engage", label: "Engage", icon: Megaphone },
  { id: "roster", label: "Roster", icon: Users },
  { id: "controls", label: "Controls", icon: ToggleRight },
  { id: "health", label: "Health", icon: Activity },
];

interface RosterDraftRow {
  name: string;
  twitch: string;
  kick: string;
  x: string;
  pinned: boolean;
}

interface FilterDraftRow {
  pattern: string;
  action: "mute" | "highlight";
  field: "text" | "author";
}

/**
 * Internal operator board. The key lives in memory only (gone on reload, like every other key in
 * this app) and is sent as x-admin-key on each request. ADMIN_DISABLED=1 removes the page itself.
 */
export function AdminBoard() {
  const [key, setKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [status, setStatus] = useState<AdminStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");

  const [tab, setTab] = useState<AdminTab>("engage");

  // Live control state (poll tallies, flags, roster override) over the same SSE stream viewers use.
  const { poll, flags, roster: rosterOverride, filters: globalFilters } = useControl();
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState(120);
  const [predictions, setPredictions] = useState<{ question: string }[]>([]);
  useEffect(() => {
    fetch("/api/markets/predictions")
      .then((r) => r.json())
      .then((rows: { question: string }[]) => {
        if (Array.isArray(rows)) setPredictions(rows.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  // Live roster status reuses the same client-side pollers as the dashboard.
  const [roster, setRoster] = useState<Streamer[]>(MOCK_STREAMERS);
  useEffect(() => {
    fetch("/api/streamers")
      .then((r) => r.json())
      .then((data: Streamer[]) => {
        if (Array.isArray(data) && data.length > 0) setRoster(data);
      })
      .catch(() => {});
  }, []);
  const { streamers } = useStreamers(roster);

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (key) headers.set("x-admin-key", key);
      if (init?.body) headers.set("Content-Type", "application/json");
      return fetch(path, { ...init, headers });
    },
    [key],
  );

  const refresh = useCallback(async () => {
    if (!key) return;
    const res = await call("/api/admin/status");
    if (res.ok) {
      const data = (await res.json()) as AdminStatusPayload;
      setStatus(data);
      setBanner(data.announcement?.message ?? "");
    } else if (res.status === 401) {
      setKey(null);
      setStatus(null);
    }
  }, [key, call]);

  useEffect(() => {
    if (!key) return;
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [key, refresh]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = keyInput.trim();
    if (!candidate) return;
    setLoginErr("");
    const res = await fetch("/api/admin/status", { headers: { "x-admin-key": candidate } });
    if (res.ok) {
      setKey(candidate);
      setKeyInput("");
      setStatus((await res.json()) as AdminStatusPayload);
    } else {
      setLoginErr(res.status === 401 ? "Invalid key." : `Login failed (${res.status}).`);
    }
  };

  const setAnnouncement = async () => {
    setBusy(true);
    try {
      await call("/api/admin/announcement", { method: "POST", body: JSON.stringify({ message: banner }) });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const clearAnnouncement = async () => {
    setBusy(true);
    try {
      await call("/api/admin/announcement", { method: "DELETE" });
      setBanner("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const clearXBuffer = async () => {
    setBusy(true);
    try {
      await call("/api/admin/x-chat/clear", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const startPoll = async () => {
    setBusy(true);
    try {
      const res = await call("/api/admin/poll", {
        method: "POST",
        body: JSON.stringify({
          question: pollQuestion,
          options: pollOptions.filter((o) => o.trim()),
          durationSec: pollDuration > 0 ? pollDuration : null,
        }),
      });
      if (res.ok) {
        setPollQuestion("");
        setPollOptions(["", ""]);
      }
    } finally {
      setBusy(false);
    }
  };

  const pollAction = async (action: "lock" | "clear") => {
    setBusy(true);
    try {
      if (action === "lock") await call("/api/admin/poll/lock", { method: "POST" });
      else await call("/api/admin/poll", { method: "DELETE" });
    } finally {
      setBusy(false);
    }
  };

  const setFlag = async (flagKey: string, enabled: boolean) => {
    await call("/api/admin/flags", { method: "POST", body: JSON.stringify({ key: flagKey, enabled }) });
  };

  // ── Roster editor: drafts seeded from the effective roster, published as an override ─────────
  const [rosterDraft, setRosterDraft] = useState<RosterDraftRow[] | null>(null);
  const toDraft = (list: { name: string; handles: { twitch?: string; kick?: string; x?: string }; pinned?: boolean }[]): RosterDraftRow[] =>
    list.map((s) => ({
      name: s.name,
      twitch: s.handles.twitch ?? "",
      kick: s.handles.kick ?? "",
      x: s.handles.x ?? "",
      pinned: s.pinned === true,
    }));
  useEffect(() => {
    if (tab !== "roster" || rosterDraft !== null) return;
    const source = rosterOverride ?? roster;
    if (source.length > 0) setRosterDraft(toDraft(source));
  }, [tab, rosterDraft, rosterOverride, roster]);

  const publishRoster = async () => {
    if (!rosterDraft) return;
    setBusy(true);
    try {
      await call("/api/admin/roster", {
        method: "POST",
        body: JSON.stringify({
          streamers: rosterDraft.map((d) => ({ name: d.name, handles: { twitch: d.twitch, kick: d.kick, x: d.x }, pinned: d.pinned })),
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const resetRoster = async () => {
    setBusy(true);
    try {
      await call("/api/admin/roster", { method: "DELETE" });
      setRosterDraft(toDraft(roster));
    } finally {
      setBusy(false);
    }
  };

  // ── Global chat filters: drafts seeded from the live set, published to every viewer ──────────
  const [filterDraft, setFilterDraft] = useState<FilterDraftRow[] | null>(null);
  useEffect(() => {
    if (tab !== "controls" || filterDraft !== null) return;
    setFilterDraft(globalFilters.map((f) => ({ pattern: f.pattern, action: f.action, field: f.field })));
  }, [tab, filterDraft, globalFilters]);

  const publishFilters = async () => {
    if (!filterDraft) return;
    setBusy(true);
    try {
      await call("/api/admin/filters", {
        method: "POST",
        body: JSON.stringify({ filters: filterDraft.filter((f) => f.pattern.trim()) }),
      });
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = async () => {
    setBusy(true);
    try {
      await call("/api/admin/filters", { method: "DELETE" });
      setFilterDraft([]);
    } finally {
      setBusy(false);
    }
  };

  // ── Login gate ────────────────────────────────────────────────────────────
  if (!key) {
    return (
      <div className="marketing-shell-root">
        <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
        <div className="relative z-10 flex h-dvh flex-col items-center justify-center gap-4 px-6">
          <MarketBubbleLogo className="size-16 text-foreground" />
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="size-5 text-muted-foreground" />
            Admin
          </h1>
          <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
            Operator access. The key is held in memory only and cleared when you leave or reload.
          </p>
          <form onSubmit={login} className="flex w-full max-w-xs flex-col gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Admin API key"
              aria-label="Admin API key"
              autoComplete="off"
              autoFocus
              className={cn(INPUT, "text-center font-mono")}
            />
            <button type="submit" disabled={!keyInput.trim()} className={cn(GHOST_BTN, "h-9 justify-center")}>
              <KeyRound className="size-3.5" />
              Enter
            </button>
            {loginErr ? <p className="text-center text-[0.72rem] text-[#ef6a61]">{loginErr}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  // ── Board ─────────────────────────────────────────────────────────────────
  const live = streamers.filter((s) => s.live);
  const pollTotal = poll ? poll.options.reduce((n, o) => n + o.votes + o.chatVotes, 0) : 0;

  return (
    <div className="marketing-shell-root">
      <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
      <div className="relative z-10 flex h-dvh flex-col overflow-hidden">
        <header className="flex h-14 flex-none items-center gap-3 border-b border-white/[0.07] bg-[#141416] px-4">
          <MarketBubbleLogo className="size-9 text-foreground" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Admin</p>
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">Control room</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refresh()}
              title="Refresh"
              aria-label="Refresh"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <RefreshCw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setKey(null);
                setStatus(null);
              }}
              title="Forget key and leave"
              className={QUIET_BTN}
            >
              <LogOut className="size-3.5" />
              Log out
            </button>
          </div>
        </header>

        <main className="mb-scroll flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5">
            {/* Tab strip */}
            <div className="flex items-center gap-1 self-start rounded-xl border border-white/[0.08] bg-[#161619]/85 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[0.78rem] font-medium transition-colors",
                    tab === t.id ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className={cn("size-3.5", tab === t.id ? "text-foreground" : "text-muted-foreground/80")} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Health ───────────────────────────────────────────────── */}
            {tab === "health" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <Card
                  title="Show status"
                  hint="Roster live state, straight from the platform APIs"
                  icon={MonitorPlay}
                  status={live.length > 0 ? <LiveChip label={`${live.length} live`} /> : undefined}
                >
                  <ul className="flex flex-col gap-2.5">
                    {streamers.map((s) => (
                      <li key={s.id} className="flex items-center gap-2.5">
                        <StatusDot ok={s.live} />
                        <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-foreground">{s.name}</span>
                        <span className="flex items-center gap-1">
                          {s.platforms.map((p) => (
                            <PlatformGlyph key={p} platform={p} className="size-3" />
                          ))}
                        </span>
                        <span className="w-20 text-right font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                          {s.live ? formatCount(s.viewers) : "offline"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-white/[0.05] pt-2.5 text-[0.68rem] text-muted-foreground/80">
                    {live.length > 0
                      ? `${formatCount(live.reduce((n, s) => n + s.viewers, 0))} combined viewers`
                      : "Nobody is live right now"}
                  </p>
                </Card>

                <Card title="Infrastructure" hint="Relay, X bridge, assistant, deployment flags" icon={Activity}>
                  <ul className="flex flex-col gap-3 text-[0.8rem]">
                    <li className="flex items-center gap-2.5">
                      <StatusDot ok={status ? status.relay.configured && status.relay.ok : null} />
                      <span className="flex-1 text-foreground/90">Relay</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {!status?.relay.configured
                          ? "not configured"
                          : status.relay.ok
                            ? `${status.relay.chatters ?? 0} chatters · ${status.relay.mps ?? 0} msg/s`
                            : "unreachable"}
                      </span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <StatusDot ok={(status?.xBridge.buffered ?? 0) > 0 ? true : null} />
                      <span className="flex-1 text-foreground/90">X bridge buffer</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">{status?.xBridge.buffered ?? 0} messages</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Sparkles className="size-3.5 flex-none text-muted-foreground" />
                      <span className="flex-1 text-foreground/90">Assistant</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {!status
                          ? "…"
                          : !status.assistant.enabled
                            ? "disabled"
                            : status.assistant.managed.length > 0
                              ? `server: ${status.assistant.managed.join(", ")}`
                              : "BYOK only"}
                      </span>
                    </li>
                    {status?.assistant.enabled && status.assistant.managed.length > 0 ? (
                      <li className="flex items-center gap-2.5 pl-6">
                        <span className="flex-1 text-[0.72rem] text-muted-foreground">Visitor limits</span>
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {status.assistant.perMinute}/min · {status.assistant.perDay}/day
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  {status ? (
                    <p className="mt-3 border-t border-white/[0.05] pt-2.5 text-[0.68rem] text-muted-foreground/80">
                      Demo {status.flags.demoDisabled ? "disabled" : "enabled"} · auth via {status.flags.keySource} ·{" "}
                      {status.flags.siteUrl}
                    </p>
                  ) : null}
                </Card>
              </div>
            ) : null}

            {/* ── Engage ────────────────────────────────────────────────── */}
            {tab === "engage" ? (
              <div className="grid gap-3 lg:grid-cols-5">
                <Card
                  title="Poll"
                  hint="Click-votes on the site + chat votes via the relay, one tally"
                  icon={BarChart3}
                  className="lg:col-span-3"
                  status={poll ? (poll.status === "locked" ? <FinalChip /> : <LiveChip />) : undefined}
                >
                  {poll ? (
                    <div>
                      <p className="text-[0.88rem] font-semibold text-foreground">{poll.question}</p>
                      <ul className="mt-2.5 flex flex-col gap-1.5">
                        {poll.options.map((o) => {
                          const count = o.votes + o.chatVotes;
                          const pct = pollTotal > 0 ? Math.round((count / pollTotal) * 100) : 0;
                          const isWinner = poll.status === "locked" && poll.winner === o.id;
                          return (
                            <li
                              key={o.id}
                              className={cn(
                                "relative overflow-hidden rounded-lg border px-3 py-2",
                                isWinner ? "border-[#d8b25a]/40 bg-[#d8b25a]/[0.05]" : "border-white/[0.08] bg-white/[0.02]",
                              )}
                            >
                              <span
                                className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isWinner ? "bg-[#d8b25a]/15" : "bg-[#aab3c0]/10")}
                                style={{ width: `${pct}%` }}
                                aria-hidden
                              />
                              <span className="relative flex items-center gap-2.5 text-[0.8rem]">
                                <span className="font-mono text-[0.66rem] text-muted-foreground">{o.id}</span>
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{o.label}</span>
                                {isWinner ? <Trophy className="size-3.5 text-[#d8b25a]" /> : null}
                                <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                                  {count} votes · {o.chatVotes} chat · {pct}%
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-3">
                        {poll.status === "open" ? (
                          <button type="button" onClick={() => void pollAction("lock")} disabled={busy} className={GHOST_BTN}>
                            <Lock className="size-3.5" />
                            End voting now
                          </button>
                        ) : null}
                        <button type="button" onClick={() => void pollAction("clear")} disabled={busy} className={QUIET_BTN}>
                          <Trash2 className="size-3.5" />
                          Remove
                        </button>
                        <span className="ml-auto font-mono text-[0.68rem] tabular-nums text-muted-foreground">
                          {pollTotal.toLocaleString()} total votes
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        placeholder="Question…"
                        aria-label="Poll question"
                        className={INPUT}
                      />
                      {pollOptions.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] font-mono text-[0.7rem] text-muted-foreground">
                            {i + 1}
                          </span>
                          <input
                            type="text"
                            value={o}
                            onChange={(e) => setPollOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                            placeholder={`Option ${i + 1}`}
                            aria-label={`Option ${i + 1}`}
                            className={INPUT}
                          />
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {pollOptions.length < 4 ? (
                          <button type="button" onClick={() => setPollOptions((cur) => [...cur, ""])} className={QUIET_BTN}>
                            <Plus className="size-3.5" />
                            Option
                          </button>
                        ) : null}
                        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
                          {POLL_DURATIONS.map((d) => (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => setPollDuration(d.value)}
                              aria-pressed={pollDuration === d.value}
                              className={cn(
                                "rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors",
                                pollDuration === d.value ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => void startPoll()}
                          disabled={busy || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                          className={cn(SOLID_BTN, "ml-auto")}
                        >
                          <BarChart3 className="size-3.5" />
                          Start poll
                        </button>
                      </div>
                      {predictions.length > 0 ? (
                        <div className="mt-1 border-t border-white/[0.05] pt-2.5">
                          <p className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            <TrendingUp className="size-3" />
                            From Polymarket
                          </p>
                          <div className="flex flex-col">
                            {predictions.map((p) => (
                              <button
                                key={p.question}
                                type="button"
                                onClick={() => {
                                  setPollQuestion(p.question);
                                  setPollOptions(["Yes", "No"]);
                                }}
                                className="truncate rounded-md px-2 py-1.5 text-left text-[0.74rem] text-foreground/75 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                              >
                                {p.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <p className="mt-3 text-[0.64rem] text-muted-foreground/70">
                    OBS source: <span className="font-mono">/overlay-poll?bg=transparent</span>
                  </p>
                </Card>

                <Card
                  title="Announcement"
                  hint="Banner on every open dashboard, pushed instantly"
                  icon={Megaphone}
                  className="lg:col-span-2"
                  status={status?.announcement ? <LiveChip /> : undefined}
                >
                  <textarea
                    value={banner}
                    onChange={(e) => setBanner(e.target.value)}
                    rows={4}
                    maxLength={280}
                    placeholder="Show starts in 10 — get your predictions in…"
                    aria-label="Announcement message"
                    className={cn(INPUT, "resize-none")}
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button type="button" onClick={() => void setAnnouncement()} disabled={busy || !banner.trim()} className={SOLID_BTN}>
                      <Check className="size-3.5" />
                      Publish
                    </button>
                    <button type="button" onClick={() => void clearAnnouncement()} disabled={busy || !status?.announcement} className={QUIET_BTN}>
                      Clear
                    </button>
                  </div>
                  <p className="mt-3 text-[0.64rem] text-muted-foreground/70">In memory only — a restart clears it.</p>
                </Card>
              </div>
            ) : null}

            {/* ── Roster ────────────────────────────────────────────────── */}
            {tab === "roster" ? (
              <Card
                title="Streamer roster"
                hint="Edit the sidebar of every open dashboard — pushed live"
                icon={Users}
                status={rosterOverride ? <LiveChip label="override" /> : undefined}
              >
                {rosterDraft === null ? (
                  <p className="text-[0.76rem] text-muted-foreground">Loading roster…</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_2rem_2rem] gap-2 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                      <span>Name</span>
                      <span>Twitch</span>
                      <span>Kick</span>
                      <span>X</span>
                      <span>Pin</span>
                      <span />
                    </div>
                    {rosterDraft.map((d, i) => {
                      const set = (field: keyof RosterDraftRow, value: string | boolean) =>
                        setRosterDraft((cur) => (cur ? cur.map((row, j) => (j === i ? { ...row, [field]: value } : row)) : cur));
                      return (
                        <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_2rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
                          <input type="text" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" aria-label={`Streamer ${i + 1} name`} className={cn(INPUT, "py-1.5 text-[0.78rem]")} />
                          <input type="text" value={d.twitch} onChange={(e) => set("twitch", e.target.value)} placeholder="twitch login" aria-label={`Streamer ${i + 1} Twitch`} className={cn(INPUT, "py-1.5 font-mono text-[0.74rem]")} />
                          <input type="text" value={d.kick} onChange={(e) => set("kick", e.target.value)} placeholder="kick slug" aria-label={`Streamer ${i + 1} Kick`} className={cn(INPUT, "py-1.5 font-mono text-[0.74rem]")} />
                          <input type="text" value={d.x} onChange={(e) => set("x", e.target.value)} placeholder="@handle" aria-label={`Streamer ${i + 1} X`} className={cn(INPUT, "py-1.5 font-mono text-[0.74rem]")} />
                          <button
                            type="button"
                            onClick={() => set("pinned", !d.pinned)}
                            aria-pressed={d.pinned}
                            aria-label={`${d.pinned ? "Unpin" : "Pin"} ${d.name || `streamer ${i + 1}`}`}
                            title={d.pinned ? "Pinned to the top of the sidebar" : "Pin to the top of the sidebar"}
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                              d.pinned
                                ? "bg-[#d8b25a]/[0.12] text-[#d8b25a] hover:bg-[#d8b25a]/[0.18]"
                                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                            )}
                          >
                            <Pin className={cn("size-3.5", d.pinned && "fill-current")} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRosterDraft((cur) => (cur ? cur.filter((_, j) => j !== i) : cur))}
                            aria-label={`Remove ${d.name || `streamer ${i + 1}`}`}
                            className="inline-flex size-8 items-center justify-center justify-self-end rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-[#ef6a61] sm:justify-self-auto"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
                      {rosterDraft.length < 12 ? (
                        <button type="button" onClick={() => setRosterDraft((cur) => [...(cur ?? []), { name: "", twitch: "", kick: "", x: "", pinned: false }])} className={QUIET_BTN}>
                          <Plus className="size-3.5" />
                          Add streamer
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void resetRoster()} disabled={busy || !rosterOverride} className={cn(QUIET_BTN, "ml-auto")}>
                        Reset to configured
                      </button>
                      <button
                        type="button"
                        onClick={() => void publishRoster()}
                        disabled={busy || rosterDraft.filter((d) => d.name.trim() && (d.twitch.trim() || d.kick.trim() || d.x.trim())).length === 0}
                        className={SOLID_BTN}
                      >
                        <Check className="size-3.5" />
                        Publish roster
                      </button>
                    </div>
                    <p className="text-[0.64rem] text-muted-foreground/70">
                      Each streamer needs a name and at least one handle. In memory — a restart restores the configured
                      roster (streamers.json).
                    </p>
                  </div>
                )}
              </Card>
            ) : null}

            {/* ── Controls ──────────────────────────────────────────────── */}
            {tab === "controls" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <Card title="Live feature flags" hint="Pushed to every open dashboard instantly" icon={ToggleRight}>
                  <ul className="flex flex-col divide-y divide-white/[0.05]">
                    {[
                      { key: "assistant", label: "AI Assistant", hint: "Panel, launcher and palette entries" },
                      { key: "demo", label: "Demo mode", hint: "Switches and the offline nudge; demo viewers snap back to live" },
                      { key: "predictions", label: "Predictions panel", hint: "Polymarket odds panel" },
                    ].map(({ key: flagKey, label, hint }) => {
                      const enabled = flags[flagKey] !== false;
                      return (
                        <li key={flagKey} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="text-[0.82rem] font-medium text-foreground">{label}</p>
                            <p className="mt-0.5 text-[0.66rem] text-muted-foreground">{hint}</p>
                          </div>
                          <Toggle checked={enabled} onChange={(v) => void setFlag(flagKey, v)} label={label} />
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 border-t border-white/[0.05] pt-2.5 text-[0.64rem] text-muted-foreground/70">
                    In memory — a restart restores the build defaults.
                  </p>
                </Card>

                <Card title="Maintenance" hint="Housekeeping between sessions" icon={Trash2}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void clearXBuffer()}
                      disabled={busy}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef6a61]/30 bg-[#ef6a61]/[0.08] px-3 text-[0.76rem] font-medium text-[#ef6a61] transition-colors hover:bg-[#ef6a61]/[0.14] disabled:opacity-35"
                    >
                      <Trash2 className="size-3.5" />
                      Clear X chat buffer
                    </button>
                    <span className="text-[0.7rem] text-muted-foreground">Fresh slate before a session.</span>
                  </div>
                </Card>

                <Card
                  title="Chat filters"
                  hint="Mute or highlight messages on every viewer's feed — applied before their own rules"
                  icon={Filter}
                  status={globalFilters.length > 0 ? <LiveChip label={`${globalFilters.length} active`} /> : undefined}
                  className="lg:col-span-2"
                >
                  {filterDraft === null ? (
                    <p className="text-[0.76rem] text-muted-foreground">Loading filters…</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filterDraft.length > 0 ? (
                        <div className="hidden grid-cols-[1fr_8rem_8rem_2rem] gap-2 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                          <span>Pattern</span>
                          <span>Action</span>
                          <span>Match</span>
                          <span />
                        </div>
                      ) : (
                        <p className="text-[0.76rem] text-muted-foreground">
                          No filters yet. Add a rule to mute spam terms or highlight the hosts for everyone.
                        </p>
                      )}
                      {filterDraft.map((f, i) => {
                        const set = (patch: Partial<FilterDraftRow>) =>
                          setFilterDraft((cur) => (cur ? cur.map((row, j) => (j === i ? { ...row, ...patch } : row)) : cur));
                        return (
                          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2 sm:grid-cols-[1fr_8rem_8rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
                            <input
                              type="text"
                              value={f.pattern}
                              onChange={(e) => set({ pattern: e.target.value })}
                              placeholder="word, phrase or name"
                              aria-label={`Filter ${i + 1} pattern`}
                              className={cn(INPUT, "col-span-2 py-1.5 text-[0.78rem] sm:col-span-1")}
                            />
                            <Select
                              value={f.action}
                              onChange={(v) => set({ action: v })}
                              ariaLabel={`Filter ${i + 1} action`}
                              options={[
                                { value: "mute", label: "Mute" },
                                { value: "highlight", label: "Highlight" },
                              ]}
                            />
                            <Select
                              value={f.field}
                              onChange={(v) => set({ field: v })}
                              ariaLabel={`Filter ${i + 1} match field`}
                              options={[
                                { value: "text", label: "Message" },
                                { value: "author", label: "Author" },
                              ]}
                            />
                            <button
                              type="button"
                              onClick={() => setFilterDraft((cur) => (cur ? cur.filter((_, j) => j !== i) : cur))}
                              aria-label={`Remove filter ${f.pattern || i + 1}`}
                              className="inline-flex size-8 items-center justify-center justify-self-end rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-[#ef6a61] sm:justify-self-auto"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
                        {filterDraft.length < 20 ? (
                          <button
                            type="button"
                            onClick={() => setFilterDraft((cur) => [...(cur ?? []), { pattern: "", action: "mute", field: "text" }])}
                            className={QUIET_BTN}
                          >
                            <Plus className="size-3.5" />
                            Add rule
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void clearFilters()}
                          disabled={busy || globalFilters.length === 0}
                          className={cn(QUIET_BTN, "ml-auto")}
                        >
                          Clear all
                        </button>
                        <button
                          type="button"
                          onClick={() => void publishFilters()}
                          disabled={busy || filterDraft.every((f) => !f.pattern.trim())}
                          className={SOLID_BTN}
                        >
                          <Check className="size-3.5" />
                          Publish filters
                        </button>
                      </div>
                      <p className="text-[0.64rem] text-muted-foreground/70">
                        Mute drops matching messages, highlight emphasizes them — for every viewer. In memory — a
                        restart clears the set.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
