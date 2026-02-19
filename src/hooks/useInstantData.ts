"use client";

import { db, id } from "@/lib/db/instant";

// ─── Internal helper ───

function useUserId(): string | undefined {
  const { user } = db.useAuth();
  return user?.id;
}

// Re-export so components that need the raw ID for API fetch headers can use it
export { useUserId };

// ─── Query hooks (auto-scoped to current user) ───

export function useJobPostings() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { jobPostings: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, jobPostings: data?.jobPostings || [] };
}

export function useTrackerEntries() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { trackerEntries: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, entries: data?.trackerEntries || [] };
}

export function useEmailThreads() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { emailThreads: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, threads: data?.emailThreads || [] };
}

export function useEmailsByThread(threadId: string | null) {
  const { isLoading, error, data } = db.useQuery(
    threadId ? { emails: { $: { where: { threadId } } } } : null
  );
  const emails = (data?.emails || []).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return { isLoading, error, emails };
}

export function useConversations() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId
      ? { conversations: { $: { where: { userId } }, messages: {} } }
      : null
  );

  const conversations = (data?.conversations || []).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return { isLoading, error, conversations };
}

export function useConversationMessages(conversationId: string | null) {
  const { isLoading, error, data } = db.useQuery(
    conversationId
      ? {
          chatMessages: {
            $: { where: { "conversation.id": conversationId } },
          },
        }
      : null
  );

  const messages = (data?.chatMessages || []).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { isLoading, error, messages };
}

export function useContactsByCompany(company: string | undefined) {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { contacts: { $: { where: { userId } } } } : null
  );
  const companyLower = company?.toLowerCase() || "";
  const contacts = (data?.contacts || []).filter((c) => {
    if (!companyLower) return false;
    const cc = (c.company as string || "").toLowerCase();
    if (!cc) return false;
    return cc === companyLower || cc.includes(companyLower) || companyLower.includes(cc);
  });
  return { isLoading, error, contacts };
}

export function useCalendarEvents() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { calendarEvents: { $: { where: { userId } } } } : null
  );
  const events = (data?.calendarEvents || []).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  return { isLoading, error, events };
}

export function useCalendarEventsByCompany(company: string | undefined) {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { calendarEvents: { $: { where: { userId } } } } : null
  );
  const companyLower = company?.toLowerCase() || "";
  const events = (data?.calendarEvents || []).filter((e) => {
    if (!companyLower) return false;
    const ec = (e.company || "").toLowerCase();
    if (!ec) return false;
    return ec === companyLower || ec.includes(companyLower) || companyLower.includes(ec);
  }).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  return { isLoading, error, events };
}

export function useUserSettings() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { userSettings: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, settings: data?.userSettings?.[0] || null };
}

export function useResumeData() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { resumeData: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, resume: data?.resumeData?.[0] || null };
}

export function usePreferencesData() {
  const userId = useUserId();
  const { isLoading, error, data } = db.useQuery(
    userId ? { preferencesData: { $: { where: { userId } } } } : null
  );
  return { isLoading, error, preferences: data?.preferencesData?.[0] || null };
}

// ─── Write operations (hook that returns userId-bound actions) ───

export function useActions() {
  const userId = useUserId();

  return {
    userId,

    createConversation(title: string) {
      if (!userId) throw new Error("Not authenticated");
      const convId = id();
      const now = Date.now();
      db.transact(
        db.tx.conversations[convId].update({
          userId,
          title,
          createdAt: now,
          updatedAt: now,
        })
      );
      return convId;
    },

    saveMessage(
      conversationId: string,
      role: string,
      content: string,
      parts?: unknown
    ) {
      if (!userId) throw new Error("Not authenticated");
      const msgId = id();
      const now = Date.now();
      db.transact([
        db.tx.chatMessages[msgId]
          .update({
            userId,
            role,
            content,
            parts: parts || null,
            createdAt: now,
          })
          .link({ conversation: conversationId }),
        db.tx.conversations[conversationId].update({ updatedAt: now }),
      ]);
      return msgId;
    },

    updateTrackerEntry(
      entryId: string,
      updates: Partial<{
        statusRaw: string;
        statusNormalized: string;
        notes: string;
        recruiter: string;
        salaryRange: string;
      }>
    ) {
      db.transact(db.tx.trackerEntries[entryId].update(updates));
    },

    deleteTrackerEntry(entryId: string) {
      db.transact(db.tx.trackerEntries[entryId].delete());
    },

    deleteConversation(conversationId: string) {
      db.transact(db.tx.conversations[conversationId].delete());
    },

    updatePreferences(
      preferencesId: string,
      updates: {
        fullText?: string;
        sections?: { title: string; content: string }[];
      }
    ) {
      if (!userId) throw new Error("Not authenticated");
      db.transact(db.tx.preferencesData[preferencesId].update({ ...updates, userId }));
    },

    updateResume(
      resumeId: string,
      updates: {
        name?: string;
        contact?: string;
        fullText?: string;
        sections?: { title: string; content: string }[];
      }
    ) {
      if (!userId) throw new Error("Not authenticated");
      db.transact(db.tx.resumeData[resumeId].update({ ...updates, userId }));
    },

    addContact(contact: { company: string; name: string; position?: string; location?: string; email?: string }) {
      if (!userId) throw new Error("Not authenticated");
      const contactId = id();
      db.transact(
        db.tx.contacts[contactId].update({
          userId,
          company: contact.company,
          name: contact.name,
          position: contact.position || "",
          location: contact.location || "",
          email: contact.email || "",
        })
      );
      return contactId;
    },

    updateContact(
      contactId: string,
      updates: Partial<{ name: string; company: string; position: string; location: string; email: string }>
    ) {
      if (!userId) throw new Error("Not authenticated");
      db.transact(db.tx.contacts[contactId].update(updates));
    },

    deleteContact(contactId: string) {
      db.transact(db.tx.contacts[contactId].delete());
    },

    setPrimaryContact(contactId: string, company: string, allContactIds: string[]) {
      if (!userId) throw new Error("Not authenticated");
      const txns = allContactIds.map((cid) =>
        db.tx.contacts[cid].update({ primaryContact: cid === contactId })
      );
      db.transact(txns);
    },

    updateJobPosting(
      jobId: string,
      updates: Partial<{
        company: string;
        title: string;
        location: string;
        salaryRange: string;
        team: string;
        description: string;
        requirements: string[];
        responsibilities: string[];
        techStack: string[];
        rawText: string;
        url: string;
      }>
    ) {
      if (!userId) throw new Error("Not authenticated");
      db.transact(db.tx.jobPostings[jobId].update({ ...updates, userId }));
    },

    updateUserSettings(
      settingsId: string | null,
      updates: Partial<{ jobSearchStartDate: string; calendarLastSyncDate: string }>
    ) {
      if (!userId) throw new Error("Not authenticated");
      const sid = settingsId || id();
      db.transact(db.tx.userSettings[sid].update({ ...updates, userId }));
      return sid;
    },
  };
}
