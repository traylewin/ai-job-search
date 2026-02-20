import { NextResponse } from "next/server";
import { db } from "@/lib/db/instant-admin";
import { id as instantId } from "@instantdb/admin";
import {
  getAllCompanies,
  getAllContacts,
  getUserEmail,
} from "@/lib/db/instant-queries";
import { upsertEmails } from "@/lib/db/pinecone";
import {
  toThreadUUID,
  classifyEmail,
  parseEmailAddress,
  extractGmailBody,
  getGmailHeader,
  type GmailMessage,
} from "@/lib/email";
import { buildCompanyMatcher, extractDomain } from "@/lib/company";
import { updateJobStateFromEmails } from "@/lib/email/update-job-state";

export const maxDuration = 120;

const MESSAGE_LIMIT = 200;

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  const googleToken = req.headers.get("x-google-token");

  if (!userId) return NextResponse.json({ error: "Missing x-user-id" }, { status: 401 });
  if (!googleToken) return NextResponse.json({ error: "Missing Google token" }, { status: 401 });

  let body: { startDate: string; endDate: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { startDate, endDate } = body;
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

  try {
    const [companies, contacts, userEmail] = await Promise.all([
      getAllCompanies(userId),
      getAllContacts(userId),
      getUserEmail(userId),
    ]);

    const companyRecords = companies
      .filter((c) => c.name)
      .map((c) => ({ id: c.id, name: c.name as string, emailDomain: c.emailDomain as string | undefined }));
    const contactRecords = contacts
      .filter((c) => c.email)
      .map((c) => ({ email: c.email as string, companyId: c.companyId as string | undefined }));

    const userDomain = userEmail ? extractDomain(userEmail) : undefined;
    const matcher = buildCompanyMatcher(companyRecords, contactRecords, userDomain);

    // Build Gmail search query using date range
    const afterDate = new Date(startDate.includes("T") ? startDate : startDate + "T00:00:00");
    const beforeDate = new Date(endDate.includes("T") ? endDate : endDate + "T23:59:59");
    const afterEpoch = Math.floor(afterDate.getTime() / 1000);
    const beforeEpoch = Math.floor(beforeDate.getTime() / 1000);

    // Fetch messages from Gmail
    const listUrl = new URL("https://www.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", `after:${afterEpoch} before:${beforeEpoch} -category:promotions -category:social -category:forums`);
    listUrl.searchParams.set("maxResults", String(MESSAGE_LIMIT));

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${googleToken}` },
    });

    if (listRes.status === 401) {
      return NextResponse.json({ error: "Google token expired or invalid" }, { status: 401 });
    }
    if (!listRes.ok) {
      const errText = await listRes.text();
      return NextResponse.json({ error: `Gmail API error: ${errText}` }, { status: 500 });
    }

    const listData = await listRes.json();
    const messageIds: { id: string; threadId: string }[] = listData.messages || [];

    if (messageIds.length === 0) {
      return NextResponse.json({ success: true, total: 0, imported: 0, skipped: 0, threads: 0 });
    }

    // Fetch full messages in batches
    const batchSize = 20;
    const allMessages: GmailMessage[] = [];

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const fetches = batch.map(async (m) => {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );
        if (msgRes.ok) return msgRes.json() as Promise<GmailMessage>;
        return null;
      });
      const results = await Promise.all(fetches);
      for (const r of results) {
        if (r) allMessages.push(r);
      }
    }

    // Filter for job-related emails and import
    let imported = 0;
    let skipped = 0;
    const threadIds = new Set<string>();
    const userEmailLower = userEmail?.toLowerCase() || "";
    const importedEmailRecords: { subject: string; body: string; emailType: string; date: string; companyId: string; threadId: string }[] = [];

    // Get existing threads to avoid duplicates
    const existingThreadsResult = await db.query({
      emailThreads: { $: { where: { userId } } },
    });
    const existingEmails = await db.query({
      emails: { $: { where: { userId } } },
    });
    const existingEmailDates = new Set(
      existingEmails.emails.map((e) => `${e.threadId}_${e.date}`)
    );
    const existingThreadIds = new Set(
      existingThreadsResult.emailThreads.map((t) => t.threadId)
    );

    for (const msg of allMessages) {
      const from = parseEmailAddress(getGmailHeader(msg, "From"));
      const to = parseEmailAddress(getGmailHeader(msg, "To"));
      const subject = getGmailHeader(msg, "Subject");
      const bodyText = extractGmailBody(msg).slice(0, 5000);
      const date = new Date(parseInt(msg.internalDate)).toISOString();
      const gmailThreadId = msg.threadId;

      const fromLower = from.email.toLowerCase();
      if (fromLower === userEmailLower) {
        skipped++;
        continue;
      }

      // Match sender against known companies/contacts
      const emailMatch = matcher.matchEmail(from.email);
      const textMatch = !emailMatch ? matcher.matchText(`${subject} ${bodyText.slice(0, 500)}`) : null;
      const companyMatch = emailMatch || textMatch;

      if (!companyMatch) {
        skipped++;
        continue;
      }
      const matchedCompanyId = companyMatch.companyId;

      // Skip if we already have this email
      const emailKey = `${gmailThreadId}_${date}`;
      if (existingEmailDates.has(emailKey)) {
        skipped++;
        continue;
      }

      const emailType = classifyEmail(subject, bodyText, from.email);
      const emailId = instantId();

      // Save email
      await db.transact(
        db.tx.emails[emailId].update({
          userId,
          threadId: gmailThreadId,
          subject,
          fromName: from.name,
          fromEmail: from.email,
          toList: [{ name: to.name, email: to.email }],
          date,
          body: bodyText,
          labels: msg.labelIds || [],
          emailType,
        })
      );

      // Create or update thread
      const isNewThread = !existingThreadIds.has(gmailThreadId);
      if (isNewThread) {
        const threadRecordId = toThreadUUID(gmailThreadId);
        await db.transact(
          db.tx.emailThreads[threadRecordId].update({
            userId,
            threadId: gmailThreadId,
            subject,
            participants: [
              { name: from.name, email: from.email },
              { name: to.name, email: to.email },
            ],
            companyId: matchedCompanyId,
            latestDate: date,
            emailType,
            messageCount: 1,
          })
        );
        existingThreadIds.add(gmailThreadId);
        threadIds.add(gmailThreadId);
      } else {
        const existingThread = existingThreadsResult.emailThreads.find(
          (t) => t.threadId === gmailThreadId
        );
        if (existingThread) {
          const updates: Record<string, unknown> = {
            messageCount: (existingThread.messageCount || 0) + 1,
          };
          if (!existingThread.latestDate || date > existingThread.latestDate) {
            updates.latestDate = date;
          }
          if (!existingThread.companyId && matchedCompanyId) {
            updates.companyId = matchedCompanyId;
          }
          await db.transact(db.tx.emailThreads[existingThread.id].update(updates));
        }
        threadIds.add(gmailThreadId);
      }

      existingEmailDates.add(emailKey);

      // Upsert to Pinecone
      try {
        await upsertEmails([{
          id: emailId,
          threadId: gmailThreadId,
          subject,
          from,
          to: [{ name: to.name, email: to.email }],
          date,
          dateParsed: null,
          body: bodyText,
          labels: msg.labelIds || [],
          type: emailType,
        }]);
      } catch { /* best-effort */ }

      imported++;
      importedEmailRecords.push({ subject, body: bodyText, emailType, date, companyId: matchedCompanyId, threadId: gmailThreadId });
    }

    // Update job posting statuses from imported emails
    if (importedEmailRecords.length > 0) {
      try {
        await updateJobStateFromEmails(userId, importedEmailRecords);
      } catch (e) {
        console.error("[Email Scan] Job state update failed:", e);
      }
    }

    // Update emailLastSyncDate
    const settingsResult = await db.query({
      userSettings: { $: { where: { userId } } },
    });
    const existingSettings = settingsResult.userSettings[0];
    const settingsId = existingSettings?.id || instantId();
    await db.transact(
      db.tx.userSettings[settingsId].update({
        userId,
        emailLastSyncDate: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      success: true,
      total: allMessages.length,
      imported,
      skipped,
      threads: threadIds.size,
    });
  } catch (error) {
    console.error("[Email Scan] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
