/**
 * Shared email processing utilities.
 * Used by email/scan, email-processing, email-parser, and add-content routes.
 */
import { v5 as uuidv5 } from "uuid";
import type { EmailType } from "@/types";

export const THREAD_UUID_NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** Deterministic UUID from a custom string id (e.g. Gmail thread id). */
export function toThreadUUID(customId: string): string {
  return uuidv5(customId, THREAD_UUID_NAMESPACE);
}

export const EMAIL_TYPES: readonly EmailType[] = [
  "confirmation",
  "recruiter_outreach",
  "interview_scheduling",
  "rejection",
  "offer",
  "negotiation",
  "follow_up",
  "spam",
  "newsletter",
  "general",
] as const;

/**
 * Rule-based email classifier.
 * Merges the thorough heuristics from email-parser with the simpler
 * scan-time classifier so every code path produces the same result.
 */
export function classifyEmail(
  subject: string,
  body: string,
  fromEmail?: string,
): EmailType {
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const from = (fromEmail || "").toLowerCase();
  const text = `${subjectLower} ${bodyLower}`;

  // Spam/newsletter indicators
  if (
    from.includes("no-reply") &&
    (bodyLower.includes("unsubscribe") || bodyLower.includes("job alert"))
  )
    return "newsletter";
  if (
    bodyLower.includes("unsubscribe") &&
    bodyLower.includes("job opportunities") &&
    !bodyLower.includes("interview")
  )
    return "spam";
  if (text.includes("unsubscribe") && text.includes("newsletter"))
    return "newsletter";

  // Rejection (check before offer so "unfortunately" + "offer" logic is handled)
  if (
    subjectLower.includes("update on your") ||
    bodyLower.includes("decided not to move forward") ||
    bodyLower.includes("not moving forward") ||
    bodyLower.includes("other candidates") ||
    bodyLower.includes("won't be moving forward") ||
    bodyLower.includes("won't be advancing") ||
    bodyLower.includes("unfortunately")
  ) {
    if (bodyLower.includes("offer") && !bodyLower.includes("not"))
      return "offer";
    return "rejection";
  }

  // Offer
  if (
    subjectLower.includes("offer") ||
    bodyLower.includes("pleased to extend") ||
    bodyLower.includes("offer letter") ||
    bodyLower.includes("compensation package") ||
    (text.includes("offer") &&
      (text.includes("extend") ||
        text.includes("compensation") ||
        text.includes("package")))
  )
    return "offer";

  // Negotiation
  if (
    bodyLower.includes("counter") ||
    bodyLower.includes("negotiate") ||
    bodyLower.includes("revised offer") ||
    bodyLower.includes("additional equity") ||
    bodyLower.includes("signing bonus") ||
    text.includes("salary")
  )
    return "negotiation";

  // Interview scheduling
  if (
    subjectLower.includes("interview") ||
    subjectLower.includes("onsite") ||
    subjectLower.includes("phone screen") ||
    bodyLower.includes("technical phone screen") ||
    (text.includes("schedule") &&
      (text.includes("interview") ||
        text.includes("call") ||
        text.includes("meeting")))
  )
    return "interview_scheduling";

  // Application confirmation
  if (
    subjectLower.includes("application received") ||
    subjectLower.includes("application confirmed") ||
    bodyLower.includes("thank you for applying") ||
    bodyLower.includes("received your application") ||
    (text.includes("application") &&
      (text.includes("received") ||
        text.includes("confirmed") ||
        text.includes("thank")))
  )
    return "confirmation";

  // Recruiter outreach
  if (
    bodyLower.includes("came across your profile") ||
    bodyLower.includes("impressed by your") ||
    bodyLower.includes("reaching out") ||
    bodyLower.includes("love to connect") ||
    bodyLower.includes("opportunity that might") ||
    text.includes("recruiter") ||
    text.includes("opportunity") ||
    text.includes("role") ||
    text.includes("position")
  )
    return "recruiter_outreach";

  // Follow-up
  if (
    subjectLower.includes("follow") ||
    bodyLower.includes("checking in") ||
    bodyLower.includes("following up") ||
    bodyLower.includes("just wanted to")
  )
    return "follow_up";

  return "general";
}

// ─── Gmail utilities ─────────────────────────────────────────────

export interface GmailPart {
  mimeType: string;
  body?: { data?: string; size: number };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: GmailPart[];
  };
  internalDate: string;
}

