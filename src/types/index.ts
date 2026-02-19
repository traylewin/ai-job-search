// ─── Job Posting ───

export type ParseConfidence = "full" | "partial" | "text-only";

export interface JobPosting {
  id: string;
  filename: string;
  company: string | null;
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
  company: string | null;
  latestDate: Date | null;
  type: EmailType;
}

// ─── Tracker ───

export interface TrackerEntry {
  id: string;
  company: string;
  role: string;
  statusRaw: string;
  statusNormalized: string;
  dateAppliedRaw: string;
  dateAppliedParsed: Date | null;
  salaryRange: string;
  location: string;
  recruiter: string;
  notes: string;
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

// ─── Contacts ───

export interface Contact {
  id: string;
  company: string;
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
  company: string;
  actionLabel?: string;
  dueDate?: string;
}
