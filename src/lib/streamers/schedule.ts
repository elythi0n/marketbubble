/** A recurring weekly stream slot. `weekday` is 0=Sun..6=Sat; `hour` is 24h local-ish. */
export interface StreamSchedule {
  /** Human label shown verbatim, e.g. "THURSDAYS 1PM PST". */
  label: string;
  weekday: number;
  hour: number;
}

/** Next future Date matching the schedule's weekday + hour. */
export function nextOccurrence(schedule: StreamSchedule, from: Date): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(schedule.hour);
  let days = (schedule.weekday - next.getDay() + 7) % 7;
  if (days === 0 && next.getTime() <= from.getTime()) days = 7;
  next.setDate(next.getDate() + days);
  return next;
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
export const DEFAULT_SCHEDULE: StreamSchedule = { label: "THURSDAYS 1PM PST", weekday: 4, hour: 13 };
