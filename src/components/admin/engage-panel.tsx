"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, Lock, Megaphone, Plus, Trash2, TrendingUp, Trophy } from "lucide-react";

import { useControl } from "@/lib/control/client";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { useAdmin } from "./admin-shell";
import { CopyButton, INPUT, LiveChip, QUIET_BTN, SOLID_BTN, GHOST_BTN } from "./ui";

const POLL_DURATIONS = [
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 0, label: "No limit" },
];

function FinalChip() {
  return (
    <span className="flex flex-none items-center gap-1.5 rounded-md border border-feed-warn/30 bg-feed-warn/[0.1] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-feed-warn">
      <Lock className="size-3" />
      Final
    </span>
  );
}

/** Poll + announcement: the audience-facing levers, pushed to every viewer over SSE. */
export function EngagePanel() {
  const { call, status, refresh, busy, setBusy } = useAdmin();
  const { poll } = useControl();

  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState(120);
  const [predictions, setPredictions] = useState<{ question: string }[]>([]);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    fetch("/api/markets/predictions")
      .then((r) => r.json())
      .then((rows: { question: string }[]) => {
        if (Array.isArray(rows)) setPredictions(rows.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  // Seed the banner draft from the live announcement once status arrives.
  useEffect(() => {
    setBanner(status?.announcement?.message ?? "");
  }, [status?.announcement?.message]);

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

  const pollTotal = poll ? poll.options.reduce((n, o) => n + o.votes + o.chatVotes, 0) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
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
                      isWinner ? "border-feed-warn/40 bg-feed-warn/[0.05]" : "border-hairline bg-overlay-weak",
                    )}
                  >
                    <span
                      className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isWinner ? "bg-feed-warn/15" : "bg-feed-link/10")}
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                    <span className="relative flex items-center gap-2.5 text-[0.8rem]">
                      <span className="font-mono text-[0.66rem] text-muted-foreground">{o.id}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{o.label}</span>
                      {isWinner ? <Trophy className="size-3.5 text-feed-warn" /> : null}
                      <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        {count} votes · {o.chatVotes} chat · {pct}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
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
                <span className="flex size-8 flex-none items-center justify-center rounded-lg border border-hairline bg-overlay-weak font-mono text-[0.7rem] text-muted-foreground">
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
              <div className="flex items-center gap-0.5 rounded-lg border border-hairline bg-overlay-weak p-0.5">
                {POLL_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setPollDuration(d.value)}
                    aria-pressed={pollDuration === d.value}
                    className={cn(
                      "rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors",
                      pollDuration === d.value ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
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
              <div className="mt-1 border-t border-hairline pt-2.5">
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
                      className="truncate rounded-md px-2 py-1.5 text-left text-[0.74rem] text-foreground/75 transition-colors hover:bg-overlay-weak hover:text-foreground"
                    >
                      {p.question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1 text-[0.64rem] text-muted-foreground/70">
          OBS source: <span className="font-mono">/overlay-poll?bg=transparent</span>
          <CopyButton label="Copy overlay URL" value={() => `${window.location.origin}/overlay-poll?bg=transparent`} />
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
  );
}
