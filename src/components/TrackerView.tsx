"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useActions } from "@/hooks/useInstantData";

interface TrackerRow {
  id: string;
  jobPostingId: string;
  company: string;
  role: string;
  status: string;
  dateApplied: string;
  salaryRange: string;
  location: string;
  recruiter: string;
  notes: string;
  lastEventId?: string;
  lastEventTitle?: string;
  lastEventDate?: string;
}

interface CalendarEventSummary {
  id: string;
  company?: string;
  title: string;
  startTime: string;
}

interface TrackerViewProps {
  entries: TrackerRow[];
  calendarEvents?: CalendarEventSummary[];
  onFocusCompany: (company: string) => void;
  onSelectEvent?: (eventId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  offer: "bg-green-100 text-green-700",
  applied: "bg-blue-100 text-blue-700",
  interviewing: "bg-orange-100 text-orange-700",
  waiting: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  withdrew: "bg-gray-100 text-gray-500",
  interested: "bg-cyan-100 text-cyan-700",
  recruiter_contact: "bg-teal-100 text-teal-700",
  unknown: "bg-gray-100 text-gray-500",
};

type QuickFilter = "all" | "active" | "offer" | "interviewing" | "applied" | "interested";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "applied", label: "Applied" },
  { key: "interested", label: "Interested" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offers" },
];

const INACTIVE_STATUSES = new Set(["rejected", "withdrew"]);

function ResizableTh({
  width,
  col,
  onResizeStart,
  onClick,
  sortable,
  className = "",
  children,
}: {
  width: number;
  col: ColKey;
  onResizeStart: (col: ColKey, e: React.MouseEvent) => void;
  onClick?: () => void;
  sortable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`px-3 py-2 relative overflow-hidden whitespace-nowrap ${sortable ? "cursor-pointer hover:text-gray-700" : ""} ${className}`}
      style={{ width, minWidth: width, maxWidth: width }}
      onClick={onClick}
    >
      <span className="truncate block pr-2">{children}</span>
      <div
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-10 group/handle"
        onMouseDown={(e) => onResizeStart(col, e)}
      >
        <div className="w-px h-full mx-auto bg-transparent group-hover/handle:bg-blue-400 transition-colors" />
      </div>
    </th>
  );
}

const STORAGE_KEY = "tracker_col_widths";
const COLUMN_KEYS = ["company", "role", "status", "applied", "lastEvent", "salary", "location", "notes"] as const;
type ColKey = (typeof COLUMN_KEYS)[number];
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  company: 140,
  role: 180,
  status: 130,
  applied: 90,
  lastEvent: 160,
  salary: 110,
  location: 130,
  notes: 150,
};

function loadWidths(): Record<ColKey, number> {
  if (typeof window === "undefined") return { ...DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_WIDTHS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_WIDTHS };
}

function saveWidths(widths: Record<ColKey, number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
}

