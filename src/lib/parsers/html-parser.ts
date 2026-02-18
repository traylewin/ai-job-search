import * as cheerio from "cheerio";
import { JobPosting, ParseConfidence } from "@/types";
import { v4 as uuid } from "uuid";

/**
 * Text-First, Structure-Second HTML parser.
 * Always extracts rawText. Attempts structured extraction as best-effort.
 */
export function parseJobPostingHTML(
  html: string,
  filename: string
): JobPosting {
  const $ = cheerio.load(html);

  // Layer 1: Always extract raw readable text
  $(
    "script, style, nav, footer, header.site-header, .cookie-banner, .nav-bar, noscript, iframe"
  ).remove();
  const rawText = $("body")
    .text()
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Layer 2: Best-effort structured extraction
  let company: string | null = null;
  let title: string | null = null;
  let location: string | null = null;
  let salaryRange: string | null = null;
  let team: string | null = null;
  let description: string | null = null;
  const requirements: string[] = [];
  const responsibilities: string[] = [];
  const techStack: string[] = [];

  try {
    const pageTitle = $("title").text().trim();

    // ─── Company extraction (ordered by reliability) ───

    // 1. Explicit CSS class selectors
    company = extractFromSelectors($, [
      ".company-name",
      ".company",
      "[data-company]",
      ".employer-name",
    ]);

    // 2. "About {Company}" heading — extremely reliable (check h2/h3 + bold tags)
    if (!company) {
      company = extractCompanyFromAboutHeading($);
    }

    // 3. Page <title> tag
    if (!company) {
      company = extractCompanyFromTitle(pageTitle);
    }

    // 4. Filename as last resort
    if (!company) {
      company = extractCompanyFromFilename(filename);
    }

    // Clean company: strip "Careers", "Jobs", "Hiring" suffixes
    if (company) {
      company = company.replace(/\s+(Careers|Jobs|Hiring)$/i, "").trim();
    }

    // ─── Job title extraction ───

    // 1. Explicit selector
    title = extractFromSelectors($, [
      ".app-title",
      ".job-title",
      "[data-automation-id='jobTitle']",
      "[data-automation-id='jobPostingTitle']",
    ]);

    // 2. First <h1> — most pages put the job title here
    if (!title) {
      const h1Text = $("h1").first().text().trim();
      if (h1Text && !looksLikeCompanyOnly(h1Text, company)) {
        title = h1Text;
      }
    }

    // 3. First <h2> if it looks like a role title and h1 was the company
    if (!title) {
      const h2Text = $("h2").first().text().trim();
      if (h2Text && looksLikeJobTitle(h2Text)) {
        title = h2Text;
      }
    }

    // 4. From <title> tag
    if (!title) {
      title = extractTitleFromPageTitle(pageTitle);
    }

    // Fix: if title is just the company name (e.g., "ANDURIL"), swap with h2
    if (
      title &&
      company &&
      title.toUpperCase() === company.toUpperCase()
    ) {
      const h2Text = $("h2").first().text().trim();
      if (h2Text && looksLikeJobTitle(h2Text)) {
        title = h2Text;
      }
    }

    // ─── Location ───

    location =
      extractFromSelectors($, [
        ".location",
        ".job-location",
        "[data-location]",
        "[data-automation-id='location']",
      ]) ||
      extractTableField($, "Location") ||
      extractFromText(rawText, /(?:(?:^|\s)Location|Based in)[:\s]+([^\n.]{3,60})/i) ||
      extractLocationFromBadges($);

    // Clean location if it's too long (likely grabbed extra text)
    if (location && location.length > 80) {
      const shortened = location.match(
        /^([^.]+(?:,\s*[A-Z]{2})?(?:\s*\([^)]*\))?)/
      );
      if (shortened) location = shortened[1].trim();
      if (location.length > 80) location = null;
    }

    // ─── Salary ───
    salaryRange =
      extractFromSelectors($, [".salary", ".compensation", ".pay-range"]) ||
      extractSalaryFromText(rawText);

    // ─── Team ───
    team =
      extractFromSelectors($, [".team", ".department"]) ||
      extractTableField($, "Team") ||
      extractTableField($, "Department");

    // Clean team if too long
    if (team && team.length > 60) team = null;

    // ─── Description ───
    const descParagraphs: string[] = [];
    $("h2, h3").each((_, el) => {
      const heading = $(el).text().toLowerCase();
      if (
        heading.includes("about") &&
        !heading.includes("about you") &&
        !heading.startsWith("about us") &&
        !extractCompanyFromAboutHeadingText($(el).text())
      ) {
        // "About the Role" / "About the Opportunity"
        let next = $(el).next();
        while (next.length && !next.is("h2, h3")) {
          const text = next.text().trim();
          if (text) descParagraphs.push(text);
          next = next.next();
        }
      } else if (
        heading.includes("opportunity") ||
        heading.includes("the role") ||
        heading.includes("overview") ||
        heading.includes("why this role") ||
        heading.includes("position overview")
      ) {
        let next = $(el).next();
        while (next.length && !next.is("h2, h3")) {
          const text = next.text().trim();
          if (text) descParagraphs.push(text);
          next = next.next();
        }
      }
    });
    description = descParagraphs.join("\n") || null;

    // ─── Requirements and responsibilities ───
    $("h2, h3").each((_, el) => {
      const heading = $(el).text().toLowerCase();
      const isRequirements =
        heading.includes("look for") ||
        heading.includes("qualif") ||
        heading.includes("requirement") ||
        heading.includes("who we") ||
        heading.includes("what you need") ||
        heading.includes("you have") ||
        heading.includes("about you") ||
        heading.includes("who you are") ||
        heading.includes("you bring");
      const isResponsibilities =
        heading.includes("you'll do") ||
        heading.includes("responsibilit") ||
        heading.includes("what you'll") ||
        heading.includes("role involves") ||
        heading.includes("you'll work on") ||
        heading.includes("core responsibilities");

      if (isRequirements || isResponsibilities) {
        const list = isRequirements ? requirements : responsibilities;
        let next = $(el).next();
        while (next.length && !next.is("h2, h3")) {
          if (next.is("ul, ol")) {
            next.find("li").each((_, li) => {
              const text = $(li).text().trim();
              if (text) list.push(text);
            });
          }
          next = next.next();
        }
      }
    });

    // ─── Tech stack ───
    $(".tag, .tech-tag, .skill-tag").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 30 && !isCommonBadge(text)) {
        techStack.push(text);
      }
    });
    // Also try "Tech we use" section
    $("h2, h3").each((_, el) => {
      const heading = $(el).text().toLowerCase();
      if (heading.includes("tech") && heading.includes("use")) {
        let next = $(el).next();
        while (next.length && !next.is("h2, h3")) {
          if (next.is("ul, ol")) {
            next.find("li").each((_, li) => {
              const text = $(li).text().trim();
              if (text && text.length < 30) techStack.push(text);
            });
          } else if (next.is("p")) {
            const text = next.text().trim();
            text
              .split(/\s+/)
              .filter((t) => t.length > 1 && t.length < 25)
              .forEach((t) => techStack.push(t));
          }
          next = next.next();
        }
      }
    });

    // ─── Post-processing: subtitle-based team/location ───
    const subtitle = $(".hero .subtitle, .subtitle").first().text().trim();
    if (subtitle && subtitle.includes("·")) {
      const parts = subtitle.split("·").map((p) => p.trim());
      if (!team && parts.length >= 1) team = parts[0];
      if (!location && parts.length >= 2) location = parts[1];
    }
  } catch {
    // Structured extraction failed - rawText is still available
  }

  // ─── Clean up: strip emoji prefixes from title ───
  if (title) {
    title = title.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\s]+/u, "").trim();
  }

  // Determine confidence
  let parseConfidence: ParseConfidence = "text-only";
  if (title && company) {
    const hasDetails =
      location ||
      salaryRange ||
      requirements.length > 0 ||
      responsibilities.length > 0;
    parseConfidence = hasDetails ? "full" : "partial";
  }

  return {
    id: uuid(),
    filename,
    company,
    title,
    location,
    salaryRange,
    team,
    description,
    requirements,
    responsibilities,
    techStack,
    rawText,
    parseConfidence,
  };
}

