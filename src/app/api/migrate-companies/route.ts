import { NextResponse } from "next/server";
import { db } from "@/lib/db/instant-admin";

export const maxDuration = 120;

/**
 * POST /api/migrate-companies
 * Enriches company records with emailDomain from their contacts.
 * The original company-string-to-companyId migration is no longer needed
 * since the company string field has been removed from all entities.
 */
export async function POST() {
  try {
    const companiesResult = await db.query({ companies: {} });
    const contactsResult = await db.query({ contacts: {} });

    const GENERIC = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
      "icloud.com", "protonmail.com", "live.com",
    ]);

    let enriched = 0;
    for (const company of companiesResult.companies) {
      if (company.emailDomain) continue;
      const matching = contactsResult.contacts.filter(
        (c) => c.companyId === company.id && c.email
      );
      for (const c of matching) {
        const domain = (c.email as string).split("@")[1]?.toLowerCase();
        if (domain && !GENERIC.has(domain)) {
          await db.transact(
            db.tx.companies[company.id].update({ emailDomain: domain })
          );
          enriched++;
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      companiesEnriched: enriched,
      totalCompanies: companiesResult.companies.length,
    });
  } catch (error) {
    console.error("[MigrateCompanies] Error:", error);
    return NextResponse.json(
      { error: `Migration failed: ${error}` },
      { status: 500 }
    );
  }
}
