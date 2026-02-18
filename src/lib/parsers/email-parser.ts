import { Email, EmailThread, EmailType, EmailAddress } from "@/types";

interface RawEmail {
  id: string;
  thread_id: string;
  subject: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  date: string;
  body: string;
  labels: string[];
  in_reply_to?: string;
  references?: string[];
}

/**
 * Classify email type from content heuristics
 */
function classifyEmail(email: RawEmail): EmailType {
  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  const from = email.from.email.toLowerCase();

  // Spam/newsletter indicators
  if (
    from.includes("no-reply") &&
    (body.includes("unsubscribe") || body.includes("job alert"))
  )
    return "newsletter";
  if (
    body.includes("unsubscribe") &&
    body.includes("job opportunities") &&
    !body.includes("interview")
  )
    return "spam";

  // Rejection
  if (
    subject.includes("update on your") ||
    body.includes("decided not to move forward") ||
    body.includes("not moving forward") ||
    body.includes("other candidates") ||
    body.includes("won't be moving forward") ||
    body.includes("unfortunately")
  ) {
    if (body.includes("offer") && !body.includes("not")) return "offer";
    return "rejection";
  }

  // Offer
  if (
    subject.includes("offer") ||
    body.includes("pleased to extend") ||
    body.includes("offer letter") ||
    body.includes("compensation package")
  )
    return "offer";

  // Negotiation
  if (
    body.includes("counter") ||
    body.includes("negotiate") ||
    body.includes("revised offer") ||
    body.includes("additional equity") ||
    body.includes("signing bonus")
  )
    return "negotiation";

  // Interview scheduling
  if (
    subject.includes("interview") ||
    subject.includes("onsite") ||
    subject.includes("phone screen") ||
    body.includes("schedule") ||
    body.includes("interview") ||
    body.includes("technical phone screen")
  )
    return "interview_scheduling";

  // Application confirmation
  if (
    subject.includes("application received") ||
    subject.includes("application confirmed") ||
    body.includes("thank you for applying") ||
    body.includes("received your application")
  )
    return "confirmation";

  // Recruiter outreach
  if (
    body.includes("came across your profile") ||
    body.includes("impressed by your") ||
    body.includes("reaching out") ||
    body.includes("love to connect") ||
    body.includes("opportunity that might")
  )
    return "recruiter_outreach";

  // Follow-up
  if (
    subject.includes("follow") ||
    body.includes("checking in") ||
    body.includes("following up") ||
    body.includes("just wanted to")
  )
    return "follow_up";

  return "general";
}

/**
 * Try to extract company name from email address or subject
 */
function extractCompany(email: RawEmail): string | null {
  const domain = email.from.email.split("@")[1];
  if (!domain) return null;

  // Strip common prefixes/suffixes
  const name = domain
    .replace(/\.(com|io|org|co|dev|tech|ai)$/i, "")
    .replace(/^(no-reply\.|careers\.|jobs\.|recruiting\.)/, "");

  if (name && name !== "gmail" && name !== "yahoo" && name !== "outlook") {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return null;
}

/**
 * Parse the full emails JSON into typed Email arrays
 */
export function parseEmails(rawJson: string): Email[] {
  const data = JSON.parse(rawJson);
  const messages: RawEmail[] = data.messages || data;

  return messages.map((msg) => ({
    id: msg.id,
    threadId: msg.thread_id,
    subject: msg.subject,
    from: msg.from,
    to: msg.to,
    date: msg.date,
    dateParsed: safeParseDate(msg.date),
    body: msg.body,
    labels: msg.labels || [],
    inReplyTo: msg.in_reply_to,
    references: msg.references,
    type: classifyEmail(msg),
  }));
}

/**
 * Group emails into threads
 */
export function buildThreads(emails: Email[]): EmailThread[] {
  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const existing = threadMap.get(email.threadId) || [];
    existing.push(email);
    threadMap.set(email.threadId, existing);
  }

  return Array.from(threadMap.entries()).map(([threadId, messages]) => {
    // Sort by date
    messages.sort((a, b) => {
      const da = a.dateParsed?.getTime() || 0;
      const db = b.dateParsed?.getTime() || 0;
      return da - db;
    });

    // Collect unique participants
    const participantMap = new Map<string, EmailAddress>();
    for (const msg of messages) {
      participantMap.set(msg.from.email, msg.from);
      for (const to of msg.to) {
        participantMap.set(to.email, to);
      }
    }

    const latestDate = messages[messages.length - 1]?.dateParsed || null;

    // Determine thread type from the dominant email type
    const typeCounts = new Map<EmailType, number>();
    for (const msg of messages) {
      typeCounts.set(msg.type, (typeCounts.get(msg.type) || 0) + 1);
    }
    // Prioritize certain types
    const priority: EmailType[] = [
      "offer",
      "negotiation",
      "rejection",
      "interview_scheduling",
      "recruiter_outreach",
      "confirmation",
    ];
    let threadType: EmailType = "general";
    for (const t of priority) {
      if (typeCounts.has(t)) {
        threadType = t;
        break;
      }
    }

    return {
      threadId,
      subject: messages[0]?.subject || "No subject",
      participants: Array.from(participantMap.values()),
      messages,
      company: extractCompany({ ...messages[0], from: messages.find(m => m.from.email !== "alex.chen.dev@gmail.com")?.from || messages[0].from } as unknown as RawEmail),
      latestDate,
      type: threadType,
    };
  });
}

function safeParseDate(dateStr: string): Date | null {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Parse all emails from the data directory
 */
export async function getLocalDataEmails(dataDir: string): Promise<{
  emails: Email[];
  threads: EmailThread[];
}> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const raw = await fs.readFile(
    path.join(dataDir, "emails", "inbox.json"),
    "utf-8"
  );
  const emails = parseEmails(raw);
  const threads = buildThreads(emails);

  return { emails, threads };
}
