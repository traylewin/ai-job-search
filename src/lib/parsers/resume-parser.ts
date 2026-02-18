import { Resume, ResumeSection } from "@/types";

/**
 * Parse the resume text file into structured sections
 */
export function parseResume(text: string): Resume {
  const sections: ResumeSection[] = [];
  const sectionPattern = /^[═]{3,}$/m;

  // Split by the section separator
  const parts = text.split(sectionPattern).map((s) => s.trim()).filter(Boolean);

  // First part is header (name, contact)
  const header = parts[0] || "";
  const headerLines = header.split("\n").map((l) => l.trim()).filter(Boolean);
  const name = headerLines[0] || "";
  const contact = headerLines.slice(1).join(" | ");

  let summary = "";
  let experience = "";
  let education = "";
  let skills = "";
  let projects = "";

  for (const part of parts.slice(1)) {
    const lines = part.split("\n");
    const title = lines[0]?.trim() || "";
    const content = lines.slice(1).join("\n").trim();

    sections.push({ title, content });

    const titleLower = title.toLowerCase();
    if (titleLower.includes("summary")) {
      summary = content;
    } else if (titleLower.includes("experience")) {
      experience = content;
    } else if (titleLower.includes("education")) {
      education = content;
    } else if (titleLower.includes("skills")) {
      skills = content;
    } else if (titleLower.includes("project") || titleLower.includes("open source")) {
      projects = content;
    }
  }

  return {
    fullText: text,
    name,
    contact,
    summary,
    experience,
    education,
    skills,
    projects,
    sections,
  };
}

/**
 * Parse resume from data directory
 */
export async function getLocalDataResume(dataDir: string): Promise<Resume> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const text = await fs.readFile(
    path.join(dataDir, "resume", "alex_chen_resume.txt"),
    "utf-8"
  );
  return parseResume(text);
}
