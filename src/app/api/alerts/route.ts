import { NextResponse } from "next/server";
import { generateAlerts } from "@/lib/agent/proactive-alerts";

/**
 * GET /api/alerts — Generate proactive alerts for the user.
 * Requires x-user-id header.
 */
export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { alerts: [], error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    const alerts = await generateAlerts(userId);
    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("[Alerts] Error:", error);
    return NextResponse.json(
      { alerts: [], error: String(error) },
      { status: 500 }
    );
  }
}
