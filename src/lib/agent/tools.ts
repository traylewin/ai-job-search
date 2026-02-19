import { tool } from "ai";
import { z } from "zod";
import {
  getAllJobPostings,
  findJobByCompany,
  findJobByFilename,
  getAllTrackerEntries,
  findTrackerByCompany,
  getTrackerEntries,
  updateTrackerEntry,
  createTrackerEntry,
  getAllEmails,
  getAllContacts,
  getContactsByCompany,
  getPrimaryContactForCompany,
  findContactByEmail,
  createContact,
  updateContact as updateContactDb,
  getUserEmail,
  findThreadById,
  findThreadsByCompany,
  getResume,
  getPreferences,
  getAllCalendarEvents,
  getCalendarEventsByCompany,
  searchCalendarEventsByDate,
  createCalendarEvent as createCalendarEventDb,
  updateCalendarEvent as updateCalendarEventDb,
} from "@/lib/db/instant-queries";
import {
  searchJobs as pineconeSearchJobs,
  searchEmails as pineconeSearchEmails,
  searchContacts as pineconeSearchContacts,
  upsertContacts as pineconeUpsertContacts,
} from "@/lib/db/pinecone";
import { dateDiff, addDaysToDate, formatDate, relativeDate } from "@/lib/utils/date-utils";
import { truncate } from "@/lib/utils/text-utils";
import path from "path";
import fs from "fs/promises";

const DATA_DIR = path.join(process.cwd(), process.env.DATA_DIR || "data");

/**
 * Create all agent tools scoped to a specific user.
 */
