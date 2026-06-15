"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Trash2, X } from "lucide-react";

import { StreamerAvatar } from "@/components/dashboard/streamer-avatar";
import type { Streamer } from "@/lib/streamers/mock";
import type { StreamSchedule } from "@/lib/streamers/schedule";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { Select, SOLID_BTN } from "./ui";

/**
 * Weekly schedule calendar for the roster page. Each roster entry carries one weekly slot
 * (weekday + hour in Pacific Time — the show's clock); the grid shows everyone's slot, click an
 * empty cell to place a streamer there, click a chip to move or clear it. Edits live in the
 * roster draft and go out with "Publish" like every other roster change.
 */

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Column order: Monday-first week, values are schedule weekday numbers (0=Sun). */
const WEEK_COLS = [1, 2, 3, 4, 5, 6, 0];

export interface CalendarEntry {
  name: string;
  schedule: StreamSchedule | null;
  handles: { twitch?: string; kick?: string; x?: string };
}

/** Minimal Streamer shape so the shared avatar component (and its platform resolution) works. */
function asStreamer(e: CalendarEntry): Streamer {
  const platforms = (["twitch", "kick", "x"] as const).filter((p) => e.handles[p]);
  return {
    id: e.handles.twitch || e.handles.kick || e.name.toLowerCase(),
    name: e.name,
    handles: e.handles,
    platforms,
    live: false,
    viewers: 0,
    title: "",
  } as Streamer;
}

function hour12(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "AM" : "PM"}`;
}

/** Canonical label for a slot, e.g. "THURSDAYS 1PM PT". */
export function slotLabel(weekday: number, hour: number): string {
  return `${DAY_FULL[weekday].toUpperCase()}S ${hour12(hour)} PT`;
}

/** Current Pacific wall-clock weekday + hour (the calendar's "now" marker). */
function pacificNow(): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return { weekday: DAY_SHORT.indexOf(map.weekday ?? "Sun"), hour: Number(map.hour) % 24 };
}

interface PopoverState {
  x: number;
  y: number;
  /** Placing into an empty cell (pick who) or editing an existing slot (move/clear). */
  mode: { type: "place"; weekday: number; hour: number } | { type: "edit"; index: number };
}

function Popover({ state, children, onClose }: { state: PopoverState; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(state.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(state.y + 6, window.innerHeight - r.height - 8)),
    });
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        style={pos}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[151] w-60 rounded-xl border border-hairline-strong bg-card p-2.5 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.9)]"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export function ScheduleCalendar({
  entries,
  onChange,
  onPublish,
  busy,
}: {
  entries: CalendarEntry[];
  /** Set or clear one entry's slot (index into `entries`). */
  onChange: (index: number, schedule: StreamSchedule | null) => void;
  onPublish: () => void;
  busy: boolean;
}) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const now = pacificNow();
  const streamerOf = useMemo(() => entries.map(asStreamer), [entries]);

  // Visible hour range: a sensible primetime window, stretched to include every placed slot.
  const hours = useMemo(() => {
    const slotHours = entries.filter((e) => e.schedule).map((e) => e.schedule!.hour);
    const lo = Math.max(0, Math.min(9, ...slotHours.map((h) => h - 1)));
    const hi = Math.min(23, Math.max(22, ...slotHours.map((h) => h + 1)));
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [entries]);

  const at = (weekday: number, hour: number) =>
    entries.map((e, i) => ({ ...e, index: i })).filter((e) => e.schedule?.weekday === weekday && e.schedule?.hour === hour);
  const unscheduled = entries.map((e, i) => ({ ...e, index: i })).filter((e) => !e.schedule);

  const place = (index: number, weekday: number, hour: number) =>
    onChange(index, { label: slotLabel(weekday, hour), weekday, hour });

  return (
    <Card
      title="Weekly schedule"
      hint="The show's clock — all times Pacific. Click a cell to place a streamer, click a slot to move it."
      icon={CalendarDays}
      bodyClassName="flex flex-col gap-3"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day header */}
          <div className="grid grid-cols-[3.25rem_repeat(7,1fr)] gap-px">
            <span />
            {WEEK_COLS.map((d) => (
              <span
                key={d}
                className={cn(
                  "pb-2 text-center text-[0.64rem] font-semibold uppercase tracking-[0.14em]",
                  d === now.weekday ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {DAY_SHORT[d]}
                {d === now.weekday ? <span className="ml-1 inline-block size-1 -translate-y-0.5 rounded-full bg-feed-ok" /> : null}
              </span>
            ))}
          </div>

          {/* Hour rows */}
          <div className="overflow-hidden rounded-lg border border-hairline">
            {hours.map((h) => (
              <div key={h} className="grid grid-cols-[3.25rem_repeat(7,1fr)] border-b border-hairline last:border-b-0">
                <span className="flex items-center justify-end pr-2 font-mono text-[0.6rem] tabular-nums text-muted-foreground/70">
                  {hour12(h)}
                </span>
                {WEEK_COLS.map((d) => {
                  const slots = at(d, h);
                  const isNow = d === now.weekday && h === now.hour;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={(e) => setPopover({ x: e.clientX, y: e.clientY, mode: { type: "place", weekday: d, hour: h } })}
                      aria-label={`Schedule for ${DAY_FULL[d]} ${hour12(h)} PT`}
                      className={cn(
                        "relative flex min-h-9 flex-wrap content-center items-center gap-1 border-l border-hairline px-1 py-0.5 text-left transition-colors hover:bg-overlay-weak",
                        isNow && "bg-feed-ok/[0.04]",
                      )}
                    >
                      {isNow ? <span className="absolute inset-y-0 left-0 w-[2px] bg-feed-ok/50" aria-hidden /> : null}
                      {slots.map((s) => (
                        <span
                          key={s.index}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPopover({ x: e.clientX, y: e.clientY, mode: { type: "edit", index: s.index } });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              const r = (e.target as HTMLElement).getBoundingClientRect();
                              setPopover({ x: r.left, y: r.bottom, mode: { type: "edit", index: s.index } });
                            }
                          }}
                          title={`${s.name} — ${slotLabel(d, h)}`}
                          className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-overlay-weak py-0.5 pl-1 pr-2 backdrop-blur-sm transition-colors hover:border-hairline-strong hover:bg-overlay-medium"
                        >
                          <StreamerAvatar streamer={streamerOf[s.index]} size={18} rounded="lg" badge={false} showLive={false} dim={false} />
                          <span className="truncate text-[0.66rem] font-semibold leading-tight text-foreground/90">{s.name}</span>
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Unscheduled + publish */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {unscheduled.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-muted-foreground">
            No slot:
            {unscheduled.map((e) => (
              <span
                key={e.index}
                className="flex items-center gap-1.5 rounded-md border border-hairline bg-overlay-weak py-0.5 pl-1 pr-2 text-[0.66rem] font-medium text-foreground/75"
              >
                <StreamerAvatar streamer={streamerOf[e.index]} size={16} rounded="lg" badge={false} showLive={false} dim={false} />
                {e.name || `#${e.index + 1}`}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[0.68rem] text-muted-foreground">Everyone has a slot.</span>
        )}
        <button type="button" onClick={onPublish} disabled={busy} className={cn(SOLID_BTN, "ml-auto")}>
          <Check className="size-3.5" />
          Publish schedule
        </button>
      </div>
      <p className="-mt-1 text-[0.64rem] text-muted-foreground/70">
        Slots drive the dashboard countdowns and live-discovery polling. Publishing pushes the whole roster
        (names, handles, schedule) to every open dashboard.
      </p>

      {popover ? (
        <Popover state={popover} onClose={() => setPopover(null)}>
          {popover.mode.type === "place" ? (
            <PlacePanel
              weekday={popover.mode.weekday}
              hour={popover.mode.hour}
              entries={entries}
              onPick={(index) => {
                if (popover.mode.type !== "place") return;
                place(index, popover.mode.weekday, popover.mode.hour);
                setPopover(null);
              }}
            />
          ) : (
            <EditPanel
              entry={entries[popover.mode.index]}
              streamer={streamerOf[popover.mode.index]}
              onMove={(weekday, hour) => {
                if (popover.mode.type !== "edit") return;
                place(popover.mode.index, weekday, hour);
              }}
              onClear={() => {
                if (popover.mode.type !== "edit") return;
                onChange(popover.mode.index, null);
                setPopover(null);
              }}
              onClose={() => setPopover(null)}
            />
          )}
        </Popover>
      ) : null}
    </Card>
  );
}