export default function TrackerView({ entries, calendarEvents = [], onFocusCompany, onSelectEvent }: TrackerViewProps) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("active");
  const [sortField, setSortField] = useState<keyof TrackerRow>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [focusedCompany, setFocusedCompany] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const actions = useActions();

  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  useEffect(() => { setColWidths(loadWidths()); }, []);

  const resizeRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);

  const onResizeStart = useCallback((col: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[col];
    resizeRef.current = { col, startX, startW };

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newW = Math.max(50, startW + delta);
      setColWidths((prev) => ({ ...prev, [col]: newW }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setColWidths((prev) => { saveWidths(prev); return prev; });
      resizeRef.current = null;
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);

  const lastEventByCompany = useMemo(() => {
    const map = new Map<string, CalendarEventSummary>();
    for (const ev of calendarEvents) {
      if (!ev.company) continue;
      const key = ev.company.toLowerCase();
      const existing = map.get(key);
      if (!existing || new Date(ev.startTime) > new Date(existing.startTime)) {
        map.set(key, ev);
      }
    }
    return map;
  }, [calendarEvents]);

  const handleFocus = (company: string) => {
    setFocusedCompany((prev) => (prev === company ? null : company));
    onFocusCompany(company);
  };

  const filtered = useMemo(() => {
    let result = [...entries];

    // Quick filter
    if (quickFilter === "active") {
      result = result.filter((e) => !INACTIVE_STATUSES.has(e.status));
    } else if (quickFilter !== "all") {
      result = result.filter((e) => e.status === quickFilter);
    }

    // Text search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.company.toLowerCase().includes(lower) ||
          e.role.toLowerCase().includes(lower) ||
          e.status.toLowerCase().includes(lower) ||
          e.location.toLowerCase().includes(lower)
      );
    }
    result.sort((a, b) => {
      // Focused company always sorts to the top
      if (focusedCompany) {
        const aFocused = a.company === focusedCompany ? 1 : 0;
        const bFocused = b.company === focusedCompany ? 1 : 0;
        if (aFocused !== bFocused) return bFocused - aFocused;
      }
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
    return result;
  }, [entries, search, quickFilter, sortField, sortDir, focusedCompany]);

  const toggleSort = (field: keyof TrackerRow) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleSaveNote = (entry: TrackerRow) => {
    if (entry.jobPostingId) {
      actions.updateJobPosting(entry.jobPostingId, { notes: noteValue });
    }
    setEditingNote(null);
    setNoteValue("");
  };

  const sortIcon = (field: keyof TrackerRow) => (
    <svg
      className={`w-3 h-3 ml-1 inline transition ${
        sortField === field ? "text-blue-600" : "text-gray-300"
      } ${sortField === field && sortDir === "desc" ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="px-3 sm:px-5 py-3 border-b border-gray-100 shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <svg
              className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies, roles, status..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            />
          </div>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="px-3 sm:px-5 pt-2 pb-1 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_FILTERS.map((f) => {
            const isActive = quickFilter === f.key;
            const count =
              f.key === "all"
                ? entries.length
                : f.key === "active"
                ? entries.filter((e) => !INACTIVE_STATUSES.has(e.status)).length
                : entries.filter((e) => e.status === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setQuickFilter(f.key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition border whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${isActive ? "text-blue-400" : "text-gray-300"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-3 sm:px-5 py-3">
        <div className="max-w-5xl mx-auto overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-1 py-2" style={{ width: 32, minWidth: 32, maxWidth: 32 }} />
                <ResizableTh width={colWidths.company} col="company" onResizeStart={onResizeStart} onClick={() => toggleSort("company")} sortable>
                  Company {sortIcon("company")}
                </ResizableTh>
                <ResizableTh width={colWidths.role} col="role" onResizeStart={onResizeStart}>
                  Role
                </ResizableTh>
                <ResizableTh width={colWidths.status} col="status" onResizeStart={onResizeStart} onClick={() => toggleSort("status")} sortable>
                  Status {sortIcon("status")}
                </ResizableTh>
                <ResizableTh width={colWidths.applied} col="applied" onResizeStart={onResizeStart}>
                  Applied
                </ResizableTh>
                <ResizableTh width={colWidths.lastEvent} col="lastEvent" onResizeStart={onResizeStart} className="hidden md:table-cell">
                  Last Event
                </ResizableTh>
                <ResizableTh width={colWidths.salary} col="salary" onResizeStart={onResizeStart} className="hidden md:table-cell">
                  Salary
                </ResizableTh>
                <ResizableTh width={colWidths.location} col="location" onResizeStart={onResizeStart} className="hidden lg:table-cell">
                  Location
                </ResizableTh>
                <ResizableTh width={colWidths.notes} col="notes" onResizeStart={onResizeStart} className="hidden md:table-cell">
                  Notes
                </ResizableTh>
                <th className="px-1 py-2" style={{ width: 32, minWidth: 32, maxWidth: 32 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => {
                const isFocused = focusedCompany === entry.company;
                return (
                <tr
                  key={entry.id || i}
                  className={`group border-t border-gray-50 transition ${
                    isFocused
                      ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200"
                      : i % 2 === 0
                      ? "hover:bg-blue-50/30"
                      : "bg-gray-50/50 hover:bg-blue-50/30"
                  }`}
                >
                  <td className="px-1 py-2.5 w-8">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFocus(entry.company);
                      }}
                      className={`${
                        isFocused
                          ? "opacity-100 bg-blue-100 text-blue-700"
                          : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-blue-500 hover:bg-blue-100 hover:text-blue-700"
                      } transition-opacity w-6 h-6 rounded-md flex items-center justify-center`}
                      title={`Chat about ${entry.company}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800 truncate overflow-hidden">
                    {entry.company}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 truncate overflow-hidden">
                    {entry.role}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`block w-28 text-center px-2 py-1 rounded-lg text-xs font-medium truncate ${
                        STATUS_COLORS[entry.status] || STATUS_COLORS.unknown
                      }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                    {entry.dateApplied || "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 text-xs hidden md:table-cell overflow-hidden">
                    {(() => {
                      const fromCal = lastEventByCompany.get(entry.company.toLowerCase());
                      const fromEntry = entry.lastEventId
                        ? { id: entry.lastEventId, title: entry.lastEventTitle || "", startTime: entry.lastEventDate || "" }
                        : null;
                      // Pick whichever is more recent
                      let lastEv = fromCal || fromEntry;
                      if (fromCal && fromEntry) {
                        lastEv = new Date(fromCal.startTime) >= new Date(fromEntry.startTime) ? fromCal : fromEntry;
                      }
                      if (!lastEv) return <span className="text-gray-400">{"\u2014"}</span>;
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent?.(lastEv.id);
                          }}
                          className="text-left text-violet-600 hover:text-violet-800 hover:underline truncate block max-w-full"
                          title={`${lastEv.title}\n${new Date(lastEv.startTime).toLocaleString()}`}
                        >
                          <span className="truncate block">
                            {new Date(lastEv.startTime).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                            {" \u2013 "}
                            {lastEv.title}
                          </span>
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs hidden md:table-cell">
                    {entry.salaryRange || "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs truncate overflow-hidden hidden lg:table-cell">
                    {entry.location || "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs overflow-hidden hidden md:table-cell">
                    {editingNote === entry.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveNote(entry);
                            if (e.key === "Escape") setEditingNote(null);
                          }}
                          className="border border-blue-300 rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveNote(entry)}
                          className="text-blue-600 hover:text-blue-700 text-[10px] font-medium"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <span
                        className="truncate block cursor-pointer hover:text-blue-600"
                        onClick={() => {
                          setEditingNote(entry.id);
                          setNoteValue(entry.notes);
                        }}
                        title="Click to edit"
                      >
                        {entry.notes || "\u2014"}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2.5 w-8">
                    {confirmDeleteId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            actions.deleteTrackerEntry(entry.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] text-red-600 font-medium hover:text-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-gray-500 hover:text-gray-700"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(entry.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                        title="Delete entry"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No entries match your search.
            </div>
          )}
        </div>
      </div>

      {/* Summary footer */}
      <div className="px-3 sm:px-5 py-2 border-t border-gray-100 text-xs text-gray-400 shrink-0">
        <div className="max-w-5xl mx-auto flex gap-3 sm:gap-4 flex-wrap">
          <span>{filtered.length} entries</span>
          <span>
            {entries.filter((e) => e.status === "offer").length} offers
          </span>
          <span className="hidden sm:inline">
            {entries.filter((e) => e.status === "interviewing").length}{" "}
            interviewing
          </span>
          <span className="hidden sm:inline">
            {entries.filter((e) => e.status === "applied").length}{" "}
            applied
          </span>
          <span className="ml-auto text-gray-300 hidden sm:inline">
            Real-time via InstantDB
          </span>
        </div>
      </div>
    </div>
  );
}
