import Papa from "papaparse";
import { TrackerEntry } from "@/types";
import { v4 as uuid } from "uuid";

/**
 * Normalize status values while preserving the original
 */
function normalizeStatus(raw: string): string {
  if (!raw || raw.trim() === "") return "unknown";

  const lower = raw.toLowerCase().trim();

  // Direct matches
  const statusMap: Record<string, string> = {
    applied: "applied",
    // "applied - no response": "applied",
    "sent app": "applied",
    rejected: "rejected",
    // "rejected (after onsite!)": "rejected",
    withdrew: "withdrew",
    // "offer received!!": "offer",
    offer: "offer",
    // "offer received": "offer",
    interested: "interested",
    // "interested, haven't applied yet": "interested",
  };

  for (const [key, value] of Object.entries(statusMap)) {
    if (lower === key || lower.includes(key)) return value;
  }

  // Pattern matches
  if (lower.includes("offer")) return "offer";
  if (lower.includes("reject")) return "rejected";
  if (lower.includes("withdrew") || lower.includes("withdraw"))
    return "withdrew";
  if (lower.includes("applied") || lower.includes("sent app"))
    return "applied";
  if (lower.includes("screen")) return "interviewing";
  if (lower.includes("onsite")) return "interviewing";
  if (lower.includes("waiting") || lower.includes("post-onsite"))
    return "waiting";
  if (lower.includes("interested") || lower.includes("haven't applied"))
    return "interested";
  if (lower.includes("recruiter reached out")) return "recruiter_contact";
  if (lower.includes("scheduled")) return "interviewing";
  if (lower === "???" || lower === "?" || lower === "") return "unknown";

  return "unknown";
}

/**
 * Try to parse various date formats
 */
function parseDate(raw: string): Date | null {
  if (!raw || raw.trim() === "") return null;

  const cleaned = raw.trim();

  // Try ISO format: 2025-12-15
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Try US format: 11/15/2025 or 11/20/25
  const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    let year = parseInt(usMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Try "Jan 15" or "Dec 1" format
  const monthNameMatch = cleaned.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i
  );
  if (monthNameMatch) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[monthNameMatch[1].toLowerCase()];
    const d = new Date(2026, month, parseInt(monthNameMatch[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Generic fallback
  try {
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Parse the tracker CSV with ambiguity preservation
 */
export function parseTrackerCSV(csvContent: string): TrackerEntry[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return (result.data as Record<string, string>[]).map((row) => ({
    id: uuid(),
    company: (row["Company"] || "").trim(),
    role: (row["Role"] || "").trim(),
    statusRaw: (row["Status"] || "").trim(),
    statusNormalized: normalizeStatus(row["Status"] || ""),
    dateAppliedRaw: (row["Date Applied"] || "").trim(),
    dateAppliedParsed: parseDate(row["Date Applied"] || ""),
    salaryRange: (row["Salary Range"] || "").trim(),
    location: (row["Location"] || "").trim(),
    recruiter: (row["Recruiter"] || "").trim(),
    notes: (row["Notes"] || "").trim(),
  }));
}

/**
 * Parse tracker from data directory
 */
export async function getLocalDataTrackerCSV(
  dataDir: string
): Promise<TrackerEntry[]> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const csv = await fs.readFile(
    path.join(dataDir, "tracker", "job_tracker.csv"),
    "utf-8"
  );
  return parseTrackerCSV(csv);
}
