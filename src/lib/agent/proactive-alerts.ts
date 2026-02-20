import { ProactiveAlert } from "@/types";
import {
  getAllTrackerEntries,
  getAllJobPostings,
  getAllEmails,
  getPreferences,
  getCompanyNameMap,
} from "@/lib/db/instant-queries";
import { differenceInDays, parse, isValid } from "date-fns";

/**
 * Scan InstantDB data for time-sensitive items and proactive insights.
 * No hardcoded data — everything is derived from what's actually stored.
 */
export async function generateAlerts(userId: string): Promise<ProactiveAlert[]> {
  const now = new Date();
  const alerts: ProactiveAlert[] = [];

  let tracker: Awaited<ReturnType<typeof getAllTrackerEntries>>;
  let jobs: Awaited<ReturnType<typeof getAllJobPostings>>;
  let emails: Awaited<ReturnType<typeof getAllEmails>>;
  let prefs: Awaited<ReturnType<typeof getPreferences>>;

  let nameMap: Map<string, string>;

  try {
    const results = await Promise.all([
      getAllTrackerEntries(userId),
      getAllJobPostings(userId),
      getAllEmails(userId),
      getPreferences(userId),
      getCompanyNameMap(userId),
    ]);
    tracker = results[0];
    jobs = results[1];
    emails = results[2];
    prefs = results[3];
    nameMap = results[4];
  } catch (e) {
    console.warn("[Alerts] Failed to query InstantDB:", e);
    return [];
  }

  if (tracker.length === 0) return [];

  const statusByJobId = new Map(
    jobs.map((j) => [j.id, ((j.status as string) || "interested").toLowerCase()])
  );
  function getStatus(entry: (typeof tracker)[0]): string {
    return statusByJobId.get(entry.jobPostingId as string) || "interested";
  }
  function getCompanyName(entry: (typeof tracker)[0]): string {
    return nameMap.get(entry.companyId as string) || "Unknown";
  }

  // ─── 1. Offer deadlines ───
  // Look for entries with offer status and scan notes/preferences for deadline info
  const offerEntries = tracker.filter(
    (t) => getStatus(t) === "offer"
  );

  for (const entry of offerEntries) {
    // Check notes for deadline hints
    const companyName = getCompanyName(entry);
    const notes = (entry.notes || "").toLowerCase();
    const deadlinePatterns = [
      /deadline[:\s]*(\w+ \d{1,2})/i,
      /expires?[:\s]*(\w+ \d{1,2})/i,
      /respond by[:\s]*(\w+ \d{1,2})/i,
      /by (\w+ \d{1,2})/i,
      /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
    ];

    let deadlineFound = false;
    for (const pattern of deadlinePatterns) {
      const match = notes.match(pattern) || (entry.notes || "").match(pattern);
      if (match) {
        alerts.push({
          id: `deadline-${companyName}`,
          type: "deadline",
          severity: "critical",
          title: `${companyName} offer deadline`,
          description: `Offer notes mention: "${match[0]}". Review details and decide.`,
          companyName,
          actionLabel: "Review offer details",
        });
        deadlineFound = true;
        break;
      }
    }

    if (!deadlineFound && prefs) {
      const companyLower = companyName.toLowerCase();
      const prefsText = `${prefs.negotiation || ""} ${prefs.timeline || ""}`.toLowerCase();
      if (prefsText.includes(companyLower)) {
        const companyIdx = prefsText.indexOf(companyLower);
        const nearby = prefsText.slice(
          Math.max(0, companyIdx - 50),
          companyIdx + companyName.length + 100
        );
        const dateMatch = nearby.match(/(\w+ \d{1,2})/);
        if (dateMatch) {
          alerts.push({
            id: `deadline-${companyName}`,
            type: "deadline",
            severity: "warning",
            title: `${companyName} offer — check timeline`,
            description: `You have an offer from ${companyName}. Your notes mention "${dateMatch[0]}" nearby. Review your timeline.`,
            companyName,
            actionLabel: "Compare offers",
          });
        } else if (!alerts.some((a) => a.companyName === companyName)) {
          alerts.push({
            id: `offer-${companyName}`,
            type: "deadline",
            severity: "warning",
            title: `${companyName} offer pending`,
            description: `You have an active offer from ${companyName}. Make sure you're tracking the decision deadline.`,
            companyName,
            actionLabel: "Review offer details",
          });
        }
      }
    }
  }

  // ─── 2. Upcoming interviews ───
  const interviewingEntries = tracker.filter(
    (t) => {
      const s = getStatus(t);
      return s === "interviewing" || s.includes("screen") || s.includes("onsite") || s.includes("scheduled");
    }
  );

  for (const entry of interviewingEntries) {
    const companyName = getCompanyName(entry);
    const entryStatus = getStatus(entry);
    const textToScan = `${entryStatus} ${entry.notes || ""}`;
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
      /(\w+day,?\s+\w+ \d{1,2})/i,
      /(feb(?:ruary)?\s+\d{1,2})/i,
      /(mar(?:ch)?\s+\d{1,2})/i,
      /(jan(?:uary)?\s+\d{1,2})/i,
      /(apr(?:il)?\s+\d{1,2})/i,
    ];

    let foundDate = false;
    for (const pattern of datePatterns) {
      const match = textToScan.match(pattern);
      if (match) {
        alerts.push({
          id: `interview-${companyName}`,
          type: "upcoming",
          severity: "warning",
          title: `${companyName} interview`,
          description: `${entryStatus}${entry.notes ? ` — ${entry.notes}` : ""}`,
          companyName,
          actionLabel: "Prep for interview",
        });
        foundDate = true;
        break;
      }
    }

    if (!foundDate && entryStatus !== "interviewing") {
      alerts.push({
        id: `interview-${companyName}`,
        type: "upcoming",
        severity: "info",
        title: `${companyName} — ${entryStatus}`,
        description: entry.notes || "Interview stage. Check for scheduling details.",
        companyName,
        actionLabel: "Review posting",
      });
    }
  }

  // ─── 3. Stale applications (applied, no activity in 14+ days) ───
  for (const entry of tracker) {
    if (getStatus(entry) !== "applied") continue;

    const dateStr = entry.dateAppliedRaw;
    if (!dateStr) continue;

    // Try to parse the application date
    let appliedDate: Date | null = null;
    const formats = ["MM/dd/yyyy", "yyyy-MM-dd", "M/d/yyyy", "MM/dd/yy"];
    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) {
        appliedDate = parsed;
        break;
      }
    }
    if (!appliedDate) {
      // Try native Date parsing
      const native = new Date(dateStr);
      if (isValid(native)) appliedDate = native;
    }
    if (!appliedDate) continue;

    const daysSince = differenceInDays(now, appliedDate);
    if (daysSince < 14) continue;

    const companyName = getCompanyName(entry);
    const companyLower = companyName.toLowerCase();
    const hasReply = emails.some(
      (e) =>
        (e.fromEmail.toLowerCase().includes(companyLower) ||
         e.fromName.toLowerCase().includes(companyLower)) &&
        !e.fromEmail.toLowerCase().includes("alex")
    );

    if (!hasReply) {
      alerts.push({
        id: `stale-${companyName}`,
        type: "stale",
        severity: "info",
        title: `No response from ${companyName}`,
        description: `Applied ${daysSince} days ago. No email activity detected. Consider following up.`,
        companyName,
        actionLabel: "Draft follow-up",
      });
    }
  }

  // ─── 4. Waiting entries that might be overdue ───
  for (const entry of tracker) {
    const waitStatus = getStatus(entry);
    if (!waitStatus.includes("waiting") && !waitStatus.includes("pending")) continue;

    const companyName = getCompanyName(entry);
    const companyLower = companyName.toLowerCase();
    const companyEmails = emails.filter(
      (e) =>
        e.fromEmail.toLowerCase().includes(companyLower) ||
        e.fromName.toLowerCase().includes(companyLower) ||
        e.subject.toLowerCase().includes(companyLower)
    );

    if (companyEmails.length > 0) {
      const sortedEmails = [...companyEmails].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const lastEmail = sortedEmails[0];
      const lastDate = new Date(lastEmail.date);
      if (isValid(lastDate)) {
        const daysSince = differenceInDays(now, lastDate);
        if (daysSince >= 7) {
          alerts.push({
            id: `waiting-${companyName}`,
            type: "stale",
            severity: "warning",
            title: `${companyName} — waiting ${daysSince} days`,
            description: `Last heard from ${companyName} ${daysSince} days ago (status: "${waitStatus}"). May be time to follow up.`,
            companyName,
            actionLabel: "Draft follow-up",
          });
        }
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  return alerts;
}
