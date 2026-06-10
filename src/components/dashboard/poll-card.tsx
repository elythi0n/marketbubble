"use client";

import { useEffect, useState } from "react";
import { BarChart3, Lock, Trophy } from "lucide-react";

import { useControl } from "@/lib/control/client";
import { cn } from "@/lib/utils";

function remaining(endsAt: number, now: number): string {
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Live show poll, pushed from the admin board. Viewers click to vote (re-votable until lock);
 * chat votes from Twitch/Kick (type the option number) merge into the same tally via the relay.
 * When the timer ends the poll locks: the winner is fixed and shown, votes stop counting.
 *
 * Variants: "banner" is the slim strip under the dashboard's top bars (options flow into a row
 * on wide screens); "stage" is a detached card for the broadcast overlay with options always
 * stacked top-to-bottom.
 */
export function PollCard({ variant = "banner" }: { variant?: "banner" | "stage" }) {
  const { poll } = useControl();
  const [myVote, setMyVote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Restore this visitor's pick for the current poll (kept across reloads, per poll id).
  useEffect(() => {
    if (!poll) return;
    try {
      setMyVote(localStorage.getItem(`mb-poll-vote:${poll.id}`));
    } catch {
      setMyVote(null);
    }
  }, [poll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the countdown while open.
  useEffect(() => {
    if (!poll || poll.status !== "open" || !poll.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [poll?.id, poll?.status, poll?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!poll) return null;

  const locked = poll.status === "locked";
  const total = poll.options.reduce((n, o) => n + o.votes + o.chatVotes, 0);

  const vote = (optionId: string) => {
    if (locked) return;
    setMyVote(optionId);
    try {
      localStorage.setItem(`mb-poll-vote:${poll.id}`, optionId);
    } catch {}
    fetch("/api/poll/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pollId: poll.id, optionId }),
    }).catch(() => {});
  };

  const stage = variant === "stage";

  return (
    <div
      className={cn(
        "flex-none",
        stage
          ? "rounded-xl border border-white/10 bg-[#141416]/85 px-3.5 py-3 backdrop-blur-md"
          : "border-b border-white/[0.07] bg-white/[0.02] px-4 py-2",
      )}
    >
      <div className="flex items-center gap-2.5">
        <BarChart3 className="size-3.5 flex-none text-[#aab3c0]" />
        <p className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold text-foreground">{poll.question}</p>
        {locked ? (
          <span className="flex flex-none items-center gap-1.5 rounded-md border border-[#d8b25a]/30 bg-[#d8b25a]/[0.1] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-[#d8b25a]">
            <Lock className="size-3" />
            Final
          </span>
        ) : poll.endsAt ? (
          <span className="flex-none rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-foreground/90">
            {remaining(poll.endsAt, now)}
          </span>
        ) : null}
        <span className="flex-none font-mono text-[0.64rem] tabular-nums text-muted-foreground">
          {total.toLocaleString()} votes
        </span>
      </div>

      {/* Stage stacks options top-to-bottom; the dashboard banner flows them into a row on wide screens. */}
      <div className={cn("mt-1.5 flex flex-col gap-1", !stage && "sm:flex-row sm:gap-1.5")}>
        {poll.options.map((o) => {
          const count = o.votes + o.chatVotes;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isWinner = locked && poll.winner === o.id;
          const isMine = myVote === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => vote(o.id)}
              disabled={locked}
              aria-pressed={isMine}
              className={cn(
                "relative flex-1 overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                isWinner
                  ? "border-[#d8b25a]/45 bg-[#d8b25a]/[0.08]"
                  : isMine
                    ? "border-[#aab3c0]/40 bg-white/[0.05]"
                    : "border-white/[0.08] bg-white/[0.02]",
                locked ? "cursor-default opacity-95" : "hover:bg-white/[0.05]",
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", isWinner ? "bg-[#d8b25a]/15" : "bg-[#aab3c0]/10")}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center gap-2">
                <span className="font-mono text-[0.66rem] text-muted-foreground">{o.id}</span>
                <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium text-foreground">{o.label}</span>
                {isWinner ? <Trophy className="size-3.5 flex-none text-[#d8b25a]" /> : null}
                <span className="flex-none font-mono text-[0.7rem] tabular-nums text-foreground/85">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>

      {!locked ? (
        <p className="mt-1 text-[0.62rem] text-muted-foreground/70">
          {stage ? "Vote with the option number in chat" : "Click to vote, or type the option number in chat"}
        </p>
      ) : null}
    </div>
  );
}
