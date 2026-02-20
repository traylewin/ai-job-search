import { NextResponse } from "next/server";
import { updateJobStateWithAI } from "@/lib/job";

export const maxDuration = 300;

/**
 * POST /api/job/refresh-status
 * Accepts an array of job posting IDs (or a single jobId)
 * and uses AI to refresh the tracker status for each one.
 */
export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing x-user-id" }, { status: 401 });
  }

  let body: { jobPostingIds?: string[]; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Support single jobId or array of jobPostingIds
  const ids = body.jobId ? [body.jobId] : body.jobPostingIds || [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "jobPostingIds array or jobId required" }, { status: 400 });
  }

  const results: { jobId: string; success: boolean; error?: string }[] = [];

  for (const jobId of ids) {
    const r = await updateJobStateWithAI(userId, { jobId });
    results.push({ jobId, ...r });
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    total: ids.length,
    succeeded,
    failed,
    results,
  });
}
