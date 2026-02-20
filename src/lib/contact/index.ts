/**
 * Shared contact processing utilities.
 * Used by email-processing and potentially email/scan route.
 */
import { db, id as instantId } from "@/lib/db/instant-admin";
import { findOrCreateCompany } from "@/lib/db/instant-queries";
import { upsertContacts } from "@/lib/db/pinecone";

/**
 * Upsert contacts extracted from an email. Deduplicates by email address per user.
 * Filters out the logged-in user so they never appear in their own contacts list.
 */
export async function upsertExtractedContacts(
  userId: string,
  contacts: { name: string; email: string; position: string | null; company: string | null }[],
  fallbackCompany: string | null,
  userEmail?: string
) {
  const existingResult = await db.query({
    contacts: { $: { where: { userId } } },
  });
  const existingByEmail = new Map(
    existingResult.contacts
      .filter((c) => c.email)
      .map((c) => [(c.email as string).toLowerCase(), c])
  );

  const companiesWithPrimary = new Set<string>();
  for (const c of existingResult.contacts) {
    if (c.primaryContact && c.companyId) {
      companiesWithPrimary.add(c.companyId as string);
    }
  }

  const newContacts: { id: string; company: string; name: string; position: string; location: string; email: string }[] = [];

  for (const contact of contacts) {
    if (!contact.email || !contact.name) continue;
    const emailLower = contact.email.toLowerCase();
    if (userEmail && emailLower === userEmail.toLowerCase()) continue;
    if (emailLower.includes("no-reply") || emailLower.includes("noreply")) continue;
    const existing = existingByEmail.get(emailLower);
    const company = contact.company || fallbackCompany || "";

    if (existing) {
      const updates: Record<string, string> = {};
      if (contact.position && !existing.position) updates.position = contact.position;
      if (Object.keys(updates).length > 0) {
        await db.transact(db.tx.contacts[existing.id].update(updates));
      }
    } else {
      const contactId = instantId();

      let companyId = "";
      if (company) {
        try {
          const companyRecord = await findOrCreateCompany(userId, { name: company });
          companyId = companyRecord.id;
        } catch { /* best-effort */ }
      }

      const isPrimary = companyId && !companiesWithPrimary.has(companyId);
      if (isPrimary) companiesWithPrimary.add(companyId);

      await db.transact(
        db.tx.contacts[contactId].update({
          userId,
          companyId,
          name: contact.name,
          position: contact.position || "",
          location: "",
          email: contact.email,
          primaryContact: isPrimary || false,
        })
      );
      newContacts.push({
        id: contactId,
        company,
        name: contact.name,
        position: contact.position || "",
        location: "",
        email: contact.email,
      });
      existingByEmail.set(emailLower, { id: contactId, email: contact.email, name: contact.name, companyId, position: contact.position } as typeof existingResult.contacts[0]);
    }
  }

  if (newContacts.length > 0) {
    try {
      await upsertContacts(newContacts);
    } catch (e) {
      console.error("[Contact] Pinecone contact upsert failed:", e);
    }
  }
}
