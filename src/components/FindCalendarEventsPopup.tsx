"use client";

import { useState, useEffect, useRef } from "react";

interface FindCalendarEventsPopupProps {
  onClose: () => void;
  defaultStartDate: string;
  defaultEndDate: string;
  userId: string;
}

function toDatetimeLocal(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.includes("T") ? value.slice(0, 16) : value + "T00:00";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocal(): string {
  return toDatetimeLocal(new Date().toISOString());
}

export default function FindCalendarEventsPopup({
  onClose,
  defaultStartDate,
  defaultEndDate,
  userId,
}: FindCalendarEventsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState(() => toDatetimeLocal(defaultStartDate));
  const [endDate, setEndDate] = useState(nowLocal);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    total?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    newContacts?: number;
    error?: string;
    count?: number;
  } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !scanning) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, scanning]);

  const handleScan = async () => {
    const token = localStorage.getItem("google_calendar_token");
    if (!token) {
      setResult({ error: "Calendar not authorized. Please connect your Google Calendar in Settings." });
      return;
    }

    setScanning(true);
    setResult(null);
    try {
      const res = await fetch("/api/calendar/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          "x-google-token": token,
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      const json = await res.json();

      if (res.status === 401 && json.error?.includes("expired")) {
        localStorage.removeItem("google_calendar_token");
        setResult({ error: "Calendar token expired. Please re-authorize in Settings." });
      } else {
        setResult(json);
      }
    } catch (err) {
      setResult({ error: `Network error: ${err}` });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={popupRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Sync Calendar Events</h2>
          </div>
          <button
            onClick={onClose}
            disabled={scanning}
            className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Scan your Google Calendar for recruiting-related events. Events will
            be matched to companies based on attendee emails in your contacts.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">From</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={scanning}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">To</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={scanning}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50"
              />
            </div>
          </div>

          <button
            onClick={handleScan}
            disabled={scanning || !startDate || !endDate}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
          >
            {scanning ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Scanning Calendar...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Sync Events
              </>
            )}
          </button>

          {result && (
            <div
              className={`rounded-lg p-3 text-xs ${
                result.error
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {result.error ? (
                <p>{result.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">Scan complete!</p>
                  <p>Found {result.total} events</p>
                  <p>{result.created} new events added, {result.updated} updated, {result.skipped} skipped (not recruiting-related)</p>
                  {result.newContacts ? (
                    <p>{result.newContacts} new contacts discovered</p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            disabled={scanning}
            className="text-xs px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
          >
            {result?.success ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
