/**
 * Shared calendar event processing utilities.
 * Used by calendar/scan route and agent tools.
 */

export const EVENT_TYPES = [
  "interview",
  "phone_screen",
  "technical_interview",
  "onsite",
  "chat",
  "info_session",
  "other",
] as const;

export type CalendarEventType = (typeof EVENT_TYPES)[number];

/** Rule-based classifier for calendar event type. */
export function classifyEventType(title: string, description: string): CalendarEventType {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("phone screen") || text.includes("phonescreen")) return "phone_screen";
  if (text.includes("onsite") || text.includes("on-site") || text.includes("final round")) return "onsite";
  if (text.includes("technical") && text.includes("interview")) return "technical_interview";
  if (text.includes("interview") || text.includes("hiring")) return "interview";
  if (text.includes("coffee") || text.includes("lunch") || text.includes("meet")) return "chat";
  if (text.includes("info session") || text.includes("webinar")) return "info_session";
  return "other";
}

/** Build a Google Calendar deep link for a specific event. */
export function buildCalendarEventLink(eventId: string, calendarId: string): string {
  const raw = `${eventId} ${calendarId}`;
  const eid = Buffer.from(raw).toString("base64");
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}

// ─── Job status inference ─────────────────────────────────────────

import type { JobStatus } from "@/lib/email";

/**
 * Infer the job application status from a calendar event.
 * Any interview-type event implies "interviewing".
 * Returns null for non-interview events (e.g. coffee chat, info session).
 */
export function inferStatusFromEvent(eventType: CalendarEventType): JobStatus | null {
  switch (eventType) {
    case "interview":
    case "phone_screen":
    case "technical_interview":
    case "onsite":
      return "interviewing";
    default:
      return null;
  }
}