function PlacePanel({
  weekday,
  hour,
  entries,
  onPick,
}: {
  weekday: number;
  hour: number;
  entries: CalendarEntry[];
  onPick: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {slotLabel(weekday, hour)}
      </p>
      {entries.map((e, i) =>
        e.name ? (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.76rem] text-foreground/85 transition-colors hover:bg-overlay-weak hover:text-foreground"
          >
            <StreamerAvatar streamer={asStreamer(e)} size={20} badge={false} showLive={false} dim={false} />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {e.schedule ? (
              <span className="font-mono text-[0.6rem] text-muted-foreground">
                {DAY_SHORT[e.schedule.weekday]} {hour12(e.schedule.hour)}
              </span>
            ) : null}
          </button>
        ) : null,
      )}
      <p className="px-1 pt-0.5 text-[0.58rem] text-muted-foreground/70">Picking someone with a slot moves them here.</p>
    </div>
  );
}

function EditPanel({
  entry,
  streamer,
  onMove,
  onClear,
  onClose,
}: {
  entry: CalendarEntry;
  streamer: Streamer;
  onMove: (weekday: number, hour: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const sch = entry.schedule;
  if (!sch) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <StreamerAvatar streamer={streamer} size={24} badge={false} showLive={false} dim={false} />
        <p className="min-w-0 flex-1 truncate text-[0.8rem] font-semibold text-foreground">{entry.name}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-overlay-weak hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <Select
        value={String(sch.weekday)}
        onChange={(v) => onMove(Number(v), sch.hour)}
        ariaLabel="Slot weekday"
        options={WEEK_COLS.map((d) => ({ value: String(d), label: `${DAY_FULL[d]}s` }))}
      />
      <Select
        value={String(sch.hour)}
        onChange={(v) => onMove(sch.weekday, Number(v))}
        ariaLabel="Slot hour"
        options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${hour12(h)} PT` }))}
      />
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-feed-danger/30 bg-feed-danger/[0.08] px-3 text-[0.74rem] font-medium text-feed-danger transition-colors hover:bg-feed-danger/[0.14]"
      >
        <Trash2 className="size-3.5" />
        Remove slot
      </button>
    </div>
  );
}
