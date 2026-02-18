import { ProactiveAlert } from "@/types";
import {
  getAllTrackerEntries,
  getAllEmails,
  getPreferences,
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
  let emails: Awaited<ReturnType<typeof getAllEmails>>;
  let prefs: Awaited<ReturnType<typeof getPreferences>>;

  try {
    const results = await Promise.all([
      getAllTrackerEntries(userId),
      getAllEmails(userId),
      getPreferences(userId),
    ]);
    tracker = results[0];
    emails = results[1];
    prefs = results[2];
  } catch (e) {
    console.warn("[Alerts] Failed to query InstantDB:", e);
    return [];
  }

  if (tracker.length === 0) return [];

  // ─── 1. Offer deadlines ───
  // Look for entries with offer status and scan notes/preferences for deadline info
  const offerEntries = tracker.filter(
    (t) => t.statusNormalized === "offer"
  );

  for (const entry of offerEntries) {
    // Check notes for deadline hints
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
          id: `deadline-${entry.company}`,
          type: "deadline",
          severity: "critical",
          title: `${entry.company} offer deadline`,
          description: `Offer notes mention: "${match[0]}". Review details and decide.`,
          company: entry.company,
          actionLabel: "Review offer details",
        });
        deadlineFound = true;
        break;
      }
    }

    // Also check preferences for deadline mentions about this company
    if (!deadlineFound && prefs) {
      const companyLower = entry.company.toLowerCase();
      const prefsText = `${prefs.negotiation || ""} ${prefs.timeline || ""}`.toLowerCase();
      if (prefsText.includes(companyLower)) {
        // Look for date patterns near the company name
        const companyIdx = prefsText.indexOf(companyLower);
        const nearby = prefsText.slice(
          Math.max(0, companyIdx - 50),
          companyIdx + entry.company.length + 100
        );
        const dateMatch = nearby.match(/(\w+ \d{1,2})/);
        if (dateMatch) {
          alerts.push({
            id: `deadline-${entry.company}`,
            type: "deadline",
            severity: "warning",
            title: `${entry.company} offer — check timeline`,
            description: `You have an offer from ${entry.company}. Your notes mention "${dateMatch[0]}" nearby. Review your timeline.`,
            company: entry.company,
            actionLabel: "Compare offers",
          });
        } else if (!alerts.some((a) => a.company === entry.company)) {
          alerts.push({
            id: `offer-${entry.company}`,
            type: "deadline",
            severity: "warning",
            title: `${entry.company} offer pending`,
            description: `You have an active offer from ${entry.company}. Make sure you're tracking the decision deadline.`,
            company: entry.company,
            actionLabel: "Review offer details",
          });
        }
      }
    }
  }

  // ─── 2. Upcoming interviews ───
  const interviewingEntries = tracker.filter(
    (t) =>
      t.statusNormalized === "interviewing" ||
      t.statusRaw.toLowerCase().includes("screen") ||
      t.statusRaw.toLowerCase().includes("onsite") ||
      t.statusRaw.toLowerCase().includes("scheduled")
  );

  for (const entry of interviewingEntries) {
    // Try to extract dates from status or notes
    const textToScan = `${entry.statusRaw} ${entry.notes || ""}`;
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
          id: `interview-${entry.company}`,
          type: "upcoming",
          severity: "warning",
          title: `${entry.company} interview`,
          description: `${entry.statusRaw}${entry.notes ? ` — ${entry.notes}` : ""}`,
          company: entry.company,
          actionLabel: "Prep for interview",
        });
        foundDate = true;
        break;
      }
    }

    if (!foundDate && entry.statusRaw.toLowerCase() !== "interviewing") {
      // Still flag it if status mentions screen/onsite/scheduled
      alerts.push({
        id: `interview-${entry.company}`,
        type: "upcoming",
        severity: "info",
        title: `${entry.company} — ${entry.statusRaw}`,
        description: entry.notes || "Interview stage. Check for scheduling details.",
        company: entry.company,
        actionLabel: "Review posting",
      });
    }
  }

  // ─── 3. Stale applications (applied, no activity in 14+ days) ───
  for (const entry of tracker) {
    if (entry.statusNormalized !== "applied") continue;

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

    // Check if there are any emails from this company
    const companyLower = entry.company.toLowerCase();
    const hasReply = emails.some(
      (e) =>
        (e.fromEmail.toLowerCase().includes(companyLower) ||
         e.fromName.toLowerCase().includes(companyLower)) &&
        !e.fromEmail.toLowerCase().includes("alex")
    );

    if (!hasReply) {
      alerts.push({
        id: `stale-${entry.company}`,
        type: "stale",
        severity: "info",
        title: `No response from ${entry.company}`,
        description: `Applied ${daysSince} days ago. No email activity detected. Consider following up.`,
        company: entry.company,
        actionLabel: "Draft follow-up",
      });
    }
  }

  // ─── 4. Waiting entries that might be overdue ───
  for (const entry of tracker) {
    const status = entry.statusRaw.toLowerCase();
    if (!status.includes("waiting") && !status.includes("pending")) continue;

    // Check the latest email from this company
    const companyLower = entry.company.toLowerCase();
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
            id: `waiting-${entry.company}`,
            type: "stale",
            severity: "warning",
            title: `${entry.company} — waiting ${daysSince} days`,
            description: `Last heard from ${entry.company} ${daysSince} days ago (status: "${entry.statusRaw}"). May be time to follow up.`,
            company: entry.company,
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
