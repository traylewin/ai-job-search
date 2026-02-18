import { Preferences } from "@/types";

/**
 * Parse the markdown notes/preferences file
 */
export function parseNotes(text: string): Preferences {
  const sections: { title: string; content: string }[] = [];

  // Split by markdown headings (### level)
  const sectionPattern = /^###\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const headings: { title: string; start: number }[] = [];

  while ((match = sectionPattern.exec(text)) !== null) {
    headings.push({ title: match[1].trim(), start: match.index + match[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const end = i + 1 < headings.length ? headings[i + 1].start - headings[i + 1].title.length - 4 : text.length;
    const content = text.slice(headings[i].start, end).trim();
    sections.push({ title: headings[i].title, content });
  }

  // Map sections to structured fields
  const findSection = (keywords: string[]): string => {
    const section = sections.find((s) =>
      keywords.some((k) => s.title.toLowerCase().includes(k))
    );
    return section?.content || "";
  };

  return {
    fullText: text,
    salary: findSection(["looking for", "comp"]),
    location: findSection(["looking for"]),
    dealBreakers: findSection(["deal breaker"]),
    excitedCompanies: findSection(["excited about"]),
    lessExcitedCompanies: findSection(["less excited"]),
    interviewQuestions: findSection(["questions"]),
    negotiation: findSection(["negotiation"]),
    timeline: findSection(["timeline"]),
    randomThoughts: findSection(["random"]),
    salaryResearch: findSection(["salary research"]),
    sections,
  };
}

/**
 * Parse notes from data directory
 */
export async function getLocalDataNotes(dataDir: string): Promise<Preferences> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const text = await fs.readFile(
    path.join(dataDir, "notes", "job_search_notes.md"),
    "utf-8"
  );
  return parseNotes(text);
}
