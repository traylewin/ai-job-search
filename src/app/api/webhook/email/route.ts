import { createAnthropic } from "@ai-sdk/anthropic";
import { adminQuery } from "@/lib/db/instant-admin";
import {
  getExistingThreadContext,
  parseEmailWithAI,
  resolveThreadId,
  saveEmailToDb,
} from "@/lib/email-processing";
import { timingSafeEqual } from "crypto";

export const maxDuration = 60;

function verifySecret(provided: string): boolean {
  const expected = process.env.WEBHOOK_SECRET || "";
  if (!expected || !provided) return false;
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Look up a user by their email address in InstantDB's $users table.
 * Returns the userId or null if not found.
 */
async function findUserByEmail(email: string): Promise<string | null> {
  try {
    const result = await adminQuery.query({
      $users: { $: { where: { email: email.toLowerCase() } } },
    });
    const user = result.$users?.[0];
    return user?.id || null;
  } catch (e) {
    console.error("[Webhook] Failed to query $users:", e);
    return null;
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Authenticate via shared secret
  if (!verifySecret(body.secret as string)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    from,
    fromName,
    to,
    subject,
    bodyText,
    date,
    gmailThreadId,
    gmailMessageId,
    labels,
    inReplyTo,
    references,
  } = body as {
    from: string;
    fromName?: string;
    to?: { name: string; email: string }[];
    subject: string;
    bodyText: string;
    date?: string;
    gmailThreadId?: string;
    gmailMessageId?: string;
    labels?: string[];
    inReplyTo?: string;
    references?: string;
  };

  if (!from || !subject || !bodyText) {
    return Response.json(
      { error: "Missing required fields: from, subject, bodyText" },
      { status: 400 }
    );
  }

  // Look up the user by the sender's email
  const userId = await findUserByEmail(from);
  if (!userId) {
    console.warn(`[Webhook] No registered user for email: ${from}`);
    return Response.json(
      { error: `No registered user found for email: ${from}` },
      { status: 200 }
    );
  }

  console.log(
    `[Webhook] Processing email from ${from} (userId: ${userId}), subject: "${subject}", gmailThread: ${gmailThreadId || "none"}`
  );

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    const modelId = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
    const anthropic = createAnthropic({ apiKey });

    // Build a text representation for AI parsing
    const emailText = [
      `From: ${fromName || from} <${from}>`,
      to?.length ? `To: ${to.map((t) => `${t.name} <${t.email}>`).join(", ")}` : "",
      `Subject: ${subject}`,
      `Date: ${date || new Date().toISOString()}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
      references ? `References: ${references}` : "",
      "",
      bodyText,
    ]
      .filter(Boolean)
      .join("\n");

    const existingThreadContext = await getExistingThreadContext(emailText);
    const parsed = await parseEmailWithAI(anthropic, modelId, emailText, existingThreadContext);

    // Override AI-parsed fields with the structured data we already have from Make.com
    parsed.fromEmail = from;
    if (fromName) parsed.fromName = fromName;
    parsed.subject = subject;
    if (date) parsed.date = date;

    const { threadId, isNewThread } = await resolveThreadId(
      userId,
      parsed,
      gmailThreadId || undefined
    );

    const { emailId } = await saveEmailToDb(
      userId,
      parsed,
      threadId,
      isNewThread,
      labels || []
    );

    console.log(
      `[Webhook] Saved email ${emailId} to thread ${threadId} (${isNewThread ? "new" : "existing"}) for user ${userId}`
    );

    return Response.json({
      success: true,
      emailId,
      threadId,
      isNewThread,
      userId,
      parsed: {
        subject: parsed.subject,
        fromName: parsed.fromName,
        company: parsed.company,
        emailType: parsed.emailType,
      },
    });
  } catch (e) {
    console.error("[Webhook] Processing failed:", e);
    return Response.json(
      { error: `Processing failed: ${e}` },
      { status: 500 }
    );
  }
}
