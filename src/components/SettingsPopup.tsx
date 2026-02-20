"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useUserSettings, useActions } from "@/hooks/useInstantData";

const ANTHROPIC_MODELS = [
  // Current generation
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", group: "Current" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", group: "Current" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", group: "Current" },
  // Legacy
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", group: "Legacy" },
  { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5", group: "Legacy" },
  { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1", group: "Legacy" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", group: "Legacy" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", group: "Legacy" },
];

function defaultJobSearchStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

interface SettingsPopupProps {
  onClose: () => void;
  onIngest: (force?: boolean) => void;
  syncing: boolean;
  syncStatus: string | null;
  allSampleDataLoaded: boolean;
  onDeleteAllData: () => Promise<void>;
  isDeletingAll: boolean;
  onSignOut: () => void;
  userEmail?: string | null;
  onOpenCalendarScan: () => void;
}

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("anthropic_api_key") || "";
}

export function getStoredModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("anthropic_model") || "";
}

export default function SettingsPopup({
  onClose,
  onIngest,
  syncing,
  syncStatus,
  allSampleDataLoaded,
  onDeleteAllData,
  isDeletingAll,
  onSignOut,
  userEmail,
  onOpenCalendarScan,
}: SettingsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [model, setModel] = useState(() => getStoredModel());
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { settings } = useUserSettings();
  const actions = useActions();

  const [calendarConnected, setCalendarConnected] = useState(
    () => !!localStorage.getItem("google_calendar_token") || !!settings?.googleCalendarConnected
  );

  const [jobSearchDate, setJobSearchDate] = useState(
    settings?.jobSearchStartDate || defaultJobSearchStartDate()
  );

  useEffect(() => {
    if (settings?.jobSearchStartDate) {
      setJobSearchDate(settings.jobSearchStartDate);
    }
  }, [settings?.jobSearchStartDate]);

  useEffect(() => {
    if (settings?.googleCalendarConnected) {
      setCalendarConnected(true);
    }
  }, [settings?.googleCalendarConnected]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem("anthropic_api_key", apiKey.trim());
    } else {
      localStorage.removeItem("anthropic_api_key");
    }
    if (model) {
      localStorage.setItem("anthropic_model", model);
    } else {
      localStorage.removeItem("anthropic_model");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleJobSearchDateSave = useCallback(() => {
    if (!jobSearchDate) return;
    actions.updateUserSettings(settings?.id || null, {
      jobSearchStartDate: jobSearchDate,
    });
  }, [jobSearchDate, settings?.id, actions]);

  const connectGoogle = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly",
    onSuccess: (tokenResponse) => {
      localStorage.setItem("google_calendar_token", tokenResponse.access_token);
      setCalendarConnected(true);
      actions.updateUserSettings(settings?.id ?? null, { googleCalendarConnected: true, googleEmailConnected: true });
    },
    onError: (error) => {
      console.error("Google auth error:", error);
    },
  });

  const maskedKey = apiKey
    ? apiKey.slice(0, 10) + "•".repeat(Math.max(0, apiKey.length - 14)) + apiKey.slice(-4)
    : "";

  return (
    <div
      ref={popupRef}
      className="fixed inset-x-4 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden max-h-[calc(100vh-5rem)] overflow-y-auto"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Settings</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* AI Model Settings */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            AI Model
          </h4>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">
              Anthropic API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition pr-16 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 font-medium px-1.5 py-0.5 rounded bg-gray-100"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            {apiKey && !showKey && (
              <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">
                {maskedKey}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition appearance-none cursor-pointer"
            >
              <option value="">Server default</option>
              {Object.entries(
                ANTHROPIC_MODELS.reduce<Record<string, typeof ANTHROPIC_MODELS>>((acc, m) => {
                  (acc[m.group] ??= []).push(m);
                  return acc;
                }, {})
              ).map(([group, models]) => (
                <optgroup key={group} label={group}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <button
            onClick={handleSave}
            className={`w-full py-2 text-xs font-medium rounded-lg transition ${
              saved
                ? "bg-green-50 text-green-600 border border-green-200"
                : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
            }`}
          >
            {saved ? "Saved!" : "Save AI Settings"}
          </button>
        </div>

        <div className="border-t border-gray-100" />

        {/* Data Management */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Data
          </h4>

          {syncStatus && (
            <p className="text-[11px] text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              {syncStatus}
            </p>
          )}

          <button
            onClick={() => onIngest()}
            disabled={syncing || allSampleDataLoaded}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {syncing ? "Loading..." : allSampleDataLoaded ? "Sample Data Loaded" : "Load Sample Data"}
          </button>

          {!deleteConfirmOpen ? (
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={syncing || isDeletingAll}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 border border-red-100 transition disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete All Data
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  This will permanently delete <strong>all</strong> your data: job postings, emails,
                  tracker entries, resume, notes, and conversation history. This cannot be undone.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isDeletingAll}
                  className="flex-1 py-1.5 text-[11px] font-medium rounded-md text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await onDeleteAllData();
                    setDeleteConfirmOpen(false);
                  }}
                  disabled={isDeletingAll}
                  className="flex-1 py-1.5 text-[11px] font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeletingAll ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    "Yes, Delete Everything"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        <div className="border-t border-gray-100" />

        {/* Google Calendar (collapsible) */}
        <div>
          <button
            onClick={() => setCalendarOpen(!calendarOpen)}
            className="flex items-center gap-1.5 w-full text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition"
          >
            <svg
              className={`w-3 h-3 transition-transform ${calendarOpen ? "rotate-0" : "-rotate-90"}`}
              fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Email and Calendar Sync
            {calendarConnected && (
              <span className="ml-auto w-2 h-2 rounded-full bg-green-400" title="Connected" />
            )}
          </button>

          {calendarOpen && (
            <div className="mt-3 space-y-3">
              {calendarConnected ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-green-700 font-medium">Email & Calendar Connected</span>
                  <button
                    onClick={() => connectGoogle()}
                    className="ml-auto text-[10px] text-green-600 hover:text-green-800 font-medium"
                  >
                    Re-connect
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connectGoogle()}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Allow Access to Email and Calendar
                </button>
              )}

              <div>
                <label className="text-xs text-gray-600 font-medium block mb-1">
                  Job Search Started
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={jobSearchDate}
                    onChange={(e) => setJobSearchDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition"
                  />
                  <button
                    onClick={handleJobSearchDateSave}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Earliest date for email and calendar sync
                </p>
              </div>

              <button
                onClick={onOpenCalendarScan}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Sync Email and Calendar
              </button>
            </div>
          )}
        </div>
        
        {/* Account */}
        <div className="space-y-2">
          {userEmail && (
            <p className="text-xs text-gray-500 text-center">{userEmail}</p>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 border border-red-100 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