export function createTools(userId: string) {
  // ─── Tool 1: searchJobs ───
  const searchJobsTool = tool({
    description:
      "Search job postings semantically by query. Returns matching job postings ranked by relevance. Use this when the user asks about jobs matching certain criteria, skills, or preferences.",
    inputSchema: z.object({
      query: z.string().describe("Semantic search query, e.g. 'distributed systems roles in SF' or 'remote backend positions'"),
      topK: z.number().optional().default(5).describe("Number of results to return"),
    }),
    execute: async ({ query, topK }) => {
      try {
        const results = await pineconeSearchJobs(query, topK);
        if (results.length > 0) {
          return results.map((r) => ({
            company: r.metadata?.company,
            title: r.metadata?.title,
            location: r.metadata?.location,
            salary: r.metadata?.salaryRange,
            confidence: r.metadata?.parseConfidence,
            score: r.score,
            filename: r.metadata?.filename,
          }));
        }
      } catch {
        // Pinecone unavailable, fall back to InstantDB keyword search
      }

      const jobs = await getAllJobPostings(userId);
      const queryLower = query.toLowerCase();
      const scored = jobs
        .map((j) => {
          let score = 0;
          const searchable = `${j.company} ${j.title} ${j.location} ${j.description} ${j.rawText}`.toLowerCase();
          const words = queryLower.split(/\s+/);
          for (const word of words) {
            if (searchable.includes(word)) score += 1;
          }
          return { job: j, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return scored.map((s) => ({
        company: s.job.company,
        title: s.job.title,
        location: s.job.location,
        salary: s.job.salaryRange,
        confidence: s.job.parseConfidence,
        score: s.score,
        filename: s.job.filename,
      }));
    },
  });

  // ─── Tool 2: searchEmails ───
  const searchEmailsTool = tool({
    description:
      "Search emails by query, sender, company, or type. Use for finding specific email threads, checking communication history, or filtering by email type (confirmation, interview_scheduling, offer, rejection, recruiter_outreach, spam, newsletter).",
    inputSchema: z.object({
      query: z.string().optional().describe("Semantic/keyword search query"),
      company: z.string().optional().describe("Filter by company name"),
      from: z.string().optional().describe("Filter by sender name or email"),
      type: z.string().optional().describe("Filter by email type: confirmation, interview_scheduling, offer, rejection, recruiter_outreach, spam, newsletter"),
      topK: z.number().optional().default(10).describe("Number of results"),
    }),
    execute: async ({ query, company, from: fromFilter, type, topK }) => {
      let results = await getAllEmails(userId);

      if (company) {
        const lower = company.toLowerCase();
        results = results.filter(
          (e) =>
            e.fromEmail.toLowerCase().includes(lower) ||
            e.fromName.toLowerCase().includes(lower) ||
            e.subject.toLowerCase().includes(lower)
        );
      }

      if (fromFilter) {
        const lower = fromFilter.toLowerCase();
        results = results.filter(
          (e) =>
            e.fromEmail.toLowerCase().includes(lower) ||
            e.fromName.toLowerCase().includes(lower)
        );
      }

      if (type) {
        results = results.filter((e) => e.emailType === type);
      }

      if (query) {
        try {
          const pineconeResults = await pineconeSearchEmails(query, topK || 10);
          if (pineconeResults.length > 0) {
            const matchedIds = new Set(pineconeResults.map((r) => r.id));
            const matchedEmails = results.filter((e) => matchedIds.has(e.id));
            if (matchedEmails.length > 0) results = matchedEmails;
          }
        } catch {
          const lower = query.toLowerCase();
          results = results.filter(
            (e) =>
              e.subject.toLowerCase().includes(lower) ||
              e.body.toLowerCase().includes(lower)
          );
        }
      }

      return results.slice(0, topK).map((e) => ({
        id: e.id,
        threadId: e.threadId,
        subject: e.subject,
        from: `${e.fromName} <${e.fromEmail}>`,
        date: e.date,
        type: e.emailType,
        bodyPreview: truncate(e.body, 200),
      }));
    },
  });

  // ─── Tool 3: queryTracker ───
  const queryTrackerTool = tool({
    description:
      "Query the job application tracker. Returns tracker entries with both raw (original) and normalized status values, plus the most recent calendar event for each company. Use for checking application statuses, finding stale applications, or getting an overview of the pipeline.",
    inputSchema: z.object({
      company: z.string().optional().describe("Filter by company name"),
      status: z.string().optional().describe("Filter by status (applied, offer, rejected, interviewing, interested, withdrew, unknown)"),
      all: z.boolean().optional().default(false).describe("Return all entries (no filter)"),
    }),
    execute: async ({ company, status, all }) => {
      const entries = all
        ? await getAllTrackerEntries(userId)
        : await getTrackerEntries(userId, { company, status });

      return entries.map(formatTrackerEntry);
    },
  });

  // ─── Tool 4: readJobPosting ───
  const readJobPostingTool = tool({
    description:
      "Read the full parsed details of a specific job posting. Returns structured data plus parseConfidence. If parseConfidence is 'partial' or 'text-only' and you need specific fields, follow up with readRawFile to inspect the source HTML directly.",
    inputSchema: z.object({
      company: z.string().optional().describe("Company name to look up"),
      filename: z.string().optional().describe("HTML filename to read"),
      emails: z.array(z.string()).optional().describe("Fallback email addresses to resolve the company if name doesn't match"),
    }),
    execute: async ({ company, filename, emails }) => {
      let posting;
      if (filename) {
        posting = await findJobByFilename(userId, filename);
      } else if (company) {
        posting = await findJobByCompany(userId, company, emails);
      }

      if (!posting) {
        return { error: `No job posting found for ${company || filename}` };
      }

      return {
        company: posting.company,
        title: posting.title,
        location: posting.location,
        salaryRange: posting.salaryRange,
        team: posting.team,
        description: posting.description,
        requirements: posting.requirements,
        responsibilities: posting.responsibilities,
        techStack: posting.techStack,
        parseConfidence: posting.parseConfidence,
        filename: posting.filename,
        rawTextPreview: truncate(posting.rawText, 500),
      };
    },
  });

  // ─── Tool 5: readEmailThread ───
  const readEmailThreadTool = tool({
    description:
      "Read a full email thread chronologically. Use to follow conversation history with a recruiter or company.",
    inputSchema: z.object({
      threadId: z.string().optional().describe("Thread ID to look up"),
      company: z.string().optional().describe("Company name to find threads for"),
    }),
    execute: async ({ threadId, company }) => {
      if (threadId) {
        const thread = await findThreadById(userId, threadId);
        if (!thread) return { error: `Thread ${threadId} not found` };
        return formatThread(thread);
      }

      if (company) {
        const threads = await findThreadsByCompany(userId, company);
        if (threads.length === 0) {
          return { error: `No email threads found for ${company}` };
        }
        return threads.map(formatThread);
      }

      return { error: "Provide either threadId or company" };
    },
  });

  // ─── Tool 6: readResume ───
  const readResumeTool = tool({
    description:
      "Read the user's resume, either the full text or a specific section (summary, experience, education, skills, projects).",
    inputSchema: z.object({
      section: z
        .enum(["summary", "experience", "education", "skills", "projects", "full"])
        .optional()
        .default("full")
        .describe("Which section to read"),
    }),
    execute: async ({ section }) => {
      const resume = await getResume(userId);
      if (!resume) {
        return { error: "Resume not found in database. Run sync first." };
      }

      if (section === "full") {
        return {
          name: resume.name,
          contact: resume.contact,
          sections: Array.isArray(resume.sections)
            ? (resume.sections as { title: string; content: string }[]).map((s) => ({
                title: s.title,
                content: s.content,
              }))
            : [],
        };
      }

      const sectionMap: Record<string, string | undefined> = {
        summary: resume.summary ?? undefined,
        experience: resume.experience ?? undefined,
        education: resume.education ?? undefined,
        skills: resume.skills ?? undefined,
        projects: resume.projects ?? undefined,
      };

      return {
        section,
        content: sectionMap[section] || "Section not found",
      };
    },
  });

  // ─── Tool 7: readPreferences ───
  const readPreferencesTool = tool({
    description:
      "Read the user's job search preferences and notes. Sections include: salary, location, dealBreakers, excitedCompanies, lessExcitedCompanies, interviewQuestions, negotiation, timeline, randomThoughts, salaryResearch.",
    inputSchema: z.object({
      section: z
        .string()
        .optional()
        .describe("Specific section to read, or omit for all preferences"),
    }),
    execute: async ({ section }) => {
      const prefs = await getPreferences(userId);
      if (!prefs) {
        return { error: "Preferences not found in database. Run sync first." };
      }

      if (!section) {
        return {
          sections: Array.isArray(prefs.sections)
            ? (prefs.sections as { title: string; content: string }[]).map((s) => ({
                title: s.title,
                content: s.content,
              }))
            : [],
        };
      }

      const sectionMap: Record<string, string | null | undefined> = {
        salary: prefs.salary,
        location: prefs.location,
        dealBreakers: prefs.dealBreakers,
        excitedCompanies: prefs.excitedCompanies,
        lessExcitedCompanies: prefs.lessExcitedCompanies,
        interviewQuestions: prefs.interviewQuestions,
        negotiation: prefs.negotiation,
        timeline: prefs.timeline,
        randomThoughts: prefs.randomThoughts,
        salaryResearch: prefs.salaryResearch,
      };

      return {
        section,
        content: sectionMap[section] || prefs.fullText,
      };
    },
  });

  // ─── Tool 8: computeDates ───
  const computeDatesTool = tool({
    description:
      "Perform date calculations: diff between dates, add days, count business days. Use for questions like 'how long since I applied?' or 'when does the offer expire?'",
    inputSchema: z.object({
      operation: z.enum(["diff", "add", "format", "relative"]).describe("Operation to perform"),
      date1: z.string().describe("First date (any reasonable format)"),
      date2: z.string().optional().describe("Second date (for diff operation)"),
      days: z.number().optional().describe("Number of days to add (for add operation)"),
      businessDays: z.boolean().optional().default(false).describe("Use business days for add operation"),
    }),
    execute: async ({ operation, date1, date2, days, businessDays }) => {
      switch (operation) {
        case "diff": {
          if (!date2) return { error: "date2 required for diff operation" };
          const result = dateDiff(date1, date2);
          if (!result) return { error: "Could not parse dates" };
          return result;
        }
        case "add": {
          if (days === undefined) return { error: "days required for add operation" };
          const result = addDaysToDate(date1, days, businessDays);
          if (!result) return { error: "Could not parse date" };
          return { result, formatted: formatDate(result) };
        }
        case "format": {
          return { formatted: formatDate(date1) };
        }
        case "relative": {
          return { relative: relativeDate(date1) };
        }
        default:
          return { error: "Unknown operation" };
      }
    },
  });

  // ─── Tool 9: readRawFile ───
  const readRawFileTool = tool({
    description:
      "Read a raw file from the data directory. Use as a fallback when structured parsing is incomplete (e.g., parseConfidence is 'partial' or 'text-only'). For HTML files, scripts and styles are stripped but the rest is returned as-is so the LLM can extract information directly.",
    inputSchema: z.object({
      filename: z.string().describe("Filename to read (e.g., 'Stripe - Senior Backend Engineer.html', 'inbox.json', 'job_tracker.csv')"),
      maxChars: z.number().optional().default(5000).describe("Maximum characters to return"),
    }),
    execute: async ({ filename, maxChars }) => {
      let filePath: string;
      if (filename.endsWith(".html")) {
        filePath = path.join(DATA_DIR, "job_postings", filename);
      } else if (filename === "inbox.json") {
        filePath = path.join(DATA_DIR, "emails", filename);
      } else if (filename.endsWith(".csv")) {
        filePath = path.join(DATA_DIR, "tracker", filename);
      } else if (filename.endsWith(".txt")) {
        filePath = path.join(DATA_DIR, "resume", filename);
      } else if (filename.endsWith(".md")) {
        filePath = path.join(DATA_DIR, "notes", filename);
      } else {
        filePath = path.join(DATA_DIR, filename);
      }

      try {
        let content = await fs.readFile(filePath, "utf-8");

        if (filename.endsWith(".html")) {
          content = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        }

        if (content.length > maxChars) {
          content = content.slice(0, maxChars) + "\n... [truncated]";
        }

        return { filename, content, length: content.length };
      } catch {
        return { error: `File not found: ${filename}` };
      }
    },
  });

  // ─── Tool 10: updateTracker ───
  const updateTrackerTool = tool({
    description:
      "Update a tracker entry in the database. Writes directly to InstantDB. Always refreshes the latest calendar event and email activity for the company. If the company name doesn't match, provide emails as fallback to resolve the company via contacts. When updating status, first check the latest emails and events to infer the correct status before asking the user.",
    inputSchema: z.object({
      company: z.string().describe("Company name to update"),
      emails: z.array(z.string()).optional().describe("Fallback email addresses to resolve the company if name doesn't match (e.g. recruiter emails)"),
      updates: z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
        recruiter: z.string().optional(),
        salaryRange: z.string().optional(),
      }).describe("Fields to update"),
    }),
    execute: async ({ company, emails, updates }) => {
      const entry = await findTrackerByCompany(userId, company, emails);
      if (!entry) {
        return { error: `No tracker entry found for ${company}` };
      }

      const resolvedCompany = entry.company;
      const updatePayload: Record<string, string> = {};
      if (updates.status) {
        updatePayload.statusRaw = updates.status;
        updatePayload.statusNormalized = updates.status.toLowerCase();
      }
      if (updates.notes) updatePayload.notes = updates.notes;
      if (updates.recruiter) updatePayload.recruiter = updates.recruiter;
      if (updates.salaryRange) updatePayload.salaryRange = updates.salaryRange;

      // Always refresh last event for this company
      let latestEvent: { id: string; title: string; startTime: string } | null = null;
      try {
        const events = await getCalendarEventsByCompany(userId, resolvedCompany, emails);
        if (events.length > 0) {
          const latest = events.reduce((a, b) =>
            new Date(a.startTime as string) > new Date(b.startTime as string) ? a : b
          );
          latestEvent = { id: latest.id, title: latest.title as string, startTime: latest.startTime as string };
          updatePayload.lastEventId = latest.id;
          updatePayload.lastEventTitle = latest.title as string;
          updatePayload.lastEventDate = latest.startTime as string;
        }
      } catch { /* calendar lookup is best-effort */ }

      // Look up latest email thread activity
      let latestEmail: { subject: string; date: string; threadId: string } | null = null;
      try {
        const threads = await findThreadsByCompany(userId, resolvedCompany);
        if (threads.length > 0) {
          let newestDate = "";
          let newestThread: (typeof threads)[0] | null = null;
          for (const t of threads) {
            const msgs = (t as { messages?: { date: string }[] }).messages || [];
            const lastMsg = msgs[msgs.length - 1];
            const d = lastMsg?.date || "";
            if (!newestThread || d > newestDate) {
              newestDate = d;
              newestThread = t;
            }
          }
          if (newestThread) {
            latestEmail = {
              subject: newestThread.subject as string,
              date: newestDate,
              threadId: newestThread.threadId as string,
            };
          }
        }
      } catch { /* email lookup is best-effort */ }

      try {
        if (Object.keys(updatePayload).length > 0) {
          await updateTrackerEntry(entry.id, updatePayload);
        }
        return {
          success: true,
          message: `Updated ${resolvedCompany} tracker entry`,
          currentStatus: entry.statusRaw,
          lastEvent: latestEvent,
          lastEmail: latestEmail,
        };
      } catch (e) {
        return { error: `Failed to update ${resolvedCompany}: ${e}` };
      }
    },
  });

  // ─── Tool 11: addJobToTracker ───
  const addJobToTrackerTool = tool({
    description:
      "Add a new job to the application tracker. Use when the user wants to track a new company/role they're interested in or have applied to. Checks for duplicates before creating. Provide emails as fallback to help resolve the company if name doesn't match existing entries.",
    inputSchema: z.object({
      company: z.string().describe("Company name"),
      role: z.string().describe("Job title / role"),
      emails: z.array(z.string()).optional().describe("Fallback email addresses to resolve the company if name doesn't match (e.g. recruiter emails)"),
      status: z.string().optional().default("interested").describe("Application status: interested, applied, interviewing, offer, rejected, withdrew"),
      dateApplied: z.string().optional().describe("Date applied (any reasonable format). Leave empty if the user hasn't applied yet."),
      salaryRange: z.string().optional().describe("Salary range — ALWAYS populate this from the job posting data if available"),
      location: z.string().optional().describe("Job location — ALWAYS populate this from the job posting data if available"),
      recruiter: z.string().optional().describe("Recruiter name or contact"),
      notes: z.string().optional().describe("Any notes about this application"),
    }),
    execute: async ({ company, role, emails, status, dateApplied, salaryRange, location, recruiter, notes }) => {
      const existing = await findTrackerByCompany(userId, company, emails);
      if (existing && existing.role.toLowerCase() === role.toLowerCase()) {
        return {
          error: `A tracker entry already exists for ${company} - ${existing.role} (status: ${existing.statusRaw}). Use updateTracker to modify it.`,
          existingEntry: formatTrackerEntry(existing),
        };
      }

      const normalizedStatus = status!.toLowerCase().replace(/\s+/g, "_");
      const appliedDate = dateApplied || "";

      // Look up latest calendar event for this company
      let lastEventFields: Record<string, string> = {};
      try {
        const events = await getCalendarEventsByCompany(userId, company);
        if (events.length > 0) {
          const latest = events.reduce((a, b) =>
            new Date(a.startTime as string) > new Date(b.startTime as string) ? a : b
          );
          lastEventFields = {
            lastEventId: latest.id,
            lastEventTitle: latest.title as string,
            lastEventDate: latest.startTime as string,
          };
        }
      } catch { /* calendar lookup is best-effort */ }

      try {
        const id = await createTrackerEntry(userId, {
          company,
          role,
          statusRaw: status!,
          statusNormalized: normalizedStatus,
          dateAppliedRaw: appliedDate,
          salaryRange: salaryRange || "",
          location: location || "",
          recruiter: recruiter || "",
          notes: notes || "",
          ...lastEventFields,
        });
        return {
          success: true,
          message: `Added ${company} - ${role} to tracker (status: ${status})`,
          id,
        };
      } catch (e) {
        return { error: `Failed to add tracker entry: ${e}` };
      }
    },
  });

  // ─── Tool 12: draftEmail ───
  const draftEmailTool = tool({
    description:
      "Generate a draft email. Does NOT send — returns the draft text for the user to review. Use for follow-ups, negotiation emails, thank-you notes, etc. When drafting for a specific company, provide the company name so the primary contact is automatically included.",
    inputSchema: z.object({
      to: z.string().optional().describe("Recipient name and email. If omitted, the primary contact for the company is used."),
      company: z.string().optional().describe("Company name — used to auto-resolve the primary contact as recipient"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("The full email body text, ready to send. Write the complete email content here."),
      context: z.string().describe("Brief internal note about why this email is being drafted (not included in the email)"),
      tone: z.enum(["professional", "casual", "warm"]).default("professional").describe("Tone of the email"),
    }),
    execute: async ({ to, company, subject, body, context, tone }) => {
      let resolvedTo = to || "";

      if (company) {
        const primary = await getPrimaryContactForCompany(userId, company);
        if (primary && primary.email) {
          const primaryStr = `${primary.name} <${primary.email}>`;
          if (!resolvedTo) {
            resolvedTo = primaryStr;
          } else if (!resolvedTo.toLowerCase().includes((primary.email as string).toLowerCase())) {
            resolvedTo = `${primaryStr}, ${resolvedTo}`;
          }
        }
      }

      if (!resolvedTo) {
        return { error: "No recipient specified and no primary contact found for the company. Provide a 'to' address or set a primary contact." };
      }

      return {
        draft: {
          to: resolvedTo,
          subject,
          body,
        },
        metadata: {
          tone,
          context,
          note: "This is a draft — review and edit before sending.",
        },
      };
    },
  });

  // ─── Tool 13: searchContacts ───
  const searchContactsTool = tool({
    description:
      "Search contacts by name, company, or role. Use to find recruiters, hiring managers, or other people associated with a company.",
    inputSchema: z.object({
      query: z.string().describe("Search query: person name, company, or role"),
      company: z.string().optional().describe("Filter by company name"),
      topK: z.number().optional().default(10).describe("Number of results"),
    }),
    execute: async ({ query, company, topK }) => {
      try {
        const results = await pineconeSearchContacts(query, topK);
        let contacts = results.map((r) => ({
          id: r.id,
          name: r.metadata?.name,
          company: r.metadata?.company,
          position: r.metadata?.position,
          email: r.metadata?.email,
          location: r.metadata?.location,
          score: r.score,
        }));
        if (company) {
          const lower = company.toLowerCase();
          contacts = contacts.filter(
            (c) => (c.company as string || "").toLowerCase().includes(lower)
          );
        }
        if (contacts.length > 0) return contacts;
      } catch {
        // Pinecone unavailable, fall back
      }

      let all = await getAllContacts(userId);
      if (company) {
        const lower = company.toLowerCase();
        all = all.filter((c) => (c.company || "").toLowerCase().includes(lower));
      }
      const queryLower = query.toLowerCase();
      return all
        .filter((c) =>
          `${c.name} ${c.company} ${c.position || ""} ${c.email || ""}`.toLowerCase().includes(queryLower)
        )
        .slice(0, topK)
        .map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          position: c.position || "",
          email: c.email || "",
          location: c.location || "",
        }));
    },
  });

  // ─── Tool 14: addContact ───
  const addContactTool = tool({
    description:
      "Add a new contact to the database. Use when the user mentions a recruiter, hiring manager, or other person at a company.",
    inputSchema: z.object({
      name: z.string().describe("Contact's full name"),
      company: z.string().describe("Company they work at"),
      position: z.string().optional().describe("Job title or role"),
      location: z.string().optional().describe("Location"),
      email: z.string().optional().describe("Email address"),
    }),
    execute: async ({ name, company, position, location, email }) => {
      if (email) {
        const emailLower = email.toLowerCase();
        if (emailLower.includes("no-reply") || emailLower.includes("noreply")) {
          return { error: "Cannot add a no-reply address as a contact." };
        }
        const ownEmail = await getUserEmail(userId);
        if (ownEmail && emailLower === ownEmail.toLowerCase()) {
          return { error: "Cannot add yourself as a contact." };
        }
        const existing = await findContactByEmail(userId, email);
        if (existing) {
          return {
            error: `Contact already exists: ${existing.name} at ${existing.company}. Use updateContact to modify.`,
            existingId: existing.id,
          };
        }
      }

      const contactId = await createContact(userId, {
        company,
        name,
        position: position || "",
        location: location || "",
        email: email || "",
      });

      try {
        await pineconeUpsertContacts([{
          id: contactId,
          company,
          name,
          position: position || "",
          location: location || "",
          email: email || "",
        }]);
      } catch (e) {
        console.error("[AddContact] Pinecone upsert failed:", e);
      }

      return { success: true, id: contactId, message: `Added ${name} at ${company}` };
    },
  });

  // ─── Tool 15: updateContact ───
  const updateContactTool = tool({
    description:
      "Update an existing contact's details. Search for the contact first to get their ID.",
    inputSchema: z.object({
      contactId: z.string().describe("The contact's ID"),
      updates: z.object({
        name: z.string().optional(),
        company: z.string().optional(),
        position: z.string().optional(),
        location: z.string().optional(),
        email: z.string().optional(),
      }).describe("Fields to update"),
    }),
    execute: async ({ contactId, updates }) => {
      try {
        const cleanUpdates: Record<string, string> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) cleanUpdates[k] = v;
        }
        await updateContactDb(contactId, cleanUpdates);
        return { success: true, message: "Contact updated" };
      } catch (e) {
        return { error: `Failed to update contact: ${e}` };
      }
    },
  });

  // ─── Calendar Event Tools ───

  const searchCalendarEventsTool = tool({
    description:
      "Search calendar events by company name, date range, or both. Returns matching events with details. Provide emails as fallback to resolve the company if name doesn't match.",
    inputSchema: z.object({
      company: z.string().optional().describe("Company name to filter by"),
      emails: z.array(z.string()).optional().describe("Fallback email addresses to resolve the company if name doesn't match"),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD) for date range filter"),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD) for date range filter"),
    }),
    execute: async ({ company, emails, startDate, endDate }) => {
      try {
        let events;
        if (company) {
          events = await getCalendarEventsByCompany(userId, company, emails);
        } else if (startDate && endDate) {
          events = await searchCalendarEventsByDate(userId, startDate, endDate);
        } else {
          events = await getAllCalendarEvents(userId);
        }

        if (startDate && endDate && company) {
          const start = new Date(startDate).getTime();
          const end = new Date(endDate + "T23:59:59").getTime();
          events = events.filter((e) => {
            const t = new Date(e.startTime as string).getTime();
            return t >= start && t <= end;
          });
        }

        return {
          count: events.length,
          events: events.slice(0, 20).map((e) => ({
            id: e.id,
            title: e.title,
            company: e.company || "",
            startTime: e.startTime,
            endTime: e.endTime,
            eventType: e.eventType || "other",
            location: e.location || "",
            attendees: e.attendees || [],
            googleCalendarLink: e.googleCalendarLink || "",
          })),
        };
      } catch (e) {
        return { error: `Failed to search calendar events: ${e}` };
      }
    },
  });

  const createCalendarEventTool = tool({
    description:
      "Create a new calendar event record. Use for tracking interview appointments, coffee chats, etc.",
    inputSchema: z.object({
      title: z.string().describe("Event title"),
      company: z.string().optional().describe("Associated company"),
      startTime: z.string().describe("Start time (ISO 8601)"),
      endTime: z.string().describe("End time (ISO 8601)"),
      description: z.string().optional().describe("Event description"),
      location: z.string().optional().describe("Event location"),
      eventType: z.enum(["interview", "phone_screen", "technical_interview", "onsite", "chat", "info_session", "other"]).optional().describe("Type of event"),
      attendees: z.array(z.object({
        name: z.string(),
        email: z.string(),
      })).optional().describe("List of attendees"),
    }),
    execute: async ({ title, company, startTime, endTime, description, location, eventType, attendees }) => {
      try {
        const eventId = await createCalendarEventDb(userId, {
          googleEventId: `manual_${Date.now()}`,
          title,
          company,
          startTime,
          endTime,
          description,
          location,
          eventType: eventType || "other",
          attendees,
          status: "confirmed",
        });
        return { success: true, eventId, message: `Event "${title}" created` };
      } catch (e) {
        return { error: `Failed to create calendar event: ${e}` };
      }
    },
  });

  const updateCalendarEventTool = tool({
    description:
      "Update an existing calendar event. Search for the event first to get its ID.",
    inputSchema: z.object({
      eventId: z.string().describe("The event's ID"),
      updates: z.object({
        title: z.string().optional(),
        company: z.string().optional(),
        description: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().optional(),
        eventType: z.string().optional(),
        status: z.string().optional(),
      }).describe("Fields to update"),
    }),
    execute: async ({ eventId, updates }) => {
      try {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) clean[k] = v;
        }
        await updateCalendarEventDb(eventId, clean);
        return { success: true, message: "Calendar event updated" };
      } catch (e) {
        return { error: `Failed to update calendar event: ${e}` };
      }
    },
  });

  return {
    searchJobs: searchJobsTool,
    searchEmails: searchEmailsTool,
    queryTracker: queryTrackerTool,
    readJobPosting: readJobPostingTool,
    readEmailThread: readEmailThreadTool,
    readResume: readResumeTool,
    readPreferences: readPreferencesTool,
    computeDates: computeDatesTool,
    readRawFile: readRawFileTool,
    updateTracker: updateTrackerTool,
    addJobToTracker: addJobToTrackerTool,
    draftEmail: draftEmailTool,
    searchContacts: searchContactsTool,
    addContact: addContactTool,
    updateContact: updateContactTool,
    searchCalendarEvents: searchCalendarEventsTool,
    createCalendarEvent: createCalendarEventTool,
    updateCalendarEvent: updateCalendarEventTool,
  };
}

