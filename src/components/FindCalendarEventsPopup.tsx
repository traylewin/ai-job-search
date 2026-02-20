"use client";

import { useState, useEffect, useRef } from "react";

interface FindCalendarEventsPopupProps {
  onClose: () => void;
  defaultCalendarStart: string;
  defaultEmailStart: string;
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

type SyncResult = {
  success?: boolean;
  total?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  newContacts?: number;
  imported?: number;
  threads?: number;
  error?: string;
};

export default function FindCalendarEventsPopup({
  onClose,
  defaultCalendarStart,
  defaultEmailStart,
  defaultEndDate,
  userId,
}: FindCalendarEventsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  const [calStart, setCalStart] = useState(() => toDatetimeLocal(defaultCalendarStart));
  const [calEnd, setCalEnd] = useState(nowLocal);
  const [calScanning, setCalScanning] = useState(false);
  const [calResult, setCalResult] = useState<SyncResult | null>(null);

  const [emailStart, setEmailStart] = useState(() => toDatetimeLocal(defaultEmailStart));
  const [emailEnd, setEmailEnd] = useState(nowLocal);
  const [emailScanning, setEmailScanning] = useState(false);
  const [emailResult, setEmailResult] = useState<SyncResult | null>(null);

  const scanning = calScanning || emailScanning;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !scanning) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, scanning]);

  const handleCalendarSync = async () => {
    const token = localStorage.getItem("google_calendar_token");
    if (!token) {
      setCalResult({ error: "Not authorized. Please connect Google in Settings." });
      return;
    }
    setCalScanning(true);
    setCalResult(null);
    try {
      const res = await fetch("/api/calendar/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId, "x-google-token": token },
        body: JSON.stringify({ startDate: calStart, endDate: calEnd }),
      });
      const json = await res.json();
      if (res.status === 401 && json.error?.includes("expired")) {
        localStorage.removeItem("google_calendar_token");
        setCalResult({ error: "Token expired. Please re-authorize in Settings." });
      } else {
        setCalResult(json);
      }
    } catch (err) {
      setCalResult({ error: `Network error: ${err}` });
    } finally {
      setCalScanning(false);
    }
  };

  const handleEmailSync = async () => {
    const token = localStorage.getItem("google_calendar_token");
    if (!token) {
      setEmailResult({ error: "Not authorized. Please connect Google in Settings." });
      return;
    }
    setEmailScanning(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/email/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId, "x-google-token": token },
        body: JSON.stringify({ startDate: emailStart, endDate: emailEnd }),
      });
      const json = await res.json();
      if (res.status === 401 && json.error?.includes("expired")) {
        localStorage.removeItem("google_calendar_token");
        setEmailResult({ error: "Token expired. Please re-authorize in Settings." });
      } else {
        setEmailResult(json);
      }
    } catch (err) {
      setEmailResult({ error: `Network error: ${err}` });
    } finally {
      setEmailScanning(false);
    }
  };

  const renderResult = (result: SyncResult) => (
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
        <div className="space-y-0.5">
          <p className="font-medium">Sync complete!</p>
          {result.total !== undefined && <p>Found {result.total} events — {result.created} new, {result.updated} updated, {result.skipped} skipped</p>}
          {result.imported !== undefined && <p>Imported {result.imported} emails into {result.threads} threads</p>}
          {result.newContacts ? <p>{result.newContacts} new contacts discovered</p> : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={popupRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Sync Email and Calendar</h2>
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

        <div className="p-5 space-y-5">
          {/* Calendar Sync Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Calendar Events</h3>
            </div>
            <p className="text-xs text-gray-500">
              Scan Google Calendar for recruiting-related events matched to your companies.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">From</label>
                <input type="datetime-local" value={calStart} onChange={(e) => setCalStart(e.target.value)} disabled={calScanning}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50" />
              </div>
              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">To</label>
                <input type="datetime-local" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} disabled={calScanning}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50" />
              </div>
            </div>
            <button
              onClick={handleCalendarSync}
              disabled={calScanning || !calStart || !calEnd}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
            >
              {calScanning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Syncing Calendar...
                </>
              ) : "Sync Calendar"}
            </button>
            {calResult && renderResult(calResult)}
          </div>

          <hr className="border-gray-100" />

          {/* Email Sync Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Email Threads</h3>
            </div>
            <p className="text-xs text-gray-500">
              Search Gmail for job-related emails matched to companies, job postings, and contacts.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">From</label>
                <input type="datetime-local" value={emailStart} onChange={(e) => setEmailStart(e.target.value)} disabled={emailScanning}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50" />
              </div>
              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">To</label>
                <input type="datetime-local" value={emailEnd} onChange={(e) => setEmailEnd(e.target.value)} disabled={emailScanning}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition disabled:opacity-50" />
              </div>
            </div>
            <button
              onClick={handleEmailSync}
              disabled={emailScanning || !emailStart || !emailEnd}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {emailScanning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Syncing Emails...
                </>
              ) : "Sync Emails"}
            </button>
            {emailResult && renderResult(emailResult)}
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            disabled={scanning}
            className="text-xs px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
          >
            {(calResult?.success || emailResult?.success) ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
