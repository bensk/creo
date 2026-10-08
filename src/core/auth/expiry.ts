import type { Surface } from "./surfaces";

const DAY_MS = 86_400_000;
export const STAFF_SESSION_MS = 7 * DAY_MS; // rolling
export const FAMILY_SESSION_MS = 30 * DAY_MS; // fixed, per device
/** Students share devices, so their sessions end with the school day. */
export const STUDENT_DAY_ENDS_AT_HOUR = 18;

/** Offset of `timeZone` from UTC at `at`, in ms (e.g. -4h for New York in summer). */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of `hour:00` on the local date of `now` in `timeZone`. */
function localTimeToday(now: Date, timeZone: string, hour: number, minute = 0): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute);
  // Correct with the offset at the target instant (handles DST changes during the day).
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
}

/**
 * When a new session expires. Student sessions end at 6 pm school time; a
 * student who signs in after 6 pm (homework) keeps the session until 11:59 pm.
 */
export function sessionExpiry(surface: Surface, now: Date, timeZone: string): Date {
  if (surface === "staff") return new Date(now.getTime() + STAFF_SESSION_MS);
  if (surface === "family") return new Date(now.getTime() + FAMILY_SESSION_MS);
  const endOfDay = localTimeToday(now, timeZone, STUDENT_DAY_ENDS_AT_HOUR);
  return endOfDay > now ? endOfDay : localTimeToday(now, timeZone, 23, 59);
}