// ─── Helpers ───

function formatTrackerEntry(e: {
  company: string;
  role: string;
  statusRaw: string;
  statusNormalized: string;
  dateAppliedRaw: string;
  salaryRange?: string;
  location?: string;
  recruiter?: string;
  notes?: string;
  lastEventId?: string;
  lastEventTitle?: string;
  lastEventDate?: string;
}) {
  return {
    company: e.company,
    role: e.role,
    statusRaw: e.statusRaw,
    statusNormalized: e.statusNormalized,
    dateApplied: e.dateAppliedRaw,
    salaryRange: e.salaryRange || "",
    location: e.location || "",
    recruiter: e.recruiter || "",
    notes: e.notes || "",
    lastEvent: e.lastEventId
      ? { id: e.lastEventId, title: e.lastEventTitle || "", startTime: e.lastEventDate || "" }
      : null,
  };
}

type ThreadWithMessages = {
  threadId: string;
  subject: string;
  emailType: string;
  participants: unknown;
  messageCount: number;
  messages: {
    fromName: string;
    fromEmail: string;
    date: string;
    emailType: string;
    body: string;
  }[];
};

function formatThread(t: ThreadWithMessages) {
  const participants = Array.isArray(t.participants)
    ? t.participants.map((p: { name?: string; email?: string }) => `${p.name || ""} <${p.email || ""}>`)
    : [];

  return {
    threadId: t.threadId,
    subject: t.subject,
    type: t.emailType,
    messageCount: t.messageCount,
    participants,
    messages: t.messages.map((m) => ({
      from: `${m.fromName} <${m.fromEmail}>`,
      date: m.date,
      type: m.emailType,
      body: m.body,
    })),
  };
}
