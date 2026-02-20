/**
 * Server-side query helpers for InstantDB.
 * All queries are scoped to a userId.
 */
import { db, adminQuery } from "./instant-admin";
import { id } from "@instantdb/admin";

/** Strip spaces, hyphens, and underscores for fuzzy company name comparison */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, "");
}

function companyMatches(candidate: string, query: string): boolean {
  const cLower = candidate.toLowerCase();
  const qLower = query.toLowerCase();
  if (cLower.includes(qLower) || qLower.includes(cLower)) return true;
  const cNorm = normalize(candidate);
  const qNorm = normalize(query);
  return cNorm.includes(qNorm) || qNorm.includes(cNorm);
}

// ─── Job Postings ───

export async function getAllJobPostings(userId: string) {
  const result = await db.query({
    jobPostings: { $: { where: { userId } } },
  });
  return result.jobPostings;
}

export async function findJobByCompany(
  userId: string,
  company: string,
  emails?: string[]
) {
  const result = await db.query({
    jobPostings: { $: { where: { userId } } },
  });

  // Try name/filename match first (with normalized fuzzy matching)
  const byName = result.jobPostings.find(
    (j) =>
      companyMatches(j.company || "", company) ||
      companyMatches(j.filename, company)
  );
  if (byName) return byName;

  // Fallback: resolve company from emails via contacts
  if (emails && emails.length > 0) {
    const contactsResult = await db.query({
      contacts: { $: { where: { userId } } },
    });
    for (const email of emails) {
      const emailLower = email.toLowerCase();
      const contact = contactsResult.contacts.find(
        (c) => (c.email || "").toLowerCase() === emailLower
      );
      if (contact?.company) {
        const companyFromContact = (contact.company as string).toLowerCase();
        const match = result.jobPostings.find(
          (j) => (j.company || "").toLowerCase() === companyFromContact
        );
        if (match) return match;
      }
    }
  }

  return null;
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

export async function findTrackerByCompany(
  userId: string,
  company: string,
  emails?: string[]
) {
  const result = await db.query({
    trackerEntries: { $: { where: { userId } } },
  });

  // Try name match first (with normalized fuzzy matching)
  const byName = result.trackerEntries.find((t) =>
    companyMatches(t.company, company)
  );
  if (byName) return byName;

  // Fallback: resolve company from emails via contacts
  if (emails && emails.length > 0) {
    const contactsResult = await db.query({
      contacts: { $: { where: { userId } } },
    });
    for (const email of emails) {
      const emailLower = email.toLowerCase();
      const contact = contactsResult.contacts.find(
        (c) => (c.email || "").toLowerCase() === emailLower
      );
      if (contact?.company) {
        const companyFromContact = (contact.company as string).toLowerCase();
        const match = result.trackerEntries.find((t) =>
          t.company.toLowerCase() === companyFromContact
        );
        if (match) return match;
      }
    }
  }

  return null;
}

export async function getTrackerEntries(
  userId: string,
  filters?: { status?: string; company?: string }
) {
  const result = await db.query({
    trackerEntries: { $: { where: { userId } } },
  });
  let entries = result.trackerEntries;

  if (filters?.company) {
    entries = entries.filter((e) => companyMatches(e.company, filters.company!));
  }

  // Status now lives on job postings — resolve it when filtering by status
  if (filters?.status) {
    const jobResult = await db.query({
      jobPostings: { $: { where: { userId } } },
    });
    const statusByJobId = new Map(
      jobResult.jobPostings.map((j) => [j.id, (j.status as string) || "interested"])
    );
    const lower = filters.status.toLowerCase();
    entries = entries.filter((e) => {
      const jpStatus = (statusByJobId.get(e.jobPostingId as string) || "interested").toLowerCase();
      return jpStatus === lower || jpStatus.includes(lower);
    });
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
    jobPostingId: string;
    company: string;
    role: string;
    dateAppliedRaw: string;
    salaryRange?: string;
    location?: string;
    recruiter?: string;
    notes?: string;
    lastEventId?: string;
    lastEventTitle?: string;
    lastEventDate?: string;
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

export async function updateJobPostingStatus(jobId: string, status: string) {
  await db.transact(db.tx.jobPostings[jobId].update({ status }));
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
  const matched = result.emailThreads.filter(
    (t) =>
      companyMatches((t.company || "") as string, company) ||
      companyMatches(t.subject, company)
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

// ─── Contacts ───

export async function getAllContacts(userId: string) {
  const result = await db.query({
    contacts: { $: { where: { userId } } },
  });
  return result.contacts;
}

export async function getContactsByCompany(userId: string, company: string) {
  const result = await db.query({
    contacts: { $: { where: { userId } } },
  });
  return result.contacts.filter((c) => {
    const cc = (c.company || "") as string;
    if (!cc) return false;
    return companyMatches(cc, company);
  });
}

export async function getPrimaryContactForCompany(userId: string, company: string) {
  const contacts = await getContactsByCompany(userId, company);
  return contacts.find((c) => c.primaryContact) || null;
}

export async function findContactByEmail(userId: string, email: string) {
  const result = await db.query({
    contacts: { $: { where: { userId } } },
  });
  const lower = email.toLowerCase();
  return result.contacts.find(
    (c) => (c.email || "").toLowerCase() === lower
  ) || null;
}

export async function createContact(
  userId: string,
  contact: { company: string; name: string; position?: string; location?: string; email?: string }
) {
  const contactId = crypto.randomUUID();
  await db.transact(
    db.tx.contacts[contactId].update({ userId, ...contact })
  );
  return contactId;
}

export async function updateContact(
  contactId: string,
  updates: Partial<{ name: string; company: string; position: string; location: string; email: string }>
) {
  await db.transact(db.tx.contacts[contactId].update(updates));
}

// ─── Users ───

export async function getUserEmail(userId: string): Promise<string | undefined> {
  try {
    const result = await adminQuery.query({
      $users: { $: { where: { id: userId } } },
    });
    return result.$users?.[0]?.email?.toLowerCase();
  } catch {
    return undefined;
  }
}

// ─── Calendar Events ───

export async function getAllCalendarEvents(userId: string) {
  const result = await db.query({
    calendarEvents: { $: { where: { userId } } },
  });
  return result.calendarEvents;
}

export async function getCalendarEventsByCompany(
  userId: string,
  company: string,
  emails?: string[]
) {
  const result = await db.query({
    calendarEvents: { $: { where: { userId } } },
  });
  const byName = result.calendarEvents.filter((e) => {
    const ec = (e.company as string) || "";
    if (!ec) return false;
    return companyMatches(ec, company);
  });
  if (byName.length > 0) return byName;

  // Fallback: resolve company from emails via contacts, then filter events
  if (emails && emails.length > 0) {
    const contactsResult = await db.query({
      contacts: { $: { where: { userId } } },
    });
    for (const email of emails) {
      const contact = contactsResult.contacts.find(
        (c) => (c.email || "").toLowerCase() === email.toLowerCase()
      );
      if (contact?.company) {
        const resolved = (contact.company as string).toLowerCase();
        const byContact = result.calendarEvents.filter((e) => {
          const ec = ((e.company as string) || "").toLowerCase();
          return ec === resolved;
        });
        if (byContact.length > 0) return byContact;
      }
    }
  }

  return [];
}

export async function getCalendarEventById(userId: string, eventId: string) {
  const result = await db.query({
    calendarEvents: { $: { where: { userId } } },
  });
  return result.calendarEvents.find((e) => e.id === eventId || e.googleEventId === eventId) || null;
}

export async function searchCalendarEventsByDate(userId: string, startDate: string, endDate: string) {
  const result = await db.query({
    calendarEvents: { $: { where: { userId } } },
  });
  const start = new Date(startDate).getTime();
  const end = new Date(endDate + "T23:59:59").getTime();
  return result.calendarEvents.filter((e) => {
    const t = new Date(e.startTime as string).getTime();
    return t >= start && t <= end;
  }).sort((a, b) => new Date(a.startTime as string).getTime() - new Date(b.startTime as string).getTime());
}

export async function createCalendarEvent(
  userId: string,
  data: {
    googleEventId: string;
    company?: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    location?: string;
    attendees?: { name: string; email: string }[];
    googleCalendarLink?: string;
    status?: string;
    eventType?: string;
  }
) {
  const eventId = id();
  await db.transact(
    db.tx.calendarEvents[eventId].update({
      userId,
      ...data,
    })
  );
  return eventId;
}

export async function deleteCalendarEvent(eventId: string) {
  await db.transact(db.tx.calendarEvents[eventId].delete());
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<{
    company: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    location: string;
    eventType: string;
    status: string;
  }>
) {
  await db.transact(db.tx.calendarEvents[eventId].update(updates));
}

// ─── User Settings ───

export async function getUserSettings(userId: string) {
  const result = await db.query({
    userSettings: { $: { where: { userId } } },
  });
  return result.userSettings[0] || null;
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
