import { NextResponse } from "next/server";
import { db, id } from "@/lib/db/instant-admin";

/**
 * GET /api/conversations/[conversationId]/messages — Get all messages for a conversation.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;

  try {
    const result = await db.query({
      chatMessages: {
        $: {
          where: {
            "conversation.id": conversationId,
          },
        },
      },
    });

    const sorted = [...result.chatMessages].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return NextResponse.json({ messages: sorted });
  } catch (error) {
    console.error("[Messages] Query error:", error);
    return NextResponse.json({ messages: [], error: String(error) });
  }
}

/**
 * POST /api/conversations/[conversationId]/messages — Add a message to a conversation.
 * Requires x-user-id header.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: "Missing x-user-id header" },
      { status: 401 }
    );
  }

  try {
    const { role, content, parts } = await req.json();
    const msgId = id();
    const now = Date.now();

    await db.transact([
      db.tx.chatMessages[msgId]
        .update({
          userId,
          role,
          content: content || "",
          parts: parts || null,
          createdAt: now,
        })
        .link({ conversation: conversationId }),
      db.tx.conversations[conversationId].update({
        updatedAt: now,
      }),
    ]);

    return NextResponse.json({ id: msgId, role, content, createdAt: now });
  } catch (error) {
    console.error("[Messages] Create error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
