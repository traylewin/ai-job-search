import { getLocalDataJobPostings } from "@/lib/parsers/html-parser";
import { getLocalDataEmails } from "@/lib/parsers/email-parser";
import { getLocalDataTrackerCSV } from "@/lib/parsers/csv-parser";
import { getLocalDataResume } from "@/lib/parsers/resume-parser";
import { getLocalDataNotes } from "@/lib/parsers/notes-parser";
import { db } from "@/lib/db/instant-admin";
import { upsertJobPostings, upsertEmails, upsertResumeSections } from "@/lib/db/pinecone";
import { v4 as uuid, v5 as uuidv5 } from "uuid";
import path from "path";

// Fixed namespace for deterministic UUID generation from custom IDs
const NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

export interface SampleDataLoadStatus {
  resumeLoaded: boolean;
  emailsLoaded: boolean;
  jobsLoaded: boolean;
  notesLoaded: boolean;
  trackerLoaded: boolean;
}

function toUUID(customId: string): string {
  return uuidv5(customId, NAMESPACE);
}

function getDataDir(): string {
  return path.join(process.cwd(), (process.env.DATA_DIR || "data").trim());
}

export interface IngestResults {
  instantdb: {
    jobPostings: number;
    trackerEntries: number;
    emails: number;
    emailThreads: number;
    resume: number;
    preferences: number;
    errors: string[];
  };
  pinecone: {
    jobPostings: number;
    emails: number;
    resumeSections: number;
    errors: string[];
  };
  skipped: string[];
  loadStatus: SampleDataLoadStatus;
  summary: {
    totalJobs: number;
    totalEmails: number;
    totalThreads: number;
    trackerEntries: number;
  };
}

/**
 * Parse all local data files, write to InstantDB and upsert vectors to Pinecone.
 * The caller passes `loadStatus` indicating which sources are already loaded;
 * those sources are skipped. Use `force: true` to ignore the status and re-import everything.
 * Returns the results plus an updated `loadStatus` reflecting what succeeded.
 */
