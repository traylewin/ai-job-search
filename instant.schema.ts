import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),

    // ─── Conversations ───
    conversations: i.entity({
      userId: i.string().indexed(),
      title: i.string(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),

    chatMessages: i.entity({
      userId: i.string().indexed(),
      role: i.string(), // "user" | "assistant" | "system"
      content: i.string(),
      parts: i.json().optional(), // serialized message parts for tool calls etc.
      createdAt: i.date(),
    }),

    // ─── Job Postings ───
    jobPostings: i.entity({
      userId: i.string().indexed(),
      filename: i.string(),
      company: i.string().optional(),
      title: i.string().optional(),
      location: i.string().optional(),
      salaryRange: i.string().optional(),
      team: i.string().optional(),
      description: i.string().optional(),
      requirements: i.json().optional(), // string[]
      responsibilities: i.json().optional(), // string[]
      techStack: i.json().optional(), // string[]
      rawText: i.string(),
      parseConfidence: i.string(), // "full" | "partial" | "text-only"
    }),

    // ─── Tracker Entries ───
    trackerEntries: i.entity({
      userId: i.string().indexed(),
      company: i.string().indexed(),
      role: i.string(),
      statusRaw: i.string(),
      statusNormalized: i.string(),
      dateAppliedRaw: i.string(),
      salaryRange: i.string().optional(),
      location: i.string().optional(),
      recruiter: i.string().optional(),
      notes: i.string().optional(),
    }),

    // ─── Emails ───
    emails: i.entity({
      userId: i.string().indexed(),
      threadId: i.string().indexed(),
      subject: i.string(),
      fromName: i.string(),
      fromEmail: i.string(),
      toList: i.json(), // EmailAddress[]
      date: i.string(),
      body: i.string(),
      labels: i.json().optional(), // string[]
      emailType: i.string(), // EmailType
    }),

    // ─── Email Threads ───
    emailThreads: i.entity({
      userId: i.string().indexed(),
      threadId: i.string().indexed(),
      subject: i.string(),
      participants: i.json(), // EmailAddress[]
      company: i.string().optional(),
      latestDate: i.string().optional(),
      emailType: i.string(), // EmailType
      messageCount: i.number(),
    }),

    // ─── Resume ───
    resumeData: i.entity({
      userId: i.string().indexed(),
      name: i.string(),
      contact: i.string(),
      fullText: i.string(),
      summary: i.string().optional(),
      experience: i.string().optional(),
      education: i.string().optional(),
      skills: i.string().optional(),
      projects: i.string().optional(),
      sections: i.json(), // ResumeSection[]
    }),

    // ─── Preferences / Notes ───
    preferencesData: i.entity({
      userId: i.string().indexed(),
      fullText: i.string(),
      salary: i.string().optional(),
      location: i.string().optional(),
      dealBreakers: i.string().optional(),
      excitedCompanies: i.string().optional(),
      lessExcitedCompanies: i.string().optional(),
      interviewQuestions: i.string().optional(),
      negotiation: i.string().optional(),
      timeline: i.string().optional(),
      randomThoughts: i.string().optional(),
      salaryResearch: i.string().optional(),
      sections: i.json(), // { title: string; content: string }[]
    }),
  },

  links: {
    conversationMessages: {
      forward: { on: "conversations", has: "many", label: "messages" },
      reverse: { on: "chatMessages", has: "one", label: "conversation" },
    },
  },

  rooms: {},
});

// This helps TypeScript display better intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
