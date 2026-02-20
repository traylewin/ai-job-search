import { NextResponse } from "next/server";
import { db } from "@/lib/db/instant-admin";
import { id as instantId } from "@instantdb/admin";
import { classifyEventType, buildCalendarEventLink } from "@/lib/calendar";
import { updateJobStateFromEvents } from "@/lib/calendar/update-job-state";
import { buildCompanyMatcher, extractDomain } from "@/lib/company";

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
    const timeMin = new Date(startDate.includes("T") ? startDate : startDate + "T00:00:00").toISOString();
    const timeMax = new Date(endDate.includes("T") ? endDate : endDate + "T23:59:59").toISOString();

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

    // Load companies and contacts, build shared matcher
    const [companiesResult, contactsResult] = await Promise.all([
      db.query({ companies: { $: { where: { userId } } } }),
      db.query({ contacts: { $: { where: { userId } } } }),
    ]);

    const companyRecords = companiesResult.companies
      .filter((c) => c.name)
      .map((c) => ({ id: c.id, name: c.name as string, emailDomain: c.emailDomain as string | undefined }));

    const contactRecords = contactsResult.contacts
      .filter((c) => c.email)
      .map((c) => ({ email: c.email as string, companyId: c.companyId as string | undefined }));

    const contactByEmail = new Map<string, { company: string; name: string }>();
    for (const c of contactsResult.contacts) {
      if (!c.email) continue;
      const emailLower = (c.email as string).toLowerCase();
      const cId = c.companyId as string || "";
      const companyObj = cId ? companiesResult.companies.find((co) => co.id === cId) : undefined;
      const canonical = companyObj ? companyObj.name : undefined;
      if (canonical) {
        contactByEmail.set(emailLower, { company: canonical, name: c.name || "" });
      }
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
    const userDomain = userEmail ? extractDomain(userEmail) : undefined;

    const matcher = buildCompanyMatcher(companyRecords, contactRecords, userDomain);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const newContacts: { id: string; company: string; name: string; email: string }[] = [];
    const processedEvents: { id: string; companyId: string; title: string; description: string; startTime: string; eventType: string }[] = [];

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
        const domain = extractDomain(a.email);
        if (domain) eventDomains.push(domain);
      }

      // Match company via shared matcher (domains → title → text fallback)
      const domainMatch = matcher.matchDomains(eventDomains);
      const titleMatch = !domainMatch ? matcher.matchTitle(event.summary || "") : null;
      const match = domainMatch || titleMatch;

      if (!match) {
        skipped++;
        continue;
      }
      const company = match.companyName;

      const eventType = classifyEventType(event.summary || "", event.description || "");

      const isExisting = existingByGoogleId.has(event.id);
      const companyId = match.companyId;

      if (isExisting) {
        const existing = existingResult.calendarEvents.find((e) => e.googleEventId === event.id);
        if (existing) {
          await db.transact(
            db.tx.calendarEvents[existing.id].update({
              companyId,
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
          updated++;
          processedEvents.push({ id: existing.id, companyId, title: event.summary || "", description: (event.description || "").slice(0, 5000), startTime, eventType });
        }
      } else {
        const eventId = instantId();
        await db.transact(
          db.tx.calendarEvents[eventId].update({
            userId,
            googleEventId: event.id,
            companyId,
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
        processedEvents.push({ id: eventId, companyId, title: event.summary || "", description: (event.description || "").slice(0, 5000), startTime, eventType });

        // Add unknown attendees as contacts
        if (company) {
          for (const a of attendees) {
            const emailLower = a.email.toLowerCase();
            if (!contactByEmail.has(emailLower)) {
              const contactId = instantId();
              await db.transact(
                db.tx.contacts[contactId].update({
                  userId,
                  companyId,
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

    // Update tracker entries and job posting statuses from processed events
    if (processedEvents.length > 0) {
      await updateJobStateFromEvents(userId, processedEvents);
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
