import {
  differenceInDays,
  differenceInBusinessDays,
  addDays,
  addBusinessDays,
  format,
  parseISO,
  isValid,
} from "date-fns";

/**
 * Parse a date string flexibly
 */
export function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO
  const iso = parseISO(dateStr);
  if (isValid(iso)) return iso;

  // Try common formats
  const d = new Date(dateStr);
  if (isValid(d)) return d;

  return null;
}

/**
 * Get the difference between two dates in various units
 */
export function dateDiff(
  date1: string,
  date2: string
): { days: number; businessDays: number; weeks: number } | null {
  const d1 = parseFlexibleDate(date1);
  const d2 = parseFlexibleDate(date2);

  if (!d1 || !d2) return null;

  const days = differenceInDays(d2, d1);
  const businessDays = differenceInBusinessDays(d2, d1);

  return {
    days: Math.abs(days),
    businessDays: Math.abs(businessDays),
    weeks: Math.round(Math.abs(days) / 7 * 10) / 10,
  };
}

/**
 * Add days to a date
 */
export function addDaysToDate(
  dateStr: string,
  numDays: number,
  business: boolean = false
): string | null {
  const d = parseFlexibleDate(dateStr);
  if (!d) return null;

  const result = business ? addBusinessDays(d, numDays) : addDays(d, numDays);
  return format(result, "yyyy-MM-dd");
}

/**
 * Format a date nicely
 */
export function formatDate(
  dateStr: string,
  fmt: string = "MMM d, yyyy"
): string {
  const d = parseFlexibleDate(dateStr);
  if (!d) return dateStr;
  return format(d, fmt);
}

/**
 * Get "X days ago" or "in X days" relative description
 */
export function relativeDate(dateStr: string): string {
  const d = parseFlexibleDate(dateStr);
  if (!d) return "unknown date";

  const now = new Date();
  const days = differenceInDays(now, d);

  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  if (days > 0) return `${days} days ago`;
  return `in ${Math.abs(days)} days`;
}
