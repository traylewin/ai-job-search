import { NextResponse } from "next/server";
import { db } from "@/lib/db/instant-admin";
import { id as instantId } from "@instantdb/admin";

export const maxDuration = 60;

const EVENT_LIMIT = 200;

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  status?: string;
  htmlLink?: string;
}

function buildCalendarEventLink(eventId: string, calendarId: string): string {
  const raw = `${eventId} ${calendarId}`;
  const eid = Buffer.from(raw).toString("base64");
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}

function classifyEventType(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("phone screen") || text.includes("phonescreen")) return "phone_screen";
  if (text.includes("onsite") || text.includes("on-site") || text.includes("final round")) return "onsite";
  if (text.includes("technical") && text.includes("interview")) return "technical_interview";
  if (text.includes("interview") || text.includes("hiring")) return "interview";
  if (text.includes("coffee") || text.includes("lunch") || text.includes("meet")) return "chat";
  if (text.includes("info session") || text.includes("webinar")) return "info_session";
  return "other";
}

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  const googleToken = req.headers.get("x-google-token");

  if (!userId) {
    return NextResponse.json({ error: "Missing x-user-id" }, { status: 401 });
  }
  if (!googleToken) {
    return NextResponse.json({ error: "Missing Google Calendar access token" }, { status: 401 });
  }

  let body: { startDate: string; endDate: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { startDate, endDate } = body;
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

  try {
    // Fetch events from Google Calendar
    const timeMin = new Date(startDate).toISOString();
    const timeMax = new Date(endDate + "T23:59:59").toISOString();

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(EVENT_LIMIT + 1));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const gcalRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${googleToken}` },
    });

    if (!gcalRes.ok) {
      const err = await gcalRes.text();
      if (gcalRes.status === 401) {
        return NextResponse.json({ error: "Calendar token expired. Please re-authorize." }, { status: 401 });
      }
      return NextResponse.json({ error: `Google Calendar API error: ${err}` }, { status: gcalRes.status });
    }

    const gcalData = await gcalRes.json();
    const items: GoogleEvent[] = gcalData.items || [];

    if (items.length > EVENT_LIMIT) {
      return NextResponse.json({
        error: `Found more than ${EVENT_LIMIT} events. Please narrow the date range.`,
        count: items.length,
      }, { status: 400 });
    }

    // Load job postings to get the set of known companies
    const jobsResult = await db.query({
      jobPostings: { $: { where: { userId } } },
    });
    const knownCompaniesLower = new Map<string, string>(); // lowercase -> canonical name
    for (const j of jobsResult.jobPostings) {
      const c = (j.company as string) || "";
      if (c) knownCompaniesLower.set(c.toLowerCase(), c);
    }

    // Load all contacts and build domain -> company lookup
    // (domain is the part after '@')
    const contactsResult = await db.query({
      contacts: { $: { where: { userId } } },
    });
    const GENERIC_DOMAINS = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
      "icloud.com", "mail.com", "protonmail.com", "live.com", "msn.com",
      "me.com", "mac.com", "googlemail.com", "ymail.com",
    ]);
    const contactDomainToCompany = new Map<string, string>();
    const contactByEmail = new Map<string, { company: string; name: string }>();
    for (const c of contactsResult.contacts) {
      if (!c.email) continue;
      const emailLower = (c.email as string).toLowerCase();
      const domain = emailLower.split("@")[1];
      const cc = (c.company || "").toLowerCase();
      const canonical = cc ? knownCompaniesLower.get(cc) : undefined;
      if (canonical) {
        contactByEmail.set(emailLower, { company: canonical, name: c.name || "" });
        if (domain && !GENERIC_DOMAINS.has(domain)) {
          contactDomainToCompany.set(domain, canonical);
        }
      }
    }

    // Build word-boundary regex for each known company (for title matching)
    const companyRegexes: { company: string; regex: RegExp }[] = [];
    for (const [lower, canonical] of knownCompaniesLower) {
      const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      companyRegexes.push({ company: canonical, regex: new RegExp(`\\b${escaped}\\b`, "i") });
    }

    // Load existing calendar events to avoid duplicates
    const existingResult = await db.query({
      calendarEvents: { $: { where: { userId } } },
    });
    const existingByGoogleId = new Set(
      existingResult.calendarEvents.map((e) => e.googleEventId)
    );

    // Load user's email to exclude self from attendees and domain matching
    let userEmail: string | undefined;
    try {
      const userResult = await db.query({
        $users: { $: { where: { id: userId } } },
      });
      userEmail = userResult.$users?.[0]?.email?.toLowerCase();
    } catch { /* admin query may fail for guest-mode db */ }

    const calendarId = userEmail || "primary";

    if (userEmail) {
      const userDomain = userEmail.split("@")[1];
      if (userDomain) GENERIC_DOMAINS.add(userDomain);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const newContacts: { id: string; company: string; name: string; email: string }[] = [];

    for (const event of items) {
      if (!event.id || !event.summary) {
        skipped++;
        continue;
      }

      const startTime = event.start?.dateTime || event.start?.date || "";
      const endTime = event.end?.dateTime || event.end?.date || "";
      if (!startTime) {
        skipped++;
        continue;
      }

      // Collect attendees (excluding self and no-reply)
      const attendees: { name: string; email: string }[] = [];
      const eventDomains: string[] = [];

      for (const a of event.attendees || []) {
        if (!a.email) continue;
        const emailLower = a.email.toLowerCase();
        if (userEmail && emailLower === userEmail) continue;
        if (emailLower.includes("no-reply") || emailLower.includes("noreply")) continue;

        const contact = contactByEmail.get(emailLower);
        attendees.push({
          name: a.displayName || contact?.name || a.email.split("@")[0],
          email: a.email,
        });
        const domain = emailLower.split("@")[1];
        if (domain) eventDomains.push(domain);
      }

      // --- Match rules (in priority order) ---
      let company = "";

      // Rule 1: An attendee's email domain exactly matches a contact's email domain
      if (!company) {
        for (const domain of eventDomains) {
          if (contactDomainToCompany.has(domain)) {
            company = contactDomainToCompany.get(domain)!;
            break;
          }
        }
      }

      // Rule 2: A full word in the event title matches a company name
      if (!company) {
        const title = event.summary || "";
        for (const { company: canonical, regex } of companyRegexes) {
          if (regex.test(title)) {
            company = canonical;
            break;
          }
        }
      }

      // Rule 3: An attendee's email domain includes a company name
      if (!company) {
        for (const domain of eventDomains) {
          for (const [lower, canonical] of knownCompaniesLower) {
            if (domain.includes(lower)) {
              company = canonical;
              break;
            }
          }
          if (company) break;
        }
      }

      // Only save events associated with a known job posting company
      if (!company) {
        skipped++;
        continue;
      }

      const eventType = classifyEventType(event.summary || "", event.description || "");

      const isExisting = existingByGoogleId.has(event.id);

      if (isExisting) {
        // Update existing
        const existing = existingResult.calendarEvents.find((e) => e.googleEventId === event.id);
        if (existing) {
          await db.transact(
            db.tx.calendarEvents[existing.id].update({
              title: event.summary || "",
              description: (event.description || "").slice(0, 5000),
              startTime,
              endTime,
              location: event.location || "",
              attendees,
              googleCalendarLink: buildCalendarEventLink(event.id, calendarId),
              status: event.status || "confirmed",
              eventType,
              company,
            })
          );
          updated++;
        }
      } else {
        // Create new
        const eventId = instantId();
        await db.transact(
          db.tx.calendarEvents[eventId].update({
            userId,
            googleEventId: event.id,
            company,
            title: event.summary || "",
            description: (event.description || "").slice(0, 5000),
            startTime,
            endTime,
            location: event.location || "",
            attendees,
            googleCalendarLink: buildCalendarEventLink(event.id, calendarId),
            status: event.status || "confirmed",
            eventType,
          })
        );
        created++;

        // Add unknown attendees as contacts
        if (company) {
          for (const a of attendees) {
            const emailLower = a.email.toLowerCase();
            if (!contactByEmail.has(emailLower)) {
              const contactId = instantId();
              await db.transact(
                db.tx.contacts[contactId].update({
                  userId,
                  company,
                  name: a.name,
                  position: "",
                  location: "",
                  email: a.email,
                  primaryContact: false,
                })
              );
              contactByEmail.set(emailLower, { company, name: a.name });
              newContacts.push({ id: contactId, company, name: a.name, email: a.email });
            }
          }
        }
      }
    }

    // Update calendarLastSyncDate
    const settingsResult = await db.query({
      userSettings: { $: { where: { userId } } },
    });
    const existingSettings = settingsResult.userSettings[0];
    const settingsId = existingSettings?.id || instantId();
    await db.transact(
      db.tx.userSettings[settingsId].update({
        userId,
        calendarLastSyncDate: new Date().toISOString(),
      })
    );

    // Update tracker entries with last event per company
    if (created > 0 || updated > 0) {
      const allEventsResult = await db.query({
        calendarEvents: { $: { where: { userId } } },
      });
      const lastEventByCompany = new Map<string, { id: string; title: string; startTime: string }>();
      for (const ev of allEventsResult.calendarEvents) {
        if (!ev.company) continue;
        const key = (ev.company as string).toLowerCase();
        const existing = lastEventByCompany.get(key);
        if (!existing || new Date(ev.startTime as string) > new Date(existing.startTime)) {
          lastEventByCompany.set(key, {
            id: ev.id,
            title: ev.title as string,
            startTime: ev.startTime as string,
          });
        }
      }

      const trackerResult = await db.query({
        trackerEntries: { $: { where: { userId } } },
      });
      const txns = [];
      for (const entry of trackerResult.trackerEntries) {
        const key = (entry.company as string).toLowerCase();
        const lastEv = lastEventByCompany.get(key);
        if (!lastEv) continue;
        const currentDate = entry.lastEventDate as string | undefined;
        if (!currentDate || new Date(lastEv.startTime) > new Date(currentDate)) {
          txns.push(
            db.tx.trackerEntries[entry.id].update({
              lastEventId: lastEv.id,
              lastEventTitle: lastEv.title,
              lastEventDate: lastEv.startTime,
            })
          );
        }
      }
      if (txns.length > 0) {
        await db.transact(txns);
      }
    }

    return NextResponse.json({
      success: true,
      total: items.length,
      created,
      updated,
      skipped,
      newContacts: newContacts.length,
    });
  } catch (error) {
    console.error("[CalendarScan] Error:", error);
    return NextResponse.json({ error: `Calendar scan failed: ${error}` }, { status: 500 });
  }
}
