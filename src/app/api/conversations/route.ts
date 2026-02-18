import { NextResponse } from "next/server";
import { db, id } from "@/lib/db/instant-admin";

/**
 * GET /api/conversations — List all saved conversations for a user.
 * Requires x-user-id header.
 */
export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { conversations: [], error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    const result = await db.query({
      conversations: {
        $: { where: { userId } },
        messages: {},
      },
    });

    const sorted = [...result.conversations].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ conversations: sorted });
  } catch (error) {
    console.error("[Conversations] Query error:", error);
    return NextResponse.json({ conversations: [], error: String(error) });
  }
}

/**
 * POST /api/conversations — Create a new conversation.
 * Requires x-user-id header.
 */
export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    const { title } = await req.json();
    const convId = id();
    const now = Date.now();

    await db.transact(
      db.tx.conversations[convId].update({
        userId,
        title: title || "New Conversation",
        createdAt: now,
        updatedAt: now,
      })
    );

    return NextResponse.json({ id: convId, title, createdAt: now });
  } catch (error) {
    console.error("[Conversations] Create error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