export async function ingestAllData(
  userId: string,
  options?: { force?: boolean; loadStatus?: Partial<SampleDataLoadStatus> }
): Promise<IngestResults> {
  const dataDir = getDataDir();
  console.log("[Ingest] Parsing local files from:", dataDir);
  const start = Date.now();

  const status: SampleDataLoadStatus = {
    resumeLoaded: false,
    emailsLoaded: false,
    jobsLoaded: false,
    notesLoaded: false,
    trackerLoaded: false,
    ...options?.loadStatus,
  };

  const skipJobs = !options?.force && status.jobsLoaded;
  const skipEmails = !options?.force && status.emailsLoaded;
  const skipTracker = !options?.force && status.trackerLoaded;
  const skipResume = !options?.force && status.resumeLoaded;
  const skipNotes = !options?.force && status.notesLoaded;

  const results: IngestResults = {
    instantdb: {
      jobPostings: 0,
      trackerEntries: 0,
      emails: 0,
      emailThreads: 0,
      resume: 0,
      preferences: 0,
      errors: [],
    },
    pinecone: {
      jobPostings: 0,
      emails: 0,
      resumeSections: 0,
      errors: [],
    },
    skipped: [],
    loadStatus: { ...status },
    summary: {
      totalJobs: 0,
      totalEmails: 0,
      totalThreads: 0,
      trackerEntries: 0,
    },
  };

  if (skipJobs) results.skipped.push("job_postings");
  if (skipEmails) results.skipped.push("emails");
  if (skipTracker) results.skipped.push("tracker");
  if (skipResume) results.skipped.push("resume");
  if (skipNotes) results.skipped.push("notes");

  if (results.skipped.length === 5) {
    console.log("[Ingest] All directories already imported — nothing to do.");
    return results;
  }

  console.log(
    results.skipped.length > 0
      ? `[Ingest] Skipping already-imported: ${results.skipped.join(", ")}`
      : "[Ingest] No directories previously imported — full ingest"
  );

  // ═══ Parse only the sources that need importing ═══

  const jobPostings = skipJobs ? [] : await getLocalDataJobPostings(dataDir);
  const emailData = skipEmails
    ? { emails: [], threads: [] }
    : await getLocalDataEmails(dataDir);
  const tracker = skipTracker ? [] : await getLocalDataTrackerCSV(dataDir);
  const resume = skipResume ? null : await getLocalDataResume(dataDir);
  const preferences = skipNotes ? null : await getLocalDataNotes(dataDir);

  const { emails, threads } = emailData;

  results.summary = {
    totalJobs: jobPostings.length,
    totalEmails: emails.length,
    totalThreads: threads.length,
    trackerEntries: tracker.length,
  };

  console.log(
    `[Ingest] Parsed in ${Date.now() - start}ms:`,
    `${jobPostings.length} jobs,`,
    `${emails.length} emails (${threads.length} threads),`,
    `${tracker.length} tracker entries`
  );

  // ═══ InstantDB + Pinecone — Job Postings ═══

  if (!skipJobs && jobPostings.length > 0) {
    try {
      const batchSize = 25;
      for (let i = 0; i < jobPostings.length; i += batchSize) {
        const batch = jobPostings.slice(i, i + batchSize);
        await db.transact(
          batch.map((job) =>
            db.tx.jobPostings[toUUID(job.id)].update({
              userId,
              filename: job.filename,
              company: job.company || "",
              title: job.title || "",
              location: job.location || "",
              salaryRange: job.salaryRange || "",
              team: job.team || "",
              description: job.description || "",
              requirements: job.requirements,
              responsibilities: job.responsibilities,
              techStack: job.techStack,
              rawText: job.rawText.slice(0, 10000),
              parseConfidence: job.parseConfidence,
            })
          )
        );
        results.instantdb.jobPostings += batch.length;
      }
    } catch (e) {
      results.instantdb.errors.push(`Job postings: ${e}`);
    }

    try {
      results.pinecone.jobPostings = await upsertJobPostings(jobPostings);
    } catch (e) {
      results.pinecone.errors.push(`Job postings: ${e}`);
    }

    if (results.instantdb.errors.length === 0) {
      status.jobsLoaded = true;
    }
  }

  // ═══ InstantDB — Tracker ═══

  if (!skipTracker && tracker.length > 0) {
    try {
      await db.transact(
        tracker.map((entry) =>
          db.tx.trackerEntries[toUUID(entry.id)].update({
            userId,
            company: entry.company,
            role: entry.role,
            statusRaw: entry.statusRaw,
            statusNormalized: entry.statusNormalized,
            dateAppliedRaw: entry.dateAppliedRaw,
            salaryRange: entry.salaryRange || "",
            location: entry.location || "",
            recruiter: entry.recruiter || "",
            notes: entry.notes || "",
          })
        )
      );
      results.instantdb.trackerEntries = tracker.length;
      status.trackerLoaded = true;
    } catch (e) {
      results.instantdb.errors.push(`Tracker: ${e}`);
    }
  }

  // ═══ InstantDB + Pinecone — Emails & Threads ═══

  if (!skipEmails && emails.length > 0) {
    try {
      const batchSize = 25;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        await db.transact(
          batch.map((email) =>
            db.tx.emails[toUUID(email.id)].update({
              userId,
              threadId: email.threadId,
              subject: email.subject,
              fromName: email.from.name,
              fromEmail: email.from.email,
              toList: email.to,
              date: email.date,
              body: email.body.slice(0, 5000),
              labels: email.labels,
              emailType: email.type,
            })
          )
        );
        results.instantdb.emails += batch.length;
      }
    } catch (e) {
      results.instantdb.errors.push(`Emails: ${e}`);
    }

    try {
      await db.transact(
        threads.map((thread) =>
          db.tx.emailThreads[toUUID(thread.threadId)].update({
            userId,
            threadId: thread.threadId,
            subject: thread.subject,
            participants: thread.participants,
            company: thread.company || "",
            latestDate: thread.latestDate?.toISOString() || "",
            emailType: thread.type,
            messageCount: thread.messages.length,
          })
        )
      );
      results.instantdb.emailThreads = threads.length;
    } catch (e) {
      results.instantdb.errors.push(`Email threads: ${e}`);
    }

    try {
      results.pinecone.emails = await upsertEmails(emails);
    } catch (e) {
      results.pinecone.errors.push(`Emails: ${e}`);
    }

    const emailErrors = results.instantdb.errors.filter((e) =>
      e.startsWith("Email")
    );
    if (emailErrors.length === 0) {
      status.emailsLoaded = true;
    }
  }

  // ═══ InstantDB + Pinecone — Resume ═══

  if (!skipResume && resume) {
    try {
      await db.transact(
        db.tx.resumeData[toUUID(`resume-${userId}`)].update({
          userId,
          name: resume.name,
          contact: resume.contact,
          fullText: resume.fullText.slice(0, 10000),
          summary: resume.summary || "",
          experience: resume.experience || "",
          education: resume.education || "",
          skills: resume.skills || "",
          projects: resume.projects || "",
          sections: resume.sections,
        })
      );
      results.instantdb.resume = 1;
    } catch (e) {
      results.instantdb.errors.push(`Resume: ${e}`);
    }

    try {
      const sections = resume.sections.map((s) => ({
        id: uuid(),
        title: s.title,
        content: s.content,
      }));
      results.pinecone.resumeSections = await upsertResumeSections(sections);
    } catch (e) {
      results.pinecone.errors.push(`Resume: ${e}`);
    }

    const resumeErrors = results.instantdb.errors.filter((e) =>
      e.startsWith("Resume")
    );
    if (resumeErrors.length === 0) {
      status.resumeLoaded = true;
    }
  }

  // ═══ InstantDB — Preferences / Notes ═══

  if (!skipNotes && preferences) {
    try {
      await db.transact(
        db.tx.preferencesData[toUUID(`preferences-${userId}`)].update({
          userId,
          fullText: preferences.fullText.slice(0, 10000),
          salary: preferences.salary || "",
          location: preferences.location || "",
          dealBreakers: preferences.dealBreakers || "",
          excitedCompanies: preferences.excitedCompanies || "",
          lessExcitedCompanies: preferences.lessExcitedCompanies || "",
          interviewQuestions: preferences.interviewQuestions || "",
          negotiation: preferences.negotiation || "",
          timeline: preferences.timeline || "",
          randomThoughts: preferences.randomThoughts || "",
          salaryResearch: preferences.salaryResearch || "",
          sections: preferences.sections,
        })
      );
      results.instantdb.preferences = 1;
      status.notesLoaded = true;
    } catch (e) {
      results.instantdb.errors.push(`Preferences: ${e}`);
    }
  }

  results.loadStatus = { ...status };

  console.log("[Ingest] InstantDB:", JSON.stringify(results.instantdb));
  console.log("[Ingest] Pinecone:", JSON.stringify(results.pinecone));
  if (results.skipped.length > 0) {
    console.log("[Ingest] Skipped dirs:", results.skipped.join(", "));
  }

  return results;
}
