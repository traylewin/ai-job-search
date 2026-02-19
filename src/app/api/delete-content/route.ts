import {
  deleteJobPosting,
  deleteTrackerEntry,
  findTrackerByCompany,
  deleteEmailThread,
  deleteCalendarEvent,
} from "@/lib/db/instant-queries";
import {
  deleteJobPostingVectors,
  deleteEmailVectors,
} from "@/lib/db/pinecone";

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return Response.json({ error: "Missing x-user-id" }, { status: 401 });
  }

  const { type, id, company } = await req.json();

  if (!type || !id) {
    return Response.json(
      { error: "Missing type or id" },
      { status: 400 }
    );
  }

  try {
    if (type === "job") {
      // 1. Find and delete matching tracker entry
      let trackerDeleted = false;
      if (company) {
        const trackerEntry = await findTrackerByCompany(userId, company);
        if (trackerEntry) {
          await deleteTrackerEntry(trackerEntry.id);
          trackerDeleted = true;
        }
      }

      // 2. Delete from Pinecone
      try {
        await deleteJobPostingVectors([id]);
      } catch (e) {
        console.error("[DeleteContent] Pinecone job delete failed:", e);
      }

      // 3. Delete from InstantDB
      await deleteJobPosting(id);

      return Response.json({
        success: true,
        message: `Deleted job posting${trackerDeleted ? " and tracker entry" : ""}`,
        trackerDeleted,
      });
    } else if (type === "thread") {
      // 1. Delete thread + child emails from InstantDB (returns email IDs)
      const deletedEmailIds = await deleteEmailThread(userId, id);

      // 2. Delete email vectors from Pinecone
      try {
        if (deletedEmailIds.length > 0) {
          await deleteEmailVectors(deletedEmailIds);
        }
      } catch (e) {
        console.error("[DeleteContent] Pinecone email delete failed:", e);
      }

      return Response.json({
        success: true,
        message: `Deleted email thread and ${deletedEmailIds.length} emails`,
        deletedEmailCount: deletedEmailIds.length,
      });
    } else if (type === "event") {
      await deleteCalendarEvent(id);

      return Response.json({
        success: true,
        message: "Deleted calendar event",
      });
    } else {
      return Response.json(
        { error: `Unknown type: ${type}` },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("[DeleteContent] Error:", e);
    return Response.json(
      { error: `Delete failed: ${e}` },
      { status: 500 }
    );
  }
}
