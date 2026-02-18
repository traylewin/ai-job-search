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
  };
}
