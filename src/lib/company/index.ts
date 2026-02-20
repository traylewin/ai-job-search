/**
 * Shared company matching and resolution utilities.
 * Used by calendar scan, email scan, agent tools, and query helpers.
 */

export const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
  "me.com", "mac.com", "googlemail.com", "ymail.com",
]);

/** Strip spaces, hyphens, and underscores for fuzzy company name comparison */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, "");
}

export function companyMatches(candidate: string, query: string): boolean {
  const cLower = candidate.toLowerCase();
  const qLower = query.toLowerCase();
  if (cLower.includes(qLower) || qLower.includes(cLower)) return true;
  const cNorm = normalize(candidate);
  const qNorm = normalize(query);
  return cNorm.includes(qNorm) || qNorm.includes(cNorm);
}

/** Safely extract the domain portion of an email address, lowercased. */
export function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

/**
 * Infer a company name from an email domain by stripping TLD and common prefixes.
 * Returns null for generic providers (gmail, yahoo, etc.).
 */
export function extractCompanyFromDomain(domain: string): string | null {
  const name = domain
    .replace(/\.(com|io|org|co|dev|tech|ai)$/i, "")
    .replace(/^(no-reply\.|careers\.|jobs\.|recruiting\.)/, "");
  if (!name || GENERIC_DOMAINS.has(domain)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── CompanyMatcher ─────────────────────────────────────────────

interface CompanyRecord {
  id: string;
  name: string;
  emailDomain?: string | null;
}

interface ContactRecord {
  email?: string | null;
  companyId?: string | null;
}

export interface CompanyMatchResult {
  companyId: string;
  companyName: string;
}

/**
 * Pre-built lookup tables for fast company matching.
 * Constructed once per request from the user's companies and contacts.
 */
export interface CompanyMatcher {
  /** Match one or more email domains (e.g. attendee domains). Returns first hit. */
  matchDomains(domains: string[]): CompanyMatchResult | null;
  /** Match a single email address against contact domains + company domains. */
  matchEmail(email: string): CompanyMatchResult | null;
  /** Match free text (e.g. subject/body) against company names (min 3 chars). */
  matchText(text: string): CompanyMatchResult | null;
  /** Word-boundary match a company name in a title string. */
  matchTitle(title: string): CompanyMatchResult | null;
}

/**
 * Build a CompanyMatcher from a user's company and contact records.
 * @param userDomain  The user's own email domain — will be added to the generic exclusion list.
 */
export function buildCompanyMatcher(
  companies: CompanyRecord[],
  contacts: ContactRecord[],
  userDomain?: string,
): CompanyMatcher {
  const genericDomains = new Set(GENERIC_DOMAINS);
  if (userDomain) genericDomains.add(userDomain);

  const nameToId = new Map<string, string>();
  const nameToCanonical = new Map<string, string>();
  const domainToId = new Map<string, string>();
  const domainToName = new Map<string, string>();
  const companyRegexes: { id: string; name: string; regex: RegExp }[] = [];

  for (const c of companies) {
    const lower = c.name.toLowerCase();
    nameToId.set(lower, c.id);
    nameToCanonical.set(lower, c.name);
    if (c.emailDomain) {
      const d = c.emailDomain.toLowerCase();
      domainToId.set(d, c.id);
      domainToName.set(d, c.name);
    }
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    companyRegexes.push({ id: c.id, name: c.name, regex: new RegExp(`\\b${escaped}\\b`, "i") });
  }

  // Contact domain → companyId (skip generic domains)
  const contactDomainToId = new Map<string, string>();
  const contactDomainToName = new Map<string, string>();
  const contactEmailToCompanyId = new Map<string, string>();

  for (const ct of contacts) {
    if (!ct.email || !ct.companyId) continue;
    const emailLower = ct.email.toLowerCase();
    contactEmailToCompanyId.set(emailLower, ct.companyId);
    const d = extractDomain(ct.email);
    if (d && !genericDomains.has(d)) {
      contactDomainToId.set(d, ct.companyId);
      const cName = nameToCanonical.get(
        [...nameToId.entries()].find(([, id]) => id === ct.companyId)?.[0] || ""
      );
      if (cName) contactDomainToName.set(d, cName);
    }
  }

  function resolveId(companyId: string): CompanyMatchResult | null {
    const name = [...nameToId.entries()].find(([, id]) => id === companyId);
    if (name) return { companyId, companyName: nameToCanonical.get(name[0]) || name[0] };
    return { companyId, companyName: "Unknown" };
  }

  return {
    matchDomains(domains: string[]): CompanyMatchResult | null {
      for (const d of domains) {
        // Priority 1: contact domain
        if (contactDomainToId.has(d)) {
          return { companyId: contactDomainToId.get(d)!, companyName: contactDomainToName.get(d) || "Unknown" };
        }
        // Priority 2: company email domain
        if (domainToId.has(d)) {
          return { companyId: domainToId.get(d)!, companyName: domainToName.get(d) || "Unknown" };
        }
      }
      // Priority 3: domain contains a company name
      for (const d of domains) {
        for (const [lower, id] of nameToId) {
          const normalized = normalize(lower);
          if (d.includes(normalized) || normalized.includes(d.split(".")[0])) {
            return { companyId: id, companyName: nameToCanonical.get(lower) || lower };
          }
        }
      }
      return null;
    },

    matchEmail(email: string): CompanyMatchResult | null {
      const emailLower = email.toLowerCase();
      const d = extractDomain(email);

      // Check contact domain
      if (d && contactDomainToId.has(d)) {
        return { companyId: contactDomainToId.get(d)!, companyName: contactDomainToName.get(d) || "Unknown" };
      }
      // Check company email domain
      if (d && domainToId.has(d)) {
        return { companyId: domainToId.get(d)!, companyName: domainToName.get(d) || "Unknown" };
      }
      // Check known contact email
      if (contactEmailToCompanyId.has(emailLower)) {
        return resolveId(contactEmailToCompanyId.get(emailLower)!);
      }
      // Check domain contains company name
      if (d) {
        for (const [lower, id] of nameToId) {
          const normalized = normalize(lower);
          if (d.includes(normalized) || normalized.includes(d.split(".")[0])) {
            return { companyId: id, companyName: nameToCanonical.get(lower) || lower };
          }
        }
      }
      return null;
    },

    matchText(text: string): CompanyMatchResult | null {
      const lower = text.toLowerCase();
      for (const [name, id] of nameToId) {
        if (name.length >= 3 && lower.includes(name)) {
          return { companyId: id, companyName: nameToCanonical.get(name) || name };
        }
      }
      return null;
    },

    matchTitle(title: string): CompanyMatchResult | null {
      for (const { id, name, regex } of companyRegexes) {
        if (regex.test(title)) {
          return { companyId: id, companyName: name };
        }
      }
      return null;
    },
  };
}
