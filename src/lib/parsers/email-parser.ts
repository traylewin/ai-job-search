import { Email, EmailThread, EmailType, EmailAddress } from "@/types";
import { classifyEmail } from "@/lib/email";
import { extractCompanyFromDomain, extractDomain } from "@/lib/company";

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
    type: classifyEmail(msg.subject, msg.body, msg.from.email),
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
      company: extractCompanyFromDomain(extractDomain(
        (messages.find(m => m.from.email !== "alex.chen.dev@gmail.com")?.from || messages[0].from).email
      )),
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
