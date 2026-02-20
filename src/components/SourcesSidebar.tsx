"use client";

import { useState } from "react";

interface JobPostingSummary {
  id: string;
  filename: string;
  company: string | null;
  title: string | null;
  parseConfidence: string;
  status?: string;
}

interface ThreadSummary {
  threadId: string;
  subject: string;
  company: string | null;
  type: string;
  messageCount: number;
}

interface CalendarEventSummary {
  id: string;
  googleEventId: string;
  title: string;
  company: string | null;
  startTime: string;
  eventType: string;
}

interface SourcesSidebarProps {
  jobPostings: JobPostingSummary[];
  threads: ThreadSummary[];
  calendarEvents?: CalendarEventSummary[];
  resumeName?: string | null;
  onSelectSource: (type: string, id: string) => void;
  onAddContent?: (contentType?: "job" | "email") => void;
  onDeleteJob?: (job: JobPostingSummary) => void;
  onDeleteThread?: (thread: ThreadSummary) => void;
  onDeleteEvent?: (event: CalendarEventSummary) => void;
  onRefreshCalendar?: () => Promise<void>;
  calendarConnected?: boolean;
  onConnectCalendar?: () => void;
  calendarSyncing?: boolean;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 mr-1.5 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors = {
    full: "bg-green-100 text-green-600",
    partial: "bg-amber-100 text-amber-600",
    "text-only": "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`text-[9px] px-1 py-0.5 rounded font-medium ${
        colors[confidence as keyof typeof colors] || "bg-gray-100 text-gray-500"
      }`}
    >
      {confidence}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    interview: { label: "Interview", color: "bg-violet-100 text-violet-600" },
    phone_screen: { label: "Phone", color: "bg-blue-100 text-blue-600" },
    technical_interview: { label: "Technical", color: "bg-indigo-100 text-indigo-600" },
    onsite: { label: "Onsite", color: "bg-purple-100 text-purple-600" },
    chat: { label: "Chat", color: "bg-amber-100 text-amber-600" },
    info_session: { label: "Info", color: "bg-teal-100 text-teal-600" },
  };
  const info = labels[type] || { label: type, color: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

function EventRow({
  event,
  onSelectSource,
  onDeleteEvent,
}: {
  event: CalendarEventSummary;
  onSelectSource: (type: string, id: string) => void;
  onDeleteEvent?: (event: CalendarEventSummary) => void;
}) {
  return (
    <div className="group flex items-center px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-violet-50 transition">
      <button
        onClick={() => onSelectSource("event", event.id)}
        className="flex items-center flex-1 min-w-0 text-left"
      >
        <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center mr-2 shrink-0">
          <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-700 truncate text-xs">
            {event.company || event.title}
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            {new Date(event.startTime).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      </button>
      <EventTypeBadge type={event.eventType} />
      {onDeleteEvent && (
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteEvent(event); }}
          className="ml-1 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition shrink-0"
          title="Delete event"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function bucketEvents(events: CalendarEventSummary[], now: number) {
  const sevenDaysAgo = now - 7 * 86400000;

  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const older: CalendarEventSummary[] = [];
  const recent: CalendarEventSummary[] = [];
  const upcoming: CalendarEventSummary[] = [];

  for (const e of sorted) {
    const t = new Date(e.startTime).getTime();
    if (t > now) {
      upcoming.push(e);
    } else if (t >= sevenDaysAgo) {
      recent.push(e);
    } else {
      older.push(e);
    }
  }

  return { older, recent, upcoming };
}

function EventsList({
  events,
  q,
  onSelectSource,
  onDeleteEvent,
  openSections,
  toggle,
  now,
}: {
  events: CalendarEventSummary[];
  q: string;
  onSelectSource: (type: string, id: string) => void;
  onDeleteEvent?: (event: CalendarEventSummary) => void;
  openSections: Record<string, boolean>;
  toggle: (section: string) => void;
  now: number;
}) {
  const { older, recent, upcoming } = bucketEvents(events, now);

  if (events.length === 0) {
    return (
      <div className="ml-1">
        <p className="px-2.5 py-2 text-[11px] text-gray-400 italic">
          {q ? "No matches" : "No events synced"}
        </p>
      </div>
    );
  }

  return (
    <div className="ml-1 space-y-0.5">
      {/* Older */}
      {older.length > 0 && (
        <div>
          <button
            onClick={() => toggle("events_older")}
            className="flex items-center w-full px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 transition"
          >
            <ChevronIcon open={openSections.events_older} />
            <span>Older</span>
            <span className="ml-auto text-gray-300 font-normal">{older.length}</span>
          </button>
          {openSections.events_older && (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {older.map((e) => (
                <EventRow key={e.id} event={e} onSelectSource={onSelectSource} onDeleteEvent={onDeleteEvent} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent (past 7 days) — displayed inline, no collapsible header */}
      {recent.length > 0 && (
        <div className="space-y-0.5">
          {recent.map((e) => (
            <EventRow key={e.id} event={e} onSelectSource={onSelectSource} onDeleteEvent={onDeleteEvent} />
          ))}
        </div>
      )}

      {/* Upcoming (future events, sorted oldest first) */}
      {upcoming.length > 0 && (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {upcoming.map((e) => (
            <EventRow key={e.id} event={e} onSelectSource={onSelectSource} onDeleteEvent={onDeleteEvent} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SourcesSidebar({
  jobPostings,
  threads,
  calendarEvents = [],
  resumeName,
  onSelectSource,
  onAddContent,
  onDeleteJob,
  onDeleteThread,
  onDeleteEvent,
  onRefreshCalendar,
  calendarConnected,
  onConnectCalendar,
  calendarSyncing,
}: SourcesSidebarProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true,
    jobs: true,
    emails: false,
    events: false,
    events_older: false,
    events_recent: true,
    notes: true,
  });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [now] = useState(() => Date.now());

  const toggle = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const q = search.toLowerCase().trim();

  const INACTIVE_STATUSES = new Set(["rejected", "withdrew"]);

  const activeCompanies = new Set(
    jobPostings
      .filter((j) => !INACTIVE_STATUSES.has(j.status || "interested"))
      .map((j) => (j.company || "").toLowerCase())
      .filter(Boolean)
  );

  const filteredJobs = (() => {
    let jobs = jobPostings;
    if (!showInactive) {
      jobs = jobs.filter((j) => !INACTIVE_STATUSES.has(j.status || "interested"));
    }
    if (q) {
      jobs = jobs.filter(
        (j) =>
          (j.company || "").toLowerCase().includes(q) ||
          (j.title || "").toLowerCase().includes(q) ||
          j.filename.toLowerCase().includes(q)
      );
    }
    return jobs;
  })();

  const filteredThreads = (() => {
    let result = threads;
    if (!showInactive) {
      result = result.filter((t) => {
        const c = (t.company || "").toLowerCase();
        return !c || activeCompanies.has(c);
      });
    }
    if (q) {
      result = result.filter(
        (t) =>
          (t.company || "").toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }
    return result;
  })();

  const filteredEvents = (() => {
    let result = calendarEvents;
    if (!showInactive) {
      result = result.filter((e) => {
        const c = (e.company || "").toLowerCase();
        return !c || activeCompanies.has(c);
      });
    }
    if (q) {
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.company || "").toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q)
      );
    }
    return result;
  })();

  const showNotes = !q || "job search notes".includes(q) || "preferences".includes(q);

  return (
    <aside className="w-72 h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-base">Sources</h2>
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`text-[10px] font-medium px-2 py-1 rounded-md transition border ${
            showInactive
              ? "bg-violet-50 text-violet-600 border-violet-300"
              : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
          }`}
          title={showInactive ? "Click to hide inactive" : "Click to show all"}
        >
          {showInactive ? "Showing All" : "Showing Active Only"}
        </button>
      </div>

      {/* Search field */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter sources..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition placeholder:text-gray-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Profile */}
        <div>
          <button
            onClick={() => toggle("profile")}
            className="flex items-center w-full px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
          >
            <ChevronIcon open={openSections.profile} />
            Profile
          </button>
          {openSections.profile && (
            <div className="space-y-0.5 ml-1">
              <button
                onClick={() => onSelectSource("resume", "resume")}
                className="flex items-center px-2.5 py-2 rounded-lg cursor-pointer hover:bg-orange-50 transition w-full text-left"
              >
                <div className="w-7 h-7 rounded-md bg-orange-100 flex items-center justify-center mr-2.5 flex-shrink-0">
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate text-[13px]">{resumeName ? `${resumeName}'s Resume` : "Resume"}</p>
                  <p className="text-xs text-gray-400">Plain text</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Job Postings */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => toggle("jobs")}
              className="flex items-center flex-1 px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
            >
              <ChevronIcon open={openSections.jobs} />
              Job Postings
              <span className="ml-auto text-gray-300 font-normal normal-case tracking-normal">
                {q ? `${filteredJobs.length}/` : ""}{jobPostings.length}
              </span>
            </button>
            {onAddContent && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddContent("job"); }}
                className="mr-2 px-1.5 py-0.5 text-[10px] font-medium text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition flex items-center gap-0.5"
                title="Add job posting"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            )}
          </div>
          {(openSections.jobs || !!q) && (
            <div className="space-y-0.5 ml-1 max-h-64 overflow-y-auto">
              {filteredJobs.length === 0 && q && (
                <p className="px-2.5 py-2 text-[11px] text-gray-400 italic">No matches</p>
              )}
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="group flex items-center px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 transition"
                >
                  <button
                    onClick={() => onSelectSource("job", job.filename)}
                    className="flex items-center flex-1 min-w-0 text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center mr-2 shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-700 truncate text-xs">
                        {job.company || job.filename.replace(".html", "")}
                      </p>
                      {job.title && (
                        <p className="text-[11px] text-gray-400 truncate">{job.title}</p>
                      )}
                    </div>
                  </button>
                  {/* <ConfidenceBadge confidence={job.parseConfidence} /> */}
                  {onDeleteJob && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteJob(job); }}
                      className="ml-1 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition shrink-0"
                      title="Delete job posting"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Threads */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => toggle("emails")}
              className="flex items-center flex-1 px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
            >
              <ChevronIcon open={openSections.emails} />
              Email Threads
              <span className="ml-auto text-gray-300 font-normal normal-case tracking-normal">
                {q ? `${filteredThreads.length}/` : ""}{threads.length}
              </span>
            </button>
            {onAddContent && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddContent("email"); }}
                className="mr-2 px-1.5 py-0.5 text-[10px] font-medium text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition flex items-center gap-0.5"
                title="Add email"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            )}
          </div>
          {(openSections.emails || !!q) && (
            <div className="space-y-0.5 ml-1 max-h-64 overflow-y-auto">
              {filteredThreads.length === 0 && q && (
                <p className="px-2.5 py-2 text-[11px] text-gray-400 italic">No matches</p>
              )}
              {filteredThreads.map((thread) => (
                <div
                  key={thread.threadId}
                  className="group flex items-center px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-emerald-50 transition"
                >
                  <button
                    onClick={() => onSelectSource("thread", thread.threadId)}
                    className="flex items-center flex-1 min-w-0 text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center mr-2 shrink-0">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-700 truncate text-xs">
                        {thread.company || thread.subject}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {thread.messageCount} messages · {thread.type}
                      </p>
                    </div>
                  </button>
                  {onDeleteThread && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteThread(thread); }}
                      className="ml-1 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition shrink-0"
                      title="Delete email thread"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calendar Events */}
        <div>
          <div className="flex items-center">
            <button
              onClick={() => toggle("events")}
              className="flex items-center flex-1 px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
            >
              <ChevronIcon open={openSections.events} />
              Events
              <span className="ml-auto text-gray-300 font-normal normal-case tracking-normal">
                {q ? `${filteredEvents.length}/` : ""}{calendarEvents.length}
              </span>
            </button>
            {onRefreshCalendar && calendarConnected && (
              <button
                onClick={(e) => { e.stopPropagation(); onRefreshCalendar(); }}
                disabled={calendarSyncing}
                className="mr-2 p-1 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded transition disabled:opacity-50"
                title="Sync calendar events"
              >
                <svg className={`w-3 h-3 ${calendarSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </button>
            )}
          </div>
          {(openSections.events || !!q) && (
            <>
              {!calendarConnected && onConnectCalendar && (
                <button
                  onClick={onConnectCalendar}
                  className="flex items-center gap-2 mx-2 mb-1 px-3 py-2 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition w-[calc(100%-16px)]"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Connect Google Calendar
                </button>
              )}
              {calendarConnected && onRefreshCalendar && (
                <button
                  onClick={onRefreshCalendar}
                  disabled={calendarSyncing}
                  className="flex items-center gap-2 mx-2 mb-1 px-3 py-2 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition w-[calc(100%-16px)] disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 shrink-0 ${calendarSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  {calendarSyncing ? "Syncing..." : "Sync Calendar"}
                </button>
              )}
              <EventsList
                events={filteredEvents}
                q={q}
                onSelectSource={onSelectSource}
                onDeleteEvent={onDeleteEvent}
                openSections={openSections}
                toggle={toggle}
                now={now}
              />
            </>
          )}
        </div>

        {/* Notes */}
        {showNotes && (
          <div>
            <button
              onClick={() => toggle("notes")}
              className="flex items-center w-full px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition"
            >
              <ChevronIcon open={openSections.notes} />
              Notes
            </button>
            {openSections.notes && (
              <div className="space-y-0.5 ml-1">
                <button
                  onClick={() => onSelectSource("notes", "notes")}
                  className="flex items-center px-2.5 py-2 rounded-lg cursor-pointer hover:bg-amber-50 transition w-full text-left"
                >
                  <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center mr-2.5 flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate text-[13px]">Job Search Notes</p>
                    <p className="text-xs text-gray-400">Preferences & notes</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
