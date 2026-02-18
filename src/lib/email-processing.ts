import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { db, id as instantId } from "@/lib/db/instant-admin";
import { searchEmails, upsertEmails } from "@/lib/db/pinecone";
import { v5 as uuidv5 } from "uuid";

const NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
function toUUID(customId: string): string {
  return uuidv5(customId, NAMESPACE);
}

export const emailSchema = z.object({
  subject: z.string().describe("Email subject line"),
  fromName: z.string().describe("Sender name"),
  fromEmail: z.string().describe("Sender email address"),
  toName: z.string().describe("Recipient name"),
  toEmail: z.string().describe("Recipient email"),
  date: z.string().describe("Email date in ISO format, or best guess"),
  body: z.string().describe("The email body text"),
  emailType: z
    .enum([
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
    ])
    .describe("The type/category of this email"),
  company: z.string().nullable().describe("Company this email relates to, if any"),
  autoTitle: z.string().describe("A concise title: Subject - From (Company)"),
  matchesExistingThread: z
    .boolean()
    .describe("Whether this email seems to match one of the existing threads provided"),
  matchedThreadId: z
    .string()
    .nullable()
    .describe("The threadId of the matching thread, if matchesExistingThread is true"),
});

export type ParsedEmail = z.infer<typeof emailSchema>;

/**
 * Search Pinecone for existing threads that might match the given email content.
 * Returns a formatted context string for the AI parser.
 */
export async function getExistingThreadContext(content: string): Promise<string> {
  const emailMatches = await searchEmails(content.slice(0, 2000), 10);
  return emailMatches
    .filter((m) => m.metadata)
    .map(
      (m) =>
        `threadId: ${m.metadata!.threadId}, subject: "${m.metadata!.subject}", from: ${m.metadata!.fromName} (${m.metadata!.from}), type: ${m.metadata!.type}`
    )
    .join("\n");
}

/**
 * Use AI to parse raw email content into structured data, with thread-matching context.
 */
export async function parseEmailWithAI(
  anthropic: ReturnType<typeof createAnthropic>,
  modelId: string,
  content: string,
  existingThreadContext: string
): Promise<ParsedEmail> {
  const { object: parsed } = await generateObject({
    model: anthropic(modelId),
    schema: emailSchema,
    prompt: `Parse this email and extract structured data. Also determine if it belongs to an existing email thread.

EXISTING EMAIL THREADS (from vector search):
${existingThreadContext || "No existing threads found."}

EMAIL CONTENT:
${content.slice(0, 8000)}

If the email subject, sender, or content closely matches an existing thread, set matchesExistingThread=true and matchedThreadId to the thread's ID.`,
  });
  return parsed;
}

/**
 * Determine the thread ID for an email.
 * If a gmailThreadId is provided (from webhook), always use it -- this ensures
 * future emails in the same Gmail conversation are grouped together.
 * Otherwise, use the AI-determined thread match or generate a new thread ID.
 */
export async function resolveThreadId(
  userId: string,
  parsed: ParsedEmail,
  gmailThreadId?: string
): Promise<{ threadId: string; isNewThread: boolean }> {
  if (gmailThreadId) {
    const threadResult = await db.query({
      emailThreads: { $: { where: { userId, threadId: gmailThreadId } } },
    });
    const isNew = threadResult.emailThreads.length === 0;
    return { threadId: gmailThreadId, isNewThread: isNew };
  }

  // No Gmail thread ID -- use AI thread matching
  if (parsed.matchesExistingThread && parsed.matchedThreadId) {
    return { threadId: parsed.matchedThreadId, isNewThread: false };
  }

  return { threadId: `thread_pasted_${Date.now()}`, isNewThread: true };
}

/**
 * Save a parsed email to InstantDB and Pinecone.
 * Handles both new threads and appending to existing threads.
 */
export async function saveEmailToDb(
  userId: string,
  parsed: ParsedEmail,
  threadId: string,
  isNewThread: boolean,
  labels: string[] = []
): Promise<{ emailId: string }> {
  const emailId = instantId();
  const date = parsed.date || new Date().toISOString();

  await db.transact(
    db.tx.emails[emailId].update({
      userId,
      threadId,
      subject: parsed.subject,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      toList: [{ name: parsed.toName, email: parsed.toEmail }],
      date,
      body: parsed.body.slice(0, 5000),
      labels,
      emailType: parsed.emailType,
    })
  );

  if (isNewThread) {
    const threadRecordId = toUUID(threadId);
    await db.transact(
      db.tx.emailThreads[threadRecordId].update({
        userId,
        threadId,
        subject: parsed.subject,
        participants: [
          { name: parsed.fromName, email: parsed.fromEmail },
          { name: parsed.toName, email: parsed.toEmail },
        ],
        company: parsed.company || "",
        latestDate: date,
        emailType: parsed.emailType,
        messageCount: 1,
      })
    );
  } else {
    const threadResult = await db.query({
      emailThreads: { $: { where: { userId, threadId } } },
    });
    const existingThread = threadResult.emailThreads[0];
    if (existingThread) {
      await db.transact(
        db.tx.emailThreads[existingThread.id].update({
          messageCount: (existingThread.messageCount || 0) + 1,
          latestDate: date,
        })
      );
    }
  }

  try {
    await upsertEmails([
      {
        id: emailId,
        threadId,
        subject: parsed.subject,
        from: { name: parsed.fromName, email: parsed.fromEmail },
        to: [{ name: parsed.toName, email: parsed.toEmail }],
        date,
        dateParsed: null,
        body: parsed.body,
        labels,
        type: parsed.emailType,
      },
    ]);
  } catch (e) {
    console.error("[EmailProcessing] Pinecone upsert failed:", e);
  }

  return { emailId };
}
