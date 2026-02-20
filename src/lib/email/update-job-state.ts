/**
 * Server-side: update job posting status based on synced emails.
 * Called after importing emails to reflect status changes.
 *
 * Emails are sorted oldest → newest. Each email with a clear status
 * signal replaces the in-memory status for that company. Only the
 * final status (from the most recent email) is written to the DB.
 */
import { db } from "@/lib/db/instant-admin";
import { inferStatusFromEmail, shouldReplaceStatus } from "./index";
import type { EmailType } from "@/types";

interface EmailRecord {
  subject: string;
  body: string;
  emailType: string;
  date: string;
  companyId?: string;
}

export async function updateJobStateFromEmails(
  userId: string,
  importedEmails: EmailRecord[],
): Promise<{ updated: number }> {
  if (importedEmails.length === 0) return { updated: 0 };

  const [trackerResult, jobsResult] = await Promise.all([
    db.query({ trackerEntries: { $: { where: { userId } } } }),
    db.query({ jobPostings: { $: { where: { userId } } } }),
  ]);

  const trackerByCompanyId = new Map<string, typeof trackerResult.trackerEntries[0]>();
  for (const e of trackerResult.trackerEntries) {
    const cId = e.companyId as string;
    if (cId) trackerByCompanyId.set(cId, e);
  }

  const jobByCompanyId = new Map<string, typeof jobsResult.jobPostings[0]>();
  const jobById = new Map<string, typeof jobsResult.jobPostings[0]>();
  for (const j of jobsResult.jobPostings) {
    const cId = j.companyId as string;
    if (cId) jobByCompanyId.set(cId, j);
    jobById.set(j.id, j);
  }

  // Sort oldest → newest so the last status update wins
  const sorted = [...importedEmails].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Phase 1: walk through emails and compute the final status per company
  const finalStatus = new Map<string, string>();

  for (const email of sorted) {
    const cId = email.companyId;
    if (!cId) continue;

    const tracker = trackerByCompanyId.get(cId);
    const job = tracker?.jobPostingId
      ? jobById.get(tracker.jobPostingId as string)
      : jobByCompanyId.get(cId);
    if (!tracker && !job) continue;

    const inferred = inferStatusFromEmail(
      email.emailType as EmailType,
      email.subject,
      email.body,
    );
    if (!inferred) continue;

    // Current effective status: what we've accumulated so far, or the DB value
    const currentEffective = finalStatus.get(cId)
      || (job?.status as string)
      || "interested";

    if (shouldReplaceStatus(currentEffective, inferred)) {
      finalStatus.set(cId, inferred);
    }
  }

  // Phase 2: write only the final status for each company (single DB write)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txns: any[] = [];

  for (const [cId, newStatus] of finalStatus) {
    const tracker = trackerByCompanyId.get(cId);
    const job = tracker?.jobPostingId
      ? jobById.get(tracker.jobPostingId as string)
      : jobByCompanyId.get(cId);

    // Only write if the final status actually differs from the DB value
    const dbStatus = (job?.status as string) || "interested";
    if (newStatus !== dbStatus && job) {
      txns.push(db.tx.jobPostings[job.id].update({ status: newStatus }));
    }
  }

  if (txns.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < txns.length; i += batchSize) {
      await db.transact(txns.slice(i, i + batchSize));
    }
  }

  return { updated: txns.length };
}
