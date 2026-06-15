"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Trophy } from "lucide-react";

import { useControl } from "@/lib/control/client";

function remaining(endsAt: number, now: number): string {
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * OBS poll overlay: the active poll only, big type, live tallies pushed over the control stream.
 * Renders nothing when no poll is active (invisible on a transparent source).
 *
 * Query params:
 *   bg=transparent      transparent background for OBS (default: graphite, for previewing)
 *   scale=<0.7–2>       size multiplier (default 1)
 */
function PollOverlay() {
  const params = useSearchParams();
  const bg = params.get("bg") ?? "dark";
  const scale = Math.min(2, Math.max(0.7, Number(params.get("scale")) || 1));

  const { poll } = useControl();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (bg !== "transparent") return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, [bg]);

  useEffect(() => {
    if (!poll || poll.status !== "open" || !poll.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [poll?.id, poll?.status, poll?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = poll?.status === "locked";
  const total = poll ? poll.options.reduce((n, o) => n + o.votes + o.chatVotes, 0) : 0;

  return (
    <div
      className="overlay-root flex h-dvh items-end justify-center overflow-hidden p-6"
      style={{ background: bg === "transparent" ? "transparent" : "var(--background)", fontSize: `${scale}rem` }}
    >
      {poll ? (
        <div className="w-full max-w-[34em] rounded-2xl border border-hairline-strong bg-sidebar/95 p-[1.1em] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-[0.6em]">
            <p className="min-w-0 flex-1 text-[1.15em] font-bold leading-snug text-foreground">{poll.question}</p>
            {locked ? (
              <span className="flex flex-none items-center gap-[0.35em] rounded-md border border-feed-warn/35 bg-feed-warn/[0.12] px-[0.6em] py-[0.25em] text-[0.62em] font-bold uppercase tracking-widest text-feed-warn">
                <Lock style={{ width: "1.1em", height: "1.1em" }} />
                Final
              </span>
            ) : poll.endsAt ? (
              <span className="flex-none rounded-md border border-hairline-strong bg-black/40 px-[0.55em] py-[0.2em] font-mono text-[0.95em] font-bold tabular-nums text-foreground">
                {remaining(poll.endsAt, now)}
              </span>
            ) : null}
          </div>

          <div className="mt-[0.8em] flex flex-col gap-[0.45em]">
            {poll.options.map((o) => {
              const count = o.votes + o.chatVotes;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const isWinner = locked && poll.winner === o.id;
              return (
                <div
                  key={o.id}
                  className={`relative overflow-hidden rounded-xl border px-[0.8em] py-[0.55em] ${
                    isWinner ? "border-feed-warn/50 bg-feed-warn/[0.08]" : "border-hairline bg-overlay-weak"
                  }`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 transition-[width] duration-700 ${isWinner ? "bg-feed-warn/20" : "bg-feed-link/12"}`}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <span className="relative flex items-center gap-[0.6em]">
                    <span className="font-mono text-[0.78em] text-muted-foreground">{o.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[0.95em] font-semibold text-foreground">{o.label}</span>
                    {isWinner ? <Trophy className="flex-none text-feed-warn" style={{ width: "1.1em", height: "1.1em" }} /> : null}
                    <span className="flex-none font-mono text-[0.9em] font-bold tabular-nums text-foreground">{pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-[0.7em] text-center text-[0.66em] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {locked ? `${total.toLocaleString()} votes · locked` : `Type 1–${poll.options.length} in chat or vote on marketbubble.virta.lol`}
          </p>
        </div>
      ) : bg !== "transparent" ? (
        <p className="m-auto text-sm text-muted-foreground">No active poll — start one from /admin</p>
      ) : null}
    </div>
  );
}

export default function PollOverlayPage() {
  return (
    <Suspense fallback={null}>
      <PollOverlay />
    </Suspense>
  );
}
