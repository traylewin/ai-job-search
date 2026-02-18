/**
 * Server-side query helpers for InstantDB.
 * All queries are scoped to a userId.
 */
import { db } from "./instant-admin";

// ─── Job Postings ───

export async function getAllJobPostings(userId: string) {
  const result = await db.query({
    jobPostings: { $: { where: { userId } } },
  });
  return result.jobPostings;
}

export async function findJobByCompany(userId: string, company: string) {
  const result = await db.query({
    jobPostings: { $: { where: { userId } } },
  });
  const lower = company.toLowerCase();
  return (
    result.jobPostings.find(
      (j) =>
        (j.company || "").toLowerCase().includes(lower) ||
        j.filename.toLowerCase().includes(lower)
    ) || null
  );
}

export async function findJobByFilename(userId: string, filename: string) {
  const result = await db.query({
    jobPostings: { $: { where: { userId } } },
  });
  return (
    result.jobPostings.find(
      (j) => j.filename === filename || j.filename.includes(filename)
    ) || null
  );
}

// ─── Tracker ───

export async function getAllTrackerEntries(userId: string) {
  const result = await db.query({
    trackerEntries: { $: { where: { userId } } },
  });
  return result.trackerEntries;
}

export async function findTrackerByCompany(userId: string, company: string) {
  const result = await db.query({
    trackerEntries: { $: { where: { userId } } },
  });
  const lower = company.toLowerCase();
  return (
    result.trackerEntries.find((t) =>
      t.company.toLowerCase().includes(lower)
    ) || null
  );
}

export async function getTrackerEntries(
  userId: string,
  filters?: { status?: string; company?: string }
) {
  const result = await db.query({
    trackerEntries: { $: { where: { userId } } },
  });
  let entries = result.trackerEntries;

  if (filters?.status) {
    const lower = filters.status.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.statusNormalized === lower ||
        e.statusRaw.toLowerCase().includes(lower)
    );
  }

  if (filters?.company) {
    const lower = filters.company.toLowerCase();
    entries = entries.filter((e) => e.company.toLowerCase().includes(lower));
  }

  return entries;
}

export async function updateTrackerEntry(
  entryId: string,
  updates: Record<string, string>
) {
  await db.transact(db.tx.trackerEntries[entryId].update(updates));
}

export async function createTrackerEntry(
  userId: string,
  entry: {
    company: string;
    role: string;
    statusRaw: string;
    statusNormalized: string;
    dateAppliedRaw: string;
    salaryRange?: string;
    location?: string;
    recruiter?: string;
    notes?: string;
  }
) {
  const id = crypto.randomUUID();
  await db.transact(
    db.tx.trackerEntries[id].update({
      userId,
      ...entry,
    })
  );
  return id;
}

export async function deleteJobPosting(jobId: string) {
  await db.transact(db.tx.jobPostings[jobId].delete());
}

export async function deleteTrackerEntry(entryId: string) {
  await db.transact(db.tx.trackerEntries[entryId].delete());
}

export async function deleteEmailThread(userId: string, threadId: string) {
  const emailResult = await db.query({
    emails: { $: { where: { userId, threadId } } },
  });
  const threadResult = await db.query({
    emailThreads: { $: { where: { userId, threadId } } },
  });

  const txns = [
    ...emailResult.emails.map((e) => db.tx.emails[e.id].delete()),
    ...threadResult.emailThreads.map((t) => db.tx.emailThreads[t.id].delete()),
  ];

  if (txns.length > 0) {
    await db.transact(txns);
  }

  return emailResult.emails.map((e) => e.id);
}

// ─── Emails ───

export async function getAllEmails(userId: string) {
  const result = await db.query({
    emails: { $: { where: { userId } } },
  });
  return result.emails;
}

export async function getEmailsByCompany(userId: string, company: string) {
  const result = await db.query({
    emails: { $: { where: { userId } } },
  });
  const lower = company.toLowerCase();
  return result.emails.filter(
    (e) =>
      (e.fromEmail || "").toLowerCase().includes(lower) ||
      (e.fromName || "").toLowerCase().includes(lower) ||
      e.subject.toLowerCase().includes(lower) ||
      e.body.toLowerCase().includes(lower)
  );
}

// ─── Email Threads ───

export async function getAllEmailThreads(userId: string) {
  const result = await db.query({
    emailThreads: { $: { where: { userId } } },
  });
  return result.emailThreads;
}

export async function findThreadById(userId: string, threadId: string) {
  const result = await db.query({
    emailThreads: { $: { where: { userId } } },
  });
  const thread = result.emailThreads.find((t) => t.threadId === threadId);
  if (!thread) return null;

  const emails = await db.query({
    emails: { $: { where: { userId, threadId } } },
  });
  const messages = emails.emails.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return { ...thread, messages };
}

export async function findThreadsByCompany(userId: string, company: string) {
  const result = await db.query({
    emailThreads: { $: { where: { userId } } },
  });
  const lower = company.toLowerCase();
  const matched = result.emailThreads.filter(
    (t) =>
      (t.company || "").toLowerCase().includes(lower) ||
      t.subject.toLowerCase().includes(lower)
  );

  if (matched.length === 0) return [];

  const emails = await db.query({
    emails: { $: { where: { userId } } },
  });
  return matched.map((thread) => {
    const messages = emails.emails
      .filter((e) => e.threadId === thread.threadId)
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    return { ...thread, messages };
  });
}

// ─── Resume ───

export async function getResume(userId: string) {
  const result = await db.query({
    resumeData: { $: { where: { userId } } },
  });
  return result.resumeData[0] || null;
}

// ─── Preferences ───

export async function getPreferences(userId: string) {
  const result = await db.query({
    preferencesData: { $: { where: { userId } } },
  });
  return result.preferencesData[0] || null;
}