// ─── Helpers ───

function extractFromSelectors(
  $: cheerio.CheerioAPI,
  selectors: string[]
): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text) return text;
    }
  }
  return null;
}

/**
 * Extract company from "About {Company}" headings — most reliable signal.
 * Matches: "About Grafana Labs", "About Us" (skip), "About Datadog", etc.
 * Also checks <p><b>About Company</b></p> patterns (Workday-style).
 */
function extractCompanyFromAboutHeading($: cheerio.CheerioAPI): string | null {
  let result: string | null = null;
  // Check h2/h3 headings
  $("h2, h3").each((_, el) => {
    if (result) return;
    const text = $(el).text().trim();
    const extracted = extractCompanyFromAboutHeadingText(text);
    if (extracted) result = extracted;
  });
  // Also check bold text in paragraphs (e.g., <p><b>About Robinhood</b></p>)
  if (!result) {
    $("b, strong").each((_, el) => {
      if (result) return;
      const text = $(el).text().trim();
      const extracted = extractCompanyFromAboutHeadingText(text);
      if (extracted) result = extracted;
    });
  }
  return result;
}

function extractCompanyFromAboutHeadingText(text: string): string | null {
  const match = text.match(/^About\s+(.+)$/i);
  if (!match) return null;
  const candidate = match[1].trim();
  // Skip generic "About the Role", "About the Team", "About Us", "About You"
  if (
    /^(the\s+(role|team|opportunity|position)|us|you|this\s+role)$/i.test(
      candidate
    )
  ) {
    return null;
  }
  return candidate;
}

