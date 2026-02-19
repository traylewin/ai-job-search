import { NextResponse } from "next/server";
import { db } from "@/lib/db/instant-admin";

export const maxDuration = 60;

/**
 * POST /api/delete-all-data — Delete all data for a user from InstantDB.
 * Requires x-user-id header.
 */
export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    const [jobs, tracker, emails, threads, resume, prefs, convos, messages, contacts] =
      await Promise.all([
        db.query({ jobPostings: { $: { where: { userId } } } }),
        db.query({ trackerEntries: { $: { where: { userId } } } }),
        db.query({ emails: { $: { where: { userId } } } }),
        db.query({ emailThreads: { $: { where: { userId } } } }),
        db.query({ resumeData: { $: { where: { userId } } } }),
        db.query({ preferencesData: { $: { where: { userId } } } }),
        db.query({ conversations: { $: { where: { userId } } } }),
        db.query({ chatMessages: { $: { where: { userId } } } }),
        db.query({ contacts: { $: { where: { userId } } } }),
      ]);

    const txns = [
      ...jobs.jobPostings.map((r) => db.tx.jobPostings[r.id].delete()),
      ...tracker.trackerEntries.map((r) => db.tx.trackerEntries[r.id].delete()),
      ...emails.emails.map((r) => db.tx.emails[r.id].delete()),
      ...threads.emailThreads.map((r) => db.tx.emailThreads[r.id].delete()),
      ...resume.resumeData.map((r) => db.tx.resumeData[r.id].delete()),
      ...prefs.preferencesData.map((r) => db.tx.preferencesData[r.id].delete()),
      ...convos.conversations.map((r) => db.tx.conversations[r.id].delete()),
      ...messages.chatMessages.map((r) => db.tx.chatMessages[r.id].delete()),
      ...contacts.contacts.map((r) => db.tx.contacts[r.id].delete()),
    ];

    const deleted = txns.length;
    if (deleted > 0) {
      const batchSize = 50;
      for (let i = 0; i < txns.length; i += batchSize) {
        await db.transact(txns.slice(i, i + batchSize));
      }
    }

    console.log(`[DeleteAll] Deleted ${deleted} records for user ${userId}`);
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("[DeleteAll] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
