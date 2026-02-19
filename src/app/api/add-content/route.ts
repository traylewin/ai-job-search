import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { db, id as instantId } from "@/lib/db/instant-admin";
import {
  searchJobs,
  upsertJobPostings,
} from "@/lib/db/pinecone";
import { v5 as uuidv5 } from "uuid";
import {
  getExistingThreadContext,
  parseEmailWithAI,
  resolveThreadId,
  saveEmailToDb,
} from "@/lib/email-processing";

export const maxDuration = 60;

const NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
function toUUID(customId: string): string {
  return uuidv5(customId, NAMESPACE);
}

// ─── Job Posting Processing ───

const jobPostingSchema = z.object({
  title: z.string().describe("Job title"),
  company: z.string().describe("Company name"),
  location: z.string().nullable().describe("Job location or null"),
  salaryRange: z.string().nullable().describe("Salary range if mentioned"),
  team: z.string().nullable().describe("Team or department"),
  description: z.string().describe("Brief job description summary"),
  requirements: z.array(z.string()).describe("Key requirements"),
  responsibilities: z.array(z.string()).describe("Key responsibilities"),
  techStack: z.array(z.string()).describe("Technologies mentioned"),
  autoTitle: z.string().describe("A concise title for this entry: Company - Role"),
});

const notesSchema = z.object({
  autoTitle: z.string().describe("A short title summarizing these notes"),
  sections: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .describe("Organize the notes into titled sections"),
  fullText: z.string().describe("The full notes text, cleaned up"),
});

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return Response.json({ error: "Missing x-user-id" }, { status: 401 });
  }

  const clientApiKey = req.headers.get("x-anthropic-key");
  const clientModel = req.headers.get("x-anthropic-model");
  const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY || "";
  const modelId =
    clientModel || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const anthropic = createAnthropic({ apiKey });

  const { contentType, content, save, url } = await req.json();
  const shouldSave = save === true;

  if (!content || !contentType) {
    return Response.json(
      { error: "Missing content or contentType" },
      { status: 400 }
    );
  }

  try {
    if (contentType === "job") {
      return await processJobPosting(
        anthropic,
        modelId,
        userId,
        content,
        shouldSave,
        url || undefined
      );
    } else if (contentType === "email") {
      return await processEmail(anthropic, modelId, userId, content, shouldSave);
    } else if (contentType === "notes") {
      return await processNotes(anthropic, modelId, userId, content, shouldSave);
    } else {
      return Response.json(
        { error: "Invalid contentType" },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("[AddContent] Error:", e);
    return Response.json(
      { error: `Processing failed: ${e}` },
      { status: 500 }
    );
  }
}

// ─── Job Posting ───

async function processJobPosting(
  anthropic: ReturnType<typeof createAnthropic>,
  modelId: string,
  userId: string,
  content: string,
  shouldSave: boolean,
  url?: string
) {
  // 1. AI parse the content
  const { object: parsed } = await generateObject({
    model: anthropic(modelId),
    schema: jobPostingSchema,
    prompt: `Parse this job posting and extract structured data. If information is not available, use reasonable defaults or null.\n\n${content.slice(0, 8000)}`,
  });

  // 2. Search Pinecone for duplicates
  const searchQuery = `${parsed.company} ${parsed.title}`;
  const matches = await searchJobs(searchQuery, 5);

  let existingId: string | null = null;
  let isUpdate = false;

  for (const match of matches) {
    if (
      match.score &&
      match.score > 0.85 &&
      match.metadata &&
      (match.metadata.company as string)
        .toLowerCase()
        .includes(parsed.company.toLowerCase())
    ) {
      existingId = match.id;
      isUpdate = true;
      break;
    }
  }

  // Also check InstantDB directly
  if (!existingId) {
    const result = await db.query({
      jobPostings: { $: { where: { userId } } },
    });
    const existing = result.jobPostings.find(
      (j) =>
        j.company?.toLowerCase() === parsed.company.toLowerCase() &&
        j.title?.toLowerCase() === parsed.title.toLowerCase()
    );
    if (existing) {
      existingId = existing.id;
      isUpdate = true;
    }
  }

  // 3. Save to InstantDB + Pinecone (only if shouldSave)
  let recordId: string | null = null;
  if (shouldSave) {
    recordId = existingId || instantId();
    const filename = `pasted_${parsed.company.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.txt`;

    const jobUpdate: Record<string, unknown> = {
      userId,
      company: parsed.company,
      title: parsed.title,
      location: parsed.location || "",
      salaryRange: parsed.salaryRange || "",
      team: parsed.team || "",
      description: parsed.description,
      requirements: parsed.requirements,
      responsibilities: parsed.responsibilities,
      techStack: parsed.techStack,
      rawText: content.slice(0, 10000),
      parseConfidence: "full",
    };
    if (url) {
      jobUpdate.url = url;
    }
    if (!isUpdate) {
      jobUpdate.filename = filename;
    }

    await db.transact(
      db.tx.jobPostings[recordId].update(jobUpdate as Record<string, never>)
    );

    try {
      await upsertJobPostings([
        {
          id: recordId,
          filename,
          company: parsed.company,
          title: parsed.title,
          location: parsed.location,
          salaryRange: parsed.salaryRange,
          team: parsed.team,
          description: parsed.description,
          requirements: parsed.requirements,
          responsibilities: parsed.responsibilities,
          techStack: parsed.techStack,
          rawText: content.slice(0, 10000),
          parseConfidence: "full",
        },
      ]);
    } catch (e) {
      console.error("[AddContent] Pinecone upsert failed:", e);
    }
  }

  return Response.json({
    success: true,
    saved: shouldSave,
    autoTitle: parsed.autoTitle,
    isUpdate,
    recordId,
    parsed: {
      company: parsed.company,
      title: parsed.title,
      location: parsed.location,
    },
  });
}

// ─── Email ───

async function processEmail(
  anthropic: ReturnType<typeof createAnthropic>,
  modelId: string,
  userId: string,
  content: string,
  shouldSave: boolean
) {
  const existingThreadContext = await getExistingThreadContext(content);
  const parsed = await parseEmailWithAI(anthropic, modelId, content, existingThreadContext);
  const { threadId, isNewThread } = await resolveThreadId(userId, parsed);

  let emailId: string | null = null;
  if (shouldSave) {
    const result = await saveEmailToDb(userId, parsed, threadId, isNewThread);
    emailId = result.emailId;
  }

  return Response.json({
    success: true,
    saved: shouldSave,
    autoTitle: parsed.autoTitle,
    isNewThread,
    threadId,
    emailId,
    parsed: {
      subject: parsed.subject,
      fromName: parsed.fromName,
      company: parsed.company,
      emailType: parsed.emailType,
    },
  });
}

// ─── Notes ───

async function processNotes(
  anthropic: ReturnType<typeof createAnthropic>,
  modelId: string,
  userId: string,
  content: string,
  shouldSave: boolean
) {
  const { object: parsed } = await generateObject({
    model: anthropic(modelId),
    schema: notesSchema,
    prompt: `Parse and organize these job search notes. Clean up formatting and organize into logical sections.\n\n${content.slice(0, 8000)}`,
  });

  let isUpdate = false;

  if (shouldSave) {
    const result = await db.query({
      preferencesData: { $: { where: { userId } } },
    });
    const existing = result.preferencesData[0];
    isUpdate = !!existing;

    if (existing) {
      const updatedFullText = existing.fullText + "\n\n---\n\n" + parsed.fullText;
      const existingSections = (existing.sections as { title: string; content: string }[]) || [];
      const mergedSections = [...existingSections, ...parsed.sections];

      await db.transact(
        db.tx.preferencesData[existing.id].update({
          fullText: updatedFullText.slice(0, 10000),
          sections: mergedSections,
        })
      );
    } else {
      const recordId = toUUID(`preferences-${userId}`);
      await db.transact(
        db.tx.preferencesData[recordId].update({
          userId,
          fullText: parsed.fullText.slice(0, 10000),
          salary: "",
          location: "",
          dealBreakers: "",
          excitedCompanies: "",
          lessExcitedCompanies: "",
          interviewQuestions: "",
          negotiation: "",
          timeline: "",
          randomThoughts: "",
          salaryResearch: "",
          sections: parsed.sections,
        })
      );
    }
  }

  return Response.json({
    success: true,
    saved: shouldSave,
    autoTitle: parsed.autoTitle,
    isUpdate,
    sectionCount: parsed.sections.length,
  });
}
