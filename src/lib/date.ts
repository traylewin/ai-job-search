/**
 * Friendly relative date formatting.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

export function formatFriendlyDate(
  dateInput: string | number | Date,
  now: number = Date.now(),
): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const ts = d.getTime();
  if (isNaN(ts)) return String(dateInput);

  const diff = now - ts;
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;

  if (absDiff < MINUTE) return "just now";

  if (absDiff < HOUR) {
    const mins = Math.floor(absDiff / MINUTE);
    const label = `${mins} min${mins === 1 ? "" : "s"} ago`;
    return isFuture ? `in ${mins} min${mins === 1 ? "" : "s"}` : label;
  }

  if (absDiff < DAY) {
    const hours = Math.floor(absDiff / HOUR);
    const label = `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return isFuture ? `in ${hours} hour${hours === 1 ? "" : "s"}` : label;
  }

  if (absDiff < WEEK - 1) {
    const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dayName} ${time}`;
  }

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFullDate(dateInput: string | number | Date): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
