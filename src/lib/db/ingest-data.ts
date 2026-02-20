import { getLocalDataJobPostings } from "@/lib/parsers/html-parser";
import { getLocalDataEmails } from "@/lib/parsers/email-parser";
import { getLocalDataTrackerCSV } from "@/lib/parsers/csv-parser";
import { getLocalDataResume } from "@/lib/parsers/resume-parser";
import { getLocalDataNotes } from "@/lib/parsers/notes-parser";
import { db } from "@/lib/db/instant-admin";
import { upsertJobPostings, upsertEmails, upsertResumeSections, upsertContacts } from "@/lib/db/pinecone";
import { getUserEmail } from "@/lib/db/instant-queries";
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

function toUUID(customId: string, userId?: string): string {
  const key = userId ? `${userId}:${customId}` : customId;
  return uuidv5(key, NAMESPACE);
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
            db.tx.jobPostings[toUUID(job.id, userId)].update({
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
              status: "interested",
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

  // ═══ InstantDB — Tracker (linked to job postings) ═══
  // Each tracker entry must reference a job posting. Entries without a match are skipped.

  if (!skipTracker && tracker.length > 0) {
    // Build a fuzzy company→jobPosting map from the already-imported job postings
    const jobsByCompany = new Map<string, { dbId: string; company: string }>();
    for (const job of jobPostings) {
      const company = (job.company || "").toLowerCase();
      if (company) {
        jobsByCompany.set(company, { dbId: toUUID(job.id, userId), company: job.company || "" });
      }
    }

    function findJobPosting(company: string): { dbId: string; company: string } | null {
      const lower = company.toLowerCase();
      const exact = jobsByCompany.get(lower);
      if (exact) return exact;
      for (const [key, val] of jobsByCompany) {
        if (key.includes(lower) || lower.includes(key)) return val;
      }
      return null;
    }

    const matched: { entry: (typeof tracker)[0]; jobPostingDbId: string }[] = [];
    let skippedCount = 0;
    for (const entry of tracker) {
      const jp = findJobPosting(entry.company);
      if (jp) {
        matched.push({ entry, jobPostingDbId: jp.dbId });
      } else {
        skippedCount++;
      }
    }

    if (skippedCount > 0) {
      console.log(`[Ingest] Skipped ${skippedCount} tracker entries with no matching job posting`);
    }

    if (matched.length > 0) {
      try {
        const batchSize = 25;
        for (let i = 0; i < matched.length; i += batchSize) {
          const batch = matched.slice(i, i + batchSize);
          await db.transact(
            batch.map(({ entry, jobPostingDbId }) =>
              db.tx.trackerEntries[toUUID(entry.id, userId)].update({
                userId,
                jobPostingId: jobPostingDbId,
                company: entry.company,
                role: entry.role,
                dateAppliedRaw: entry.dateAppliedRaw,
                salaryRange: entry.salaryRange || "",
                location: entry.location || "",
                recruiter: entry.recruiter || "",
                notes: entry.notes || "",
              })
            )
          );
        }
        results.instantdb.trackerEntries = matched.length;

        // Sync tracker status → job posting status
        const statusTxns: ReturnType<typeof db.tx.jobPostings[string]["update"]>[] = [];
        for (const { entry, jobPostingDbId } of matched) {
          const trackerStatus = entry.statusNormalized || entry.statusRaw;
          if (trackerStatus) {
            statusTxns.push(
              db.tx.jobPostings[jobPostingDbId].update({ status: trackerStatus })
            );
          }
        }
        if (statusTxns.length > 0) {
          for (let i = 0; i < statusTxns.length; i += batchSize) {
            await db.transact(statusTxns.slice(i, i + batchSize));
          }
          console.log(`[Ingest] Synced ${statusTxns.length} job posting statuses from tracker`);
        }

        status.trackerLoaded = true;
      } catch (e) {
        results.instantdb.errors.push(`Tracker: ${e}`);
      }
    } else {
      status.trackerLoaded = true;
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
            db.tx.emails[toUUID(email.id, userId)].update({
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
          db.tx.emailThreads[toUUID(thread.threadId, userId)].update({
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

    // ── Extract contacts from email participants ──
    try {
      const userEmail = await getUserEmail(userId);
      const companyByThread = new Map(
        threads.map((t) => [t.threadId, t.company || ""])
      );

      // Build a fuzzy lookup from domain-derived names to real job posting company names
      // e.g. "datadoghq" -> "Datadog", "stripe" -> "Stripe"
      const knownCompanies = jobPostings.map((j) => j.company || "").filter(Boolean);
      function resolveCompanyName(raw: string): string {
        if (!raw) return raw;
        const lower = raw.toLowerCase();
        const match = knownCompanies.find((kc) => {
          const kcl = kc.toLowerCase();
          return kcl === lower || lower.includes(kcl) || kcl.includes(lower);
        });
        return match || raw;
      }

      // Find the "self" email that appears as a to-recipient across most threads
      // (this is the persona in the sample data, e.g. alex.chen.dev@gmail.com)
      const toCount = new Map<string, number>();
      for (const email of emails) {
        for (const t of email.to) {
          if (t.email) toCount.set(t.email.toLowerCase(), (toCount.get(t.email.toLowerCase()) || 0) + 1);
        }
      }
      const selfEmails = new Set<string>();
      if (userEmail) selfEmails.add(userEmail.toLowerCase());
      for (const [addr, count] of toCount) {
        if (count >= emails.length * 0.5) selfEmails.add(addr);
      }

      const contactsByEmail = new Map<string, { name: string; email: string; company: string }>();
      for (const email of emails) {
        const rawCompany = companyByThread.get(email.threadId) || "";
        const company = resolveCompanyName(rawCompany);
        const people = [email.from, ...email.to];
        for (const p of people) {
          if (!p.email || !p.name) continue;
          const lower = p.email.toLowerCase();
          if (selfEmails.has(lower)) continue;
          if (lower.includes("no-reply") || lower.includes("noreply")) continue;
          if (!contactsByEmail.has(lower)) {
            contactsByEmail.set(lower, { name: p.name, email: p.email, company });
          }
        }
      }

      // First contact per company becomes primary
      const primarySet = new Set<string>();
      const contactRecords = Array.from(contactsByEmail.values()).map((c) => {
        const companyLower = c.company.toLowerCase();
        const isPrimary = companyLower !== "" && !primarySet.has(companyLower);
        if (isPrimary) primarySet.add(companyLower);
        return {
          id: toUUID(`contact:${c.email}`, userId),
          ...c,
          position: "",
          location: "",
          primaryContact: isPrimary,
        };
      });

      if (contactRecords.length > 0) {
        const batchSize = 25;
        for (let i = 0; i < contactRecords.length; i += batchSize) {
          const batch = contactRecords.slice(i, i + batchSize);
          await db.transact(
            batch.map((c) =>
              db.tx.contacts[c.id].update({
                userId,
                company: c.company,
                name: c.name,
                position: "",
                location: "",
                email: c.email,
                primaryContact: c.primaryContact,
              })
            )
          );
        }

        try {
          await upsertContacts(contactRecords);
        } catch (e) {
          console.error("[Ingest] Pinecone contacts upsert failed:", e);
        }

        console.log(`[Ingest] Extracted ${contactRecords.length} contacts from emails`);
      }
    } catch (e) {
      results.instantdb.errors.push(`Contacts: ${e}`);
    }
  }

  // ═══ InstantDB + Pinecone — Resume ═══

  if (!skipResume && resume) {
    try {
      await db.transact(
        db.tx.resumeData[toUUID("resume", userId)].update({
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
        db.tx.preferencesData[toUUID("preferences", userId)].update({
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
