"use client";

import { useEffect, useState } from "react";
import { Check, Pin, Plus, Trash2, Users } from "lucide-react";

import { useControl } from "@/lib/control/client";
import type { StreamSchedule } from "@/lib/streamers/schedule";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { useAdmin } from "./admin-shell";
import { ScheduleCalendar } from "./schedule-calendar";
import { INPUT, LiveChip, QUIET_BTN, SOLID_BTN } from "./ui";

interface RosterDraftRow {
  name: string;
  twitch: string;
  kick: string;
  x: string;
  pinned: boolean;
  schedule: StreamSchedule | null;
}

const toDraft = (
  list: { name: string; handles: { twitch?: string; kick?: string; x?: string }; pinned?: boolean; schedule?: StreamSchedule }[],
): RosterDraftRow[] =>
  list.map((s) => ({
    name: s.name,
    twitch: s.handles.twitch ?? "",
    kick: s.handles.kick ?? "",
    x: s.handles.x ?? "",
    pinned: s.pinned === true,
    schedule: s.schedule ?? null,
  }));

/** Roster editor: drafts seeded from the effective roster, published live as an override. */
export function RosterPanel() {
  const { call, fileRoster, busy, setBusy } = useAdmin();
  const { roster: rosterOverride } = useControl();

  const [rosterDraft, setRosterDraft] = useState<RosterDraftRow[] | null>(null);
  useEffect(() => {
    if (rosterDraft !== null) return;
    const source = rosterOverride ?? fileRoster;
    if (source.length > 0) setRosterDraft(toDraft(source));
  }, [rosterDraft, rosterOverride, fileRoster]);

  const publishRoster = async () => {
    if (!rosterDraft) return;
    setBusy(true);
    try {
      await call("/api/admin/roster", {
        method: "POST",
        body: JSON.stringify({
          streamers: rosterDraft.map((d) => ({
            name: d.name,
            handles: { twitch: d.twitch, kick: d.kick, x: d.x },
            pinned: d.pinned,
            schedule: d.schedule,
          })),
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
      setRosterDraft(toDraft(fileRoster));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
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
              <button type="button" onClick={() => setRosterDraft((cur) => [...(cur ?? []), { name: "", twitch: "", kick: "", x: "", pinned: false, schedule: null }])} className={QUIET_BTN}>
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

    {rosterDraft !== null ? (
      <ScheduleCalendar
        entries={rosterDraft.map((d) => ({
          name: d.name,
          schedule: d.schedule,
          handles: {
            twitch: d.twitch.trim() || undefined,
            kick: d.kick.trim() || undefined,
            x: d.x.trim().replace(/^@/, "") || undefined,
          },
        }))}
        onChange={(index, schedule) =>
          setRosterDraft((cur) => (cur ? cur.map((row, i) => (i === index ? { ...row, schedule } : row)) : cur))
        }
        onPublish={() => void publishRoster()}
        busy={busy}
      />
    ) : null}
    </div>
  );
}
