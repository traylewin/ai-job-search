import { NextResponse } from "next/server";
import { ingestAllData, SampleDataLoadStatus } from "@/lib/db/ingest-data";

export const maxDuration = 120;

/**
 * POST /api/ingest — Parse local data files and write to InstantDB + Pinecone.
 * Requires x-user-id header.
 * Accepts optional JSON body: { force?: boolean; loadStatus?: SampleDataLoadStatus }
 */
export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    let force = false;
    let loadStatus: Partial<SampleDataLoadStatus> | undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      force = body.force === true;
      loadStatus = body.loadStatus;
    } else {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true";
    }

    console.log("[Ingest] userId:", userId, "force:", force);
    const results = await ingestAllData(userId, { force, loadStatus });
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("[Ingest] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