/** Decode a base64url-encoded string (as returned by Gmail API). */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Extract plain-text body from a Gmail message, falling back to HTML→text. */
export function extractGmailBody(msg: GmailMessage): string {
  function findText(parts?: GmailPart[]): string {
    if (!parts) return "";
    for (const p of parts) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return decodeBase64Url(p.body.data);
      }
      if (p.parts) {
        const nested = findText(p.parts);
        if (nested) return nested;
      }
    }
    for (const p of parts) {
      if (p.mimeType === "text/html" && p.body?.data) {
        return decodeBase64Url(p.body.data)
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    return "";
  }

  if (msg.payload.body?.data) {
    return decodeBase64Url(msg.payload.body.data);
  }
  return findText(msg.payload.parts);
}

/** Parse a "Name <email>" string into its components. */
export function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

/** Get a header value from a Gmail message by name (case-insensitive). */
export function getGmailHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value || "";
}

// ─── Job status inference ─────────────────────────────────────────

export type JobStatus = "interested" | "applied" | "interviewing" | "offer" | "rejected" | "withdrew";

const REJECTION_PHRASES = [
  "move forward with another candidate",
  "not considering",
  "unfortunately we won't be advancing",
  "decided not to proceed",
  "position has been filled",
  "not a fit",
  "won't be moving forward",
  "after careful consideration",
  "we regret to inform",
  "not selected",
  "will not be proceeding",
  "not moving forward",
  "other candidates",
  "decided not to move forward",
  "won't be advancing",
  "unfortunately",
];

const OFFER_PHRASES = [
  "pleased to extend",
  "offer letter",
  "compensation package",
  "extend an offer",
  "we'd like to offer",
  "formal offer",
  "offer of employment",
];

const INTERVIEW_PHRASES = [
  "schedule an interview",
  "schedule a call",
  "phone screen",
  "technical interview",
  "on-site interview",
  "interview invitation",
  "interview request",
  "zoom link",
  "meet the team",
  "panel interview",
  "final round",
  "next steps in the interview",
];

const APPLIED_PHRASES = [
  "received your application",
  "application received",
  "application confirmed",
  "thank you for applying",
  "we received your",
];

/**
 * Infer the job application status from email content.
 * Returns null if no clear signal is found (status should not change).
 */
export function inferStatusFromEmail(
  emailType: EmailType,
  subject: string,
  body: string,
): JobStatus | null {
  // Fast path: use the already-classified email type
  if (emailType === "rejection") return "rejected";
  if (emailType === "offer") return "offer";
  if (emailType === "interview_scheduling") return "interviewing";
  if (emailType === "confirmation") return "applied";

  // Deeper text scan for edge cases the classifier might miss
  const text = `${subject} ${body}`.toLowerCase();

  for (const phrase of REJECTION_PHRASES) {
    if (text.includes(phrase)) return "rejected";
  }
  for (const phrase of OFFER_PHRASES) {
    if (text.includes(phrase)) return "offer";
  }
  for (const phrase of INTERVIEW_PHRASES) {
    if (text.includes(phrase)) return "interviewing";
  }
  for (const phrase of APPLIED_PHRASES) {
    if (text.includes(phrase)) return "applied";
  }

  return null;
}

/**
 * Status rank — higher number = further along in the pipeline.
 * "rejected" and "withdrew" are terminal states ranked above "offer"
 * so they are never accidentally overwritten by earlier-stage signals.
 */
const STATUS_RANK: Record<string, number> = {
  interested: 0,
  applied: 1,
  interviewing: 2,
  offer: 3,
  rejected: 4,
  withdrew: 5,
};

/**
 * Returns true if newStatus represents forward progress from currentStatus.
 * Used when replaying a chronologically-sorted batch so older emails
 * don't regress a status that a more recent email already set.
 */
export function isStatusAdvance(currentStatus: string | undefined, newStatus: JobStatus): boolean {
  const current = (currentStatus || "interested").toLowerCase();
  return (STATUS_RANK[newStatus] ?? 0) > (STATUS_RANK[current] ?? 0);
}

/**
 * Returns true if newStatus should replace currentStatus based on a
 * *newer* email (by date). The latest email's signal always wins,
 * except we never overwrite "withdrew" (user-initiated) and we never
 * regress from a terminal state to an earlier-pipeline stage.
 */
export function shouldReplaceStatus(currentStatus: string | undefined, newStatus: JobStatus): boolean {
  const current = (currentStatus || "interested").toLowerCase();
  if (current === "withdrew") return false;
  if (current === newStatus) return false;
  return true;
}