/**
 * Extract company from page <title>.
 * Handles: "Role at Company", "Role | Company", "Role - Company",
 *          "Career Opportunity: Role - Company"
 */
function extractCompanyFromTitle(title: string): string | null {
  if (!title) return null;
  // "... at Company"
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();
  // "Role | Company" or "Role - Company" or "Role — Company"
  const sepMatch = title.match(/[-–—|]\s*(.+)$/);
  if (sepMatch) {
    const afterSep = sepMatch[1].trim();
    // Also get part before separator
    const beforeSep = title.slice(0, title.length - sepMatch[0].length).trim();
    // If after-sep looks like a job title, then before-sep is the company
    if (looksLikeJobTitle(afterSep) && !looksLikeJobTitle(beforeSep)) {
      return beforeSep;
    }
    // If after-sep doesn't look like a title, it's likely the company
    if (!looksLikeJobTitle(afterSep)) {
      // But skip generic page sections like "Job Details"
      if (/^(Job Details|Careers|Apply)$/i.test(afterSep)) {
        // Company is before the separator
        return beforeSep || null;
      }
      return afterSep;
    }
  }
  return null;
}

/**
 * Extract job title from page <title>.
 * Handles: "Role at Company", "Role | Company", "Company - Role"
 */
function extractTitleFromPageTitle(title: string): string | null {
  if (!title) return null;
  // "Role at Company" → title is before "at"
  const atMatch = title.match(/^(.+?)\s+at\s+/i);
  if (atMatch) return atMatch[1].trim();
  // "Role | Company" or "Role — Company" → title is before separator
  const sepMatch = title.match(/^(.+?)\s*[-–—|]\s*/);
  if (sepMatch) {
    const candidate = sepMatch[1].trim();
    // Skip if it's "Career Opportunity:" prefix
    const cleaned = candidate.replace(/^Career Opportunity:\s*/i, "").trim();
    if (cleaned && looksLikeJobTitle(cleaned)) return cleaned;
    if (cleaned) return cleaned;
  }
  return null;
}

