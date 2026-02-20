/**
 * Server-side job state management.
 * Uses AI with agent tools to refresh tracker/job posting status.
 */
import { generateText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createTools } from "@/lib/agent/tools";
import { db } from "@/lib/db/instant-admin";

/**
 * Use AI to update the tracker entry for a given job posting.
 * Accepts either a jobId (preferred) or a company name.
 * The AI reads emails, calendar events, and infers the latest status,
 * then calls updateTracker to persist the changes.
 */
export async function updateJobStateWithAI(
  userId: string,
  opts: { jobId?: string; company?: string; jobTitle?: string },
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const modelId = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  if (!apiKey) {
    return { success: false, error: "No ANTHROPIC_API_KEY configured" };
  }

  let company = opts.company || "";
  let jobTitle = opts.jobTitle;

  // Resolve company name from jobId if needed
  if (opts.jobId && !company) {
    try {
      const [jobResult, companiesResult] = await Promise.all([
        db.query({ jobPostings: { $: { where: { userId } } } }),
        db.query({ companies: { $: { where: { userId } } } }),
      ]);
      const job = jobResult.jobPostings.find((j) => j.id === opts.jobId);
      if (job) {
        jobTitle = jobTitle || (job.title as string) || undefined;
        const companyId = job.companyId as string;
        if (companyId) {
          const companyRecord = companiesResult.companies.find((c) => c.id === companyId);
          company = (companyRecord?.name as string) || "";
        }
      }
    } catch (e) {
      console.error("[Job] Failed to resolve job posting:", e);
    }
  }

  if (!company) {
    return { success: false, error: "Could not resolve company name" };
  }

  const anthropic = createAnthropic({ apiKey });
  const tools = createTools(userId);

  const jobDescription = jobTitle
    ? `${company} — ${jobTitle}`
    : company;

  try {
    await generateText({
      model: anthropic(modelId),
      tools,
      stopWhen: stepCountIs(8),
      system: `You are a job search assistant that updates tracker entries. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

Your task: Update the tracker for the given company by reading the latest emails and calendar events, inferring the current status, and calling updateTracker.

Rules:
- First search emails and calendar events for the company (in parallel if possible).
- Read the most recent email thread if found.
- Infer the correct status from what you find:
  - Rejection language → "rejected"
  - Interview scheduling → "interviewing"  
  - Offer language → "offer"
  - Application confirmation → "applied"
  - No clear signal → leave status unchanged
- Call updateTracker with the inferred status and a brief note summarizing what you found.
- If no emails or events exist for this company, call updateTracker with just a note: "No recent activity found"
- Do NOT ask any questions. Just execute the update.`,
      prompt: `Update tracker for: ${jobDescription}`,
    });

    return { success: true };
  } catch (e) {
    console.error(`[Job] AI update failed for ${company}:`, e);
    return { success: false, error: String(e) };
  }
}
