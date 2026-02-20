/**
 * Server-side: update job posting + tracker entry status based on synced calendar events.
 * Called after importing events to reflect status changes in the tracker.
 */
import { db } from "@/lib/db/instant-admin";
import { classifyEventType, inferStatusFromEvent } from "./index";
import { isStatusAdvance } from "@/lib/email";

interface CalendarEventRecord {
  id: string;
  companyId?: string;
  title: string;
  description?: string;
  startTime: string;
  eventType?: string;
}

/**
 * After a calendar sync, scan newly created/updated events and advance
 * job posting statuses where warranted (e.g. interview event → "interviewing").
 *
 * Also updates each tracker entry's lastEvent fields.
 */
export async function updateJobStateFromEvents(
  userId: string,
  events: CalendarEventRecord[],
): Promise<{ updated: number }> {
  if (events.length === 0) return { updated: 0 };

  const [trackerResult, jobsResult] = await Promise.all([
    db.query({ trackerEntries: { $: { where: { userId } } } }),
    db.query({ jobPostings: { $: { where: { userId } } } }),
  ]);

  const trackerByCompanyId = new Map<string, typeof trackerResult.trackerEntries[0]>();
  for (const e of trackerResult.trackerEntries) {
    const cId = e.companyId as string;
    if (cId) trackerByCompanyId.set(cId, e);
  }

  const jobByCompanyId = new Map<string, typeof jobsResult.jobPostings[0]>();
  const jobById = new Map<string, typeof jobsResult.jobPostings[0]>();
  for (const j of jobsResult.jobPostings) {
    const cId = j.companyId as string;
    if (cId) jobByCompanyId.set(cId, j);
    jobById.set(j.id, j);
  }

  // Sort by startTime ascending so we process in chronological order
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txns: any[] = [];
  const updatedCompanies = new Set<string>();
  const effectiveStatus = new Map<string, string>();

  // Track the latest event per company for tracker updates
  const latestEventByCompany = new Map<string, CalendarEventRecord>();

  for (const event of sorted) {
    const cId = event.companyId;
    if (!cId) continue;

    // Always track latest event per company
    const prev = latestEventByCompany.get(cId);
    if (!prev || new Date(event.startTime) > new Date(prev.startTime)) {
      latestEventByCompany.set(cId, event);
    }

    const evtType = event.eventType
      ? (event.eventType as ReturnType<typeof classifyEventType>)
      : classifyEventType(event.title, event.description || "");

    const inferred = inferStatusFromEvent(evtType);
    if (!inferred) continue;

    const tracker = trackerByCompanyId.get(cId);
    const job = tracker
      ? (tracker.jobPostingId ? jobById.get(tracker.jobPostingId as string) : jobByCompanyId.get(cId))
      : jobByCompanyId.get(cId);

    const currentStatus = effectiveStatus.get(cId)
      || (job?.status as string)
      || "interested";

    if (!isStatusAdvance(currentStatus, inferred)) continue;

    effectiveStatus.set(cId, inferred);
    updatedCompanies.add(cId);
  }

  // Build transactions: status updates for job postings
  for (const cId of updatedCompanies) {
    const newStatus = effectiveStatus.get(cId)!;
    const tracker = trackerByCompanyId.get(cId);
    const job = tracker
      ? (tracker.jobPostingId ? jobById.get(tracker.jobPostingId as string) : jobByCompanyId.get(cId))
      : jobByCompanyId.get(cId);

    if (job) {
      txns.push(db.tx.jobPostings[job.id].update({ status: newStatus }));
    }
  }

  // Update tracker entries with latest event per company
  for (const [cId, event] of latestEventByCompany) {
    const tracker = trackerByCompanyId.get(cId);
    if (!tracker) continue;
    const currentDate = tracker.lastEventDate as string | undefined;
    if (!currentDate || new Date(event.startTime) > new Date(currentDate)) {
      txns.push(
        db.tx.trackerEntries[tracker.id].update({
          lastEventId: event.id,
          lastEventTitle: event.title,
          lastEventDate: event.startTime,
        })
      );
    }
  }

  if (txns.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < txns.length; i += batchSize) {
      await db.transact(txns.slice(i, i + batchSize));
    }
  }

  return { updated: updatedCompanies.size };
}