function extractCompanyFromFilename(filename: string): string | null {
  let clean = filename.replace(/\.html$/i, "");

  // Strip common prefixes: "saved_posting_", "job_", "posting_"
  clean = clean.replace(/^(saved_posting_|job_|posting_)/i, "");

  // Strip common suffixes: "_com", ".com"
  clean = clean.replace(/[_.]com$/i, "");

  // "Company - Role" pattern
  const dashMatch = clean.match(/^(.+?)\s*-\s*/);
  if (dashMatch) {
    const candidate = dashMatch[1].trim();
    if (!looksLikeJobTitle(candidate)) return candidate;
  }
  // "company_role" → first word(s) before role-like terms
  const underscoreClean = clean.replace(/_/g, " ");
  const roleIdx = underscoreClean.search(
    /\b(senior|staff|lead|principal|engineer|developer|swe|software|forward)\b/i
  );
  if (roleIdx > 0) {
    const name = underscoreClean.slice(0, roleIdx).trim();
    if (name.length > 1) {
      return name
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // For numeric suffixes like "posting_12" just skip
  if (/^\d+$/.test(clean)) return null;

  // Fallback: whole cleaned name (capitalize words)
  if (clean.length > 1 && clean.length < 40) {
    return clean
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return null;
}

/** Extract a value from key-value table rows (e.g., "Location" → "Costa Mesa, CA") */
function extractTableField(
  $: cheerio.CheerioAPI,
  fieldName: string
): string | null {
  let result: string | null = null;
  $("tr, dl, .field").each((_, el) => {
    if (result) return;
    const text = $(el).text();
    const pattern = new RegExp(fieldName + "\\s*[:.]?\\s*(.+)", "i");
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim().split("\n")[0].trim();
      if (value && value.length < 80) result = value;
    }
  });
  return result;
}

/** Extract location from badge/tag elements */
function extractLocationFromBadges($: cheerio.CheerioAPI): string | null {
  let result: string | null = null;
  $(".badge, .tag, .badge.remote").each((_, el) => {
    if (result) return;
    const text = $(el).text().trim();
    if (
      /remote|(?:[A-Z][a-z]+,\s*[A-Z]{2})/i.test(text) &&
      text.length < 60
    ) {
      result = text;
    }
  });
  return result;
}

function extractFromText(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractSalaryFromText(text: string): string | null {
  const patterns = [
    /\$[\d,]+[kK]?\s*[-–]\s*\$[\d,]+[kK]?/,
    /(?:salary|compensation|pay|base)[:\s]*\$[\d,]+\s*[-–]\s*\$[\d,]+/i,
    /\$[\d]{3},[\d]{3}\s*[-–]\s*\$[\d]{3},[\d]{3}/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function looksLikeJobTitle(text: string): boolean {
  return /\b(engineer|developer|swe|architect|manager|lead|staff|senior|principal|designer|scientist|analyst|director)\b/i.test(
    text
  );
}

function looksLikeCompanyOnly(text: string, company: string | null): boolean {
  if (!company) return false;
  return (
    text.toUpperCase() === company.toUpperCase() ||
    text.toUpperCase() === company.toUpperCase().replace(/\s+/g, "")
  );
}

function isCommonBadge(text: string): boolean {
  return /^(full[- ]?time|part[- ]?time|remote|hybrid|contract|exempt)$/i.test(
    text
  );
}

/**
 * Parse all HTML files in a directory
 */
export async function getLocalDataJobPostings(
  dataDir: string
): Promise<JobPosting[]> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const postsDir = path.join(dataDir, "job_postings");

  const files = await fs.readdir(postsDir);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));

  const postings: JobPosting[] = [];
  for (const file of htmlFiles) {
    const html = await fs.readFile(path.join(postsDir, file), "utf-8");
    postings.push(parseJobPostingHTML(html, file));
  }

  return postings;
}
