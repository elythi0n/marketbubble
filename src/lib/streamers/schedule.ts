/** A recurring weekly stream slot. `weekday` is 0=Sun..6=Sat; `hour` is 24h in Pacific Time. */
export interface StreamSchedule {
  /** Human label shown verbatim, e.g. "THURSDAYS 1PM PT". */
  label: string;
  weekday: number;
  hour: number;
}

const SHOW_TIMEZONE = "America/Los_Angeles";

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_SHORT[parts.weekday] ?? 0,
  };
}

/** Wall-clock time in `timeZone` → UTC instant. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const got = zonedParts(new Date(guess), timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const asUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

/** Next future Date matching the schedule's weekday + hour in Pacific Time. */
export function nextOccurrence(schedule: StreamSchedule, from: Date): Date {
  const anchor = zonedParts(from, SHOW_TIMEZONE);

  for (let addDays = 0; addDays < 8; addDays++) {
    const noon = zonedTimeToUtc(anchor.year, anchor.month, anchor.day + addDays, 12, 0, SHOW_TIMEZONE);
    const day = zonedParts(noon, SHOW_TIMEZONE);
    if (day.weekday !== schedule.weekday) continue;
    const slot = zonedTimeToUtc(day.year, day.month, day.day, schedule.hour, 0, SHOW_TIMEZONE);
    if (slot.getTime() > from.getTime()) return slot;
  }

  const nextWeek = zonedTimeToUtc(anchor.year, anchor.month, anchor.day + 7, schedule.hour, 0, SHOW_TIMEZONE);
  return nextWeek;
}

/** Compact "until" string: "2d 4h", "4h 12m", "12m", or a soon/now fallback. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "starting soon";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The show's default slot, used when no roster entry carries its own schedule. */
export const DEFAULT_SCHEDULE: StreamSchedule = { label: "THURSDAYS 1PM PT", weekday: 4, hour: 13 };
