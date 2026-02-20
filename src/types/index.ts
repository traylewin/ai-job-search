// ─── Company ───

export interface Company {
  id: string;
  name: string;
  emailDomain?: string;
  location?: string;
}

// ─── Job Posting ───

export type ParseConfidence = "full" | "partial" | "text-only";

export interface JobPosting {
  id: string;
  jobId?: string;
  companyId?: string;
  company?: string | null; // transient — used by parsers/ingestion, not persisted to DB
  filename: string;
  title: string | null;
  location: string | null;
  salaryRange: string | null;
  team: string | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  techStack: string[];
  rawText: string;
  parseConfidence: ParseConfidence;
  status?: string;
}

// ─── Email ───

export type EmailType =
  | "confirmation"
  | "recruiter_outreach"
  | "interview_scheduling"
  | "rejection"
  | "offer"
  | "negotiation"
  | "follow_up"
  | "spam"
  | "newsletter"
  | "general";

export interface EmailAddress {
  name: string;
  email: string;
}

export interface Email {
  id: string;
  threadId: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  date: string;
  dateParsed: Date | null;
  body: string;
  labels: string[];
  inReplyTo?: string;
  references?: string[];
  type: EmailType;
}

export interface EmailThread {
  threadId: string;
  subject: string;
  participants: EmailAddress[];
  messages: Email[];
  companyId?: string;
  company?: string | null; // transient — used by parsers/ingestion, not persisted to DB
  latestDate: Date | null;
  type: EmailType;
}

// ─── Tracker ───

export interface TrackerEntry {
  id: string;
  jobPostingId: string;
  companyId?: string;
  role: string;
  dateAppliedRaw: string;
  dateAppliedParsed: Date | null;
  salaryRange: string;
  location: string;
  recruiter: string;
  notes: string;
  lastEventId?: string;
  lastEventTitle?: string;
  lastEventDate?: string;
}

// ─── Resume ───

export interface ResumeSection {
  title: string;
  content: string;
}

export interface Resume {
  fullText: string;
  name: string;
  contact: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  projects: string;
  sections: ResumeSection[];
}

// ─── Preferences ───

export interface Preferences {
  fullText: string;
  salary: string;
  location: string;
  dealBreakers: string;
  excitedCompanies: string;
  lessExcitedCompanies: string;
  interviewQuestions: string;
  negotiation: string;
  timeline: string;
  randomThoughts: string;
  salaryResearch: string;
  sections: { title: string; content: string }[];
}

// ─── Calendar Events ───

export interface CalendarEvent {
  id: string;
  googleEventId: string;
  companyId?: string;
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

// ─── Contacts ───

export interface Contact {
  id: string;
  companyId?: string;
  company?: string; // transient — used by parsers/Pinecone, not persisted to DB
  name: string;
  position?: string;
  location?: string;
  email?: string;
  primaryContact?: boolean;
}

// ─── Alerts ───

export type AlertType = "deadline" | "stale" | "upcoming" | "action";
export type AlertSeverity = "critical" | "warning" | "info";

export interface ProactiveAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  companyName: string;
  actionLabel?: string;
  dueDate?: string;
}
