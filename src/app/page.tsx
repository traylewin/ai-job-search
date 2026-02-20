"use client";

import { useState, useEffect, useCallback } from "react";
import SourcesSidebar from "@/components/SourcesSidebar";
import ChatInterface from "@/components/ChatInterface";
import TrackerView from "@/components/TrackerView";
import CalendarView from "@/components/CalendarView";
import ConversationSidebar from "@/components/ConversationSidebar";
import LandingPage from "@/components/LandingPage";
import SourceDetailModal, { SourceDetail } from "@/components/SourceDetailModal";
import SettingsPopup from "@/components/SettingsPopup";
import AddContentModal from "@/components/AddContentModal";
import FindCalendarEventsPopup from "@/components/FindCalendarEventsPopup";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { ProactiveAlert } from "@/types";
import { db, id as newId } from "@/lib/db/instant";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
import {
  useJobPostings,
  useTrackerEntries,
  useEmailThreads,
  useConversations,
  useConversationMessages,
  useActions,
  useUserId,
  useResumeData,
  usePreferencesData,
  useCalendarEvents,
  useUserSettings,
  useCompanyNameMap,
} from "@/hooks/useInstantData";

type View = "chat" | "tracker" | "calendar";

export default function Page() {
  const { isLoading: authLoading, user, error: authError } = db.useAuth();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center bg-white" style={{ height: "var(--app-height, 100vh)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {!user ? <LandingPage /> : <Home user={user} />}
    </GoogleOAuthProvider>
  );
}

function Home({ user }: { user: { id: string; email?: string | null } }) {
  const [view, setView] = useState<View>("chat");
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [focusedCompanies, setFocusedCompanies] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationSidebarOpen, setConversationSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDetail | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [addContentType, setAddContentType] = useState<"job" | "email" | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "job" | "thread" | "event"; id: string; label: string; company?: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [referencedConvId, setReferencedConvId] = useState<string | null>(null);
  const [scrollToTopTrigger, setScrollToTopTrigger] = useState(0);
  const [deletingAll, setDeletingAll] = useState(false);
  const [calendarScanOpen, setCalendarScanOpen] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [jobStatusRefreshing, setJobStatusRefreshing] = useState(false);

  // Load avatar from localStorage
  useEffect(() => {
    const url = localStorage.getItem("avatar_url");
    if (url) setAvatarUrl(url);
  }, []);

  const connectGoogle = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly",
    onSuccess: (tokenResponse) => {
      localStorage.setItem("google_calendar_token", tokenResponse.access_token);
      setCalendarConnected(true);
      setEmailConnected(true);
      actions.updateUserSettings(userSettings?.id ?? null, { googleCalendarConnected: true, googleEmailConnected: true });
    },
    onError: (error) => {
      console.error("Google auth error:", error);
    },
  });

  // userId from auth — used only for API fetch headers
  const userId = useUserId()!;
  const actions = useActions();

  // InstantDB real-time data (auto-scoped to current user inside hooks)
  const { isLoading: jobsLoading, jobPostings } = useJobPostings();
  const { isLoading: trackerLoading, entries: trackerEntries } = useTrackerEntries();
  const { isLoading: threadsLoading, threads: emailThreads } = useEmailThreads();
  const { conversations } = useConversations();
  const { resume: resumeData } = useResumeData();
  const { preferences: preferencesData } = usePreferencesData();
  const { events: calendarEvents } = useCalendarEvents();
  const { settings: userSettings } = useUserSettings();
  const { messages: referencedMessages } = useConversationMessages(referencedConvId);
  const companyNameMap = useCompanyNameMap();

  const isLoading = jobsLoading || trackerLoading || threadsLoading;

  // Sync connected state from DB flag or localStorage token
  useEffect(() => {
    const hasToken = !!localStorage.getItem("google_calendar_token");
    if (userSettings?.googleCalendarConnected || hasToken) setCalendarConnected(true);
    if (userSettings?.googleEmailConnected || hasToken) setEmailConnected(true);
  }, [userSettings]);

  const sortAlerts = (list: ProactiveAlert[]) =>
    [...list].sort((a, b) => {
      const aFollow = a.actionLabel === "Draft follow-up" ? 0 : 1;
      const bFollow = b.actionLabel === "Draft follow-up" ? 0 : 1;
      return aFollow - bFollow;
    });

  // Load alerts on mount
  useEffect(() => {
    fetch("/api/alerts", { headers: { "x-user-id": userId } })
      .then((r) => r.json())
      .then((json) => setAlerts(sortAlerts(json.alerts || [])))
      .catch((e) => console.error("Failed to load alerts:", e));
  }, [userId]);

  const LOAD_STATUS_KEY = "sampleDataLoadStatus";

  const handleIngest = async (force = false) => {
    setSyncing(true);
    setSyncStatus("Ingesting data...");
    try {
      const stored = localStorage.getItem(LOAD_STATUS_KEY);
      const loadStatus = stored ? JSON.parse(stored) : undefined;

      if (!force && loadStatus) {
        const allLoaded =
          loadStatus.resumeLoaded &&
          loadStatus.emailsLoaded &&
          loadStatus.jobsLoaded &&
          loadStatus.notesLoaded &&
          loadStatus.trackerLoaded;
        if (allLoaded) {
          setSyncStatus("All sample data already loaded.");
          return;
        }
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "x-user-id": userId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force, loadStatus }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.loadStatus) {
          localStorage.setItem(LOAD_STATUS_KEY, JSON.stringify(json.loadStatus));
        }
        const idb = json.instantdb;
        setSyncStatus(
          `Ingested: ${idb.jobPostings} jobs, ${idb.trackerEntries} tracker, ${idb.emails} emails`
        );
        setSidebarOpen(true);
        fetch("/api/alerts", { headers: { "x-user-id": userId } })
          .then((r) => r.json())
          .then((j) => setAlerts(sortAlerts(j.alerts || [])))
          .catch((e) => console.error("Failed to refresh alerts:", e));
      } else {
        setSyncStatus(`Ingest error: ${json.error}`);
      }
    } catch (e) {
      setSyncStatus(`Ingest failed: ${e}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(null), 5000);
    }
  };

  const handleDeleteAllData = async () => {
    setDeletingAll(true);
    try {
      const res = await fetch("/api/delete-all-data", {
        method: "POST",
        headers: { "x-user-id": userId },
      });
      const json = await res.json();
      if (json.success) {
        localStorage.removeItem(LOAD_STATUS_KEY);
        setActiveConversationId(null);
        setAlerts([]);
        setSyncStatus(`Deleted ${json.deleted} records.`);
        setTimeout(() => setSyncStatus(null), 5000);
      } else {
        setSyncStatus(`Delete error: ${json.error}`);
        setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (e) {
      setSyncStatus(`Delete failed: ${e}`);
      setTimeout(() => setSyncStatus(null), 5000);
    } finally {
      setDeletingAll(false);
    }
  };

  const allCompanies = [...companyNameMap.values()].filter(Boolean).sort((a, b) => a.localeCompare(b));

  const toggleCompany = useCallback((company: string) => {
    setFocusedCompanies((prev) =>
      prev.includes(company)
        ? prev.filter((c) => c !== company)
        : [...prev, company]
    );
    setView("chat");
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedCompanies([]);
  }, []);

  const handleSelectSource = useCallback(
    (type: string, id: string) => {
      if (type === "job") {
        const job = jobPostings.find(
          (j) => j.filename === id || j.id === id
        );
        if (job) {
          setSelectedSource({
            type: "job",
            data: {
              id: job.id,
              filename: job.filename,
              company: companyNameMap.get(job.companyId as string) || undefined,
              title: job.title || undefined,
              location: job.location || undefined,
              salaryRange: job.salaryRange || undefined,
              team: job.team || undefined,
              description: job.description || undefined,
              requirements: job.requirements as string[] | undefined,
              responsibilities: job.responsibilities as string[] | undefined,
              techStack: job.techStack as string[] | undefined,
              rawText: job.rawText || "",
              parseConfidence: job.parseConfidence,
              url: (job as Record<string, unknown>).url as string | undefined,
              status: (job.status as string) || "interested",
            },
          });
        }
      } else if (type === "thread") {
        const thread = emailThreads.find((t) => t.threadId === id);
        if (thread) {
          setSelectedSource({
            type: "thread",
            data: {
              threadId: thread.threadId,
              subject: thread.subject,
              company: companyNameMap.get(thread.companyId as string) || undefined,
              emailType: thread.emailType,
              messageCount: thread.messageCount,
              latestDate: thread.latestDate || undefined,
              participants: thread.participants as { name: string; email: string }[] | undefined,
            },
          });
        }
      } else if (type === "resume") {
        if (resumeData) {
          setSelectedSource({
            type: "resume",
            data: {
              id: resumeData.id,
              name: resumeData.name,
              contact: resumeData.contact,
              fullText: resumeData.fullText,
              summary: resumeData.summary || undefined,
              experience: resumeData.experience || undefined,
              education: resumeData.education || undefined,
              skills: resumeData.skills || undefined,
              projects: resumeData.projects || undefined,
              sections: resumeData.sections as { title: string; content: string }[] | undefined,
            },
          });
        } else {
          setSelectedSource({
            type: "resume",
            data: {
              id: newId(),
              name: localStorage.getItem("user_name") || "",
              contact: user.email || "",
              fullText: "",
              isNew: true,
            },
          });
        }
      } else if (type === "event") {
        const event = calendarEvents.find((e) => e.id === id || e.googleEventId === id);
        if (event) {
          setSelectedSource({
            type: "event",
            data: {
              id: event.id,
              googleEventId: event.googleEventId,
              company: companyNameMap.get(event.companyId as string) || undefined,
              title: event.title,
              description: event.description || undefined,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location || undefined,
              attendees: event.attendees as { name: string; email: string }[] | undefined,
              googleCalendarLink: event.googleCalendarLink || undefined,
              status: event.status || undefined,
              eventType: event.eventType || undefined,
            },
          });
        }
      } else if (type === "notes") {
        if (preferencesData) {
          setSelectedSource({
            type: "notes",
            data: {
              id: preferencesData.id,
              fullText: preferencesData.fullText,
              sections: preferencesData.sections as { title: string; content: string }[] | undefined,
            },
          });
        } else {
          setSelectedSource({
            type: "notes",
            data: {
              id: newId(),
              fullText: "",
              isNew: true,
            },
          });
        }
      }
    },
    [jobPostings, emailThreads, resumeData, preferencesData, calendarEvents, companyNameMap]
  );

  const handleDeleteContent = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetch("/api/delete-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({
          type: deleteConfirm.type,
          id: deleteConfirm.id,
          company: deleteConfirm.company,
        }),
      });
    } catch (e) {
      console.error("[Delete] Failed:", e);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, user.id]);

  const handleNewConversation = useCallback(() => {
    const convId = actions.createConversation("New Conversation");
    setActiveConversationId(convId);
  }, [actions]);

  const handleSelectConversation = useCallback((convId: string) => {
    if (convId === activeConversationId) {
      // Already active — scroll to the first question
      setScrollToTopTrigger((n) => n + 1);
    } else {
      // Different conversation — inject its Q&A into the active chat
      setReferencedConvId(convId);
    }
    setView("chat");
  }, [activeConversationId]);

  const handleDeleteConversation = useCallback(
    (convId: string) => {
      actions.deleteConversation(convId);
      if (activeConversationId === convId) {
        setActiveConversationId(null);
      }
    },
    [actions, activeConversationId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-white" style={{ height: "var(--app-height, 100vh)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Loading your job search data...</p>
        </div>
      </div>
    );
  }

  const resolveCompany = (companyId: string | undefined | null): string | null => {
    if (!companyId) return null;
    return companyNameMap.get(companyId as string) || null;
  };

  const sidebarJobPostings = jobPostings.map((j) => ({
    id: j.id,
    filename: j.filename,
    company: resolveCompany(j.companyId as string),
    title: j.title || null,
    parseConfidence: j.parseConfidence,
    status: (j.status as string) || "interested",
  }));

  const sidebarThreads = emailThreads.map((t) => ({
    threadId: t.threadId,
    subject: t.subject,
    company: resolveCompany(t.companyId as string),
    type: t.emailType,
    messageCount: t.messageCount,
    latestDate: (t.latestDate as string) || null,
  }));

  const jobStatusByPostingId = new Map(
    jobPostings.map((j) => [j.id, (j.status as string) || "interested"])
  );

  const trackerRows = trackerEntries.map((t) => ({
    id: t.id,
    jobPostingId: (t.jobPostingId as string) || "",
    company: resolveCompany(t.companyId as string) || "",
    role: t.role,
    status: jobStatusByPostingId.get(t.jobPostingId as string) || "unknown",
    dateApplied: t.dateAppliedRaw,
    salaryRange: t.salaryRange || "",
    location: t.location || "",
    recruiter: t.recruiter || "",
    notes: t.notes || "",
    lastEventId: t.lastEventId,
    lastEventTitle: t.lastEventTitle,
    lastEventDate: t.lastEventDate,
  }));

  return (
    <div className="flex text-sm text-gray-700 overflow-hidden bg-white" style={{ height: "var(--app-height, 100vh)" }}>
      {/* Sources Sidebar — overlay on mobile, inline on md+ */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-40 md:relative md:z-auto">
            <SourcesSidebar
              jobPostings={sidebarJobPostings}
              threads={sidebarThreads}
              calendarEvents={calendarEvents.map((e) => ({
                id: e.id,
                googleEventId: e.googleEventId,
                title: e.title,
                company: resolveCompany(e.companyId as string),
                startTime: e.startTime,
                eventType: e.eventType || "other",
              }))}
              resumeName={resumeData?.name || null}
              onSelectSource={(type, id) => {
                handleSelectSource(type, id);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              onAddContent={(ct) => { setAddContentType(ct); setAddContentOpen(true); }}
              onDeleteJob={(job) => setDeleteConfirm({
                type: "job",
                id: job.id,
                label: job.company || job.filename,
                company: job.company,
              })}
              onDeleteThread={(thread) => setDeleteConfirm({
                type: "thread",
                id: thread.threadId,
                label: thread.company || thread.subject,
              })}
              onDeleteEvent={(event) => setDeleteConfirm({
                type: "event",
                id: event.id,
                label: event.company || event.title,
              })}
              onRefreshCalendar={async () => {
                const token = localStorage.getItem("google_calendar_token");
                if (!token) {
                  setCalendarScanOpen(true);
                  return;
                }
                const startDate = userSettings?.calendarLastSyncDate
                  || userSettings?.jobSearchStartDate
                  || new Date(Date.now() - 30 * 86400000).toISOString();
                const endDate = new Date().toISOString();
                setCalendarSyncing(true);
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
                  if (res.status === 401) {
                    localStorage.removeItem("google_calendar_token");
                    setCalendarConnected(false);
                    actions.updateUserSettings(userSettings?.id ?? null, { googleCalendarConnected: false });
                    setCalendarScanOpen(true);
                  }
                } catch (err) {
                  console.error("Calendar sync failed:", err);
                } finally {
                  setCalendarSyncing(false);
                }
              }}
              calendarConnected={calendarConnected}
              calendarSyncing={calendarSyncing}
              calendarLastSyncDate={userSettings?.calendarLastSyncDate || null}
              onConnectCalendar={() => connectGoogle()}
              onConnectEmail={() => connectGoogle()}
              emailConnected={emailConnected}
              emailSyncing={emailSyncing}
              emailLastSyncDate={userSettings?.emailLastSyncDate || null}
              onRefreshEmail={async () => {
                const token = localStorage.getItem("google_calendar_token");
                if (!token) return;
                const startDate = userSettings?.emailLastSyncDate
                  || userSettings?.jobSearchStartDate
                  || new Date(Date.now() - 30 * 86400000).toISOString();
                const endDate = new Date().toISOString();
                setEmailSyncing(true);
                try {
                  const res = await fetch("/api/email/scan", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-user-id": userId,
                      "x-google-token": token,
                    },
                    body: JSON.stringify({ startDate, endDate }),
                  });
                  if (res.status === 401) {
                    localStorage.removeItem("google_calendar_token");
                    setEmailConnected(false);
                    setCalendarConnected(false);
                    actions.updateUserSettings(userSettings?.id ?? null, { googleEmailConnected: false, googleCalendarConnected: false });
                  }
                } catch (err) {
                  console.error("Email sync failed:", err);
                } finally {
                  setEmailSyncing(false);
                }
              }}
              jobStatusRefreshing={jobStatusRefreshing}
              onRefreshJobStatuses={async (jobIds) => {
                if (!userId || jobIds.length === 0) return;
                setJobStatusRefreshing(true);
                try {
                  await fetch("/api/job/refresh-status", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-user-id": userId,
                    },
                    body: JSON.stringify({ jobPostingIds: jobIds }),
                  });
                } catch (err) {
                  console.error("Job status refresh failed:", err);
                } finally {
                  setJobStatusRefreshing(false);
                }
              }}
            />
          </div>
        </>
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative min-w-0 min-h-0">
        {/* Header with Nav Tabs */}
        <header className="border-b border-gray-100 bg-white z-10 shrink-0">
          <div className="h-12 flex items-center px-3 sm:px-5 justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Sources sidebar toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium text-sm transition border border-blue-300 hover:border-blue-400 rounded-full px-3 py-1"
                title="Toggle sources"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                Sources
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-teal-400 items-center justify-center hidden sm:flex">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <span className="font-semibold text-gray-800 hidden sm:inline">Job Hunt Agent</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Conversation history toggle */}
              <button
                onClick={() => setConversationSidebarOpen(!conversationSidebarOpen)}
                className="text-gray-400 hover:text-gray-600 transition"
                title="Chat history"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              {alerts.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 sm:px-2.5 py-1 rounded-full">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {alerts.length} alerts
                </div>
              )}

              {/* User avatar & settings */}
              <div className="relative">
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="flex items-center gap-2 cursor-pointer"
                  title="Settings"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="User"
                      className="w-7 h-7 rounded-full object-cover ring-2 ring-gray-100 hover:ring-blue-300 transition"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-teal-300 flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-gray-100 hover:ring-blue-300 transition"
                    >
                      {(user.email || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {settingsOpen && (
                  <SettingsPopup
                    onClose={() => { setSettingsOpen(false); setCalendarConnected(!!localStorage.getItem("google_calendar_token")); }}
                    onIngest={handleIngest}
                    syncing={syncing}
                    syncStatus={syncStatus}
                    allSampleDataLoaded={(() => {
                      try {
                        const s = JSON.parse(localStorage.getItem(LOAD_STATUS_KEY) || "{}");
                        return !!(s.resumeLoaded && s.emailsLoaded && s.jobsLoaded && s.notesLoaded && s.trackerLoaded);
                      } catch { return false; }
                    })()}
                    onDeleteAllData={handleDeleteAllData}
                    isDeletingAll={deletingAll}
                    userEmail={user.email}
                    onOpenCalendarScan={() => {
                      setSettingsOpen(false);
                      setCalendarScanOpen(true);
                    }}
                    onSignOut={() => {
                      localStorage.removeItem("avatar_url");
                      localStorage.removeItem("user_name");
                      localStorage.removeItem("google_calendar_token");
                      db.auth.signOut();
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center px-3 sm:px-5 gap-1 -mb-px">
            <button
              onClick={() => setView("chat")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                view === "chat"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chat
            </button>
            <button
              onClick={() => setView("tracker")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                view === "tracker"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Tracker
              <span className="text-xs text-gray-400">
                {trackerEntries.length}
              </span>
            </button>
            {calendarEvents.length > 0 && (
              <button
                onClick={() => setView("calendar")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                  view === "calendar"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Calendar
                <span className="text-xs text-gray-400">
                  {calendarEvents.length}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Views */}
        {view === "chat" ? (
          <ChatInterface
            alerts={alerts}
            focusedCompanies={focusedCompanies}
            onToggleCompany={toggleCompany}
            onClearFocus={clearFocus}
            allCompanies={allCompanies}
            conversationId={activeConversationId}
            onConversationCreated={setActiveConversationId}
            scrollToTopTrigger={scrollToTopTrigger}
            referencedMessages={referencedMessages}
            referencedConvTitle={referencedConvId ? conversations.find((c) => c.id === referencedConvId)?.title || "Referenced conversation" : null}
            onClearReference={() => setReferencedConvId(null)}
            hasData={!!resumeData}
            onLoadSampleData={() => handleIngest(true)}
            isLoadingSampleData={syncing}
            loadSampleDataStatus={syncStatus}
            onOpenSources={() => setSidebarOpen(true)}
          />
        ) : view === "tracker" ? (
          <TrackerView
            entries={trackerRows}
            calendarEvents={calendarEvents.map((e) => ({
              id: e.id,
              company: companyNameMap.get(e.companyId as string) || undefined,
              title: e.title,
              startTime: e.startTime,
            }))}
            onFocusCompany={(company) => {
              setFocusedCompanies([company]);
              setView("chat");
            }}
            onSelectEvent={(eventId) => handleSelectSource("event", eventId)}
          />
        ) : (
          <CalendarView
            events={calendarEvents.map((e) => ({
              id: e.id,
              googleEventId: e.googleEventId,
              title: e.title,
              company: companyNameMap.get(e.companyId as string) || undefined,
              startTime: e.startTime,
              endTime: e.endTime,
              location: e.location || undefined,
              eventType: e.eventType || "other",
              googleCalendarLink: e.googleCalendarLink || undefined,
            }))}
            onSelectEvent={(eventId: string) => handleSelectSource("event", eventId)}
          />
        )}
      </main>

      {/* Conversation History Sidebar — right side, overlay on mobile, inline on md+ */}
      {conversationSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-30 md:hidden"
            onClick={() => setConversationSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-40 md:relative md:z-auto">
            <ConversationSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                if (window.innerWidth < 768) setConversationSidebarOpen(false);
              }}
              onNewConversation={handleNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onClose={() => setConversationSidebarOpen(false)}
            />
          </div>
        </>
      )}

      {/* Source detail modal */}
      {selectedSource && (
        <SourceDetailModal
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}

      {/* Add Content modal */}
      {addContentOpen && (
        <AddContentModal initialContentType={addContentType} onClose={() => { setAddContentOpen(false); setAddContentType(undefined); }} />
      )}

      {/* Sync Email and Calendar popup */}
      {calendarScanOpen && (
        <FindCalendarEventsPopup
          onClose={() => {
            setCalendarScanOpen(false);
            const hasToken = !!localStorage.getItem("google_calendar_token");
            setCalendarConnected(hasToken);
            setEmailConnected(hasToken);
          }}
          defaultCalendarStart={
            userSettings?.calendarLastSyncDate ||
            userSettings?.jobSearchStartDate ||
            new Date(Date.now() - 30 * 86400000).toISOString()
          }
          defaultEmailStart={
            userSettings?.emailLastSyncDate ||
            userSettings?.jobSearchStartDate ||
            new Date(Date.now() - 30 * 86400000).toISOString()
          }
          defaultEndDate={new Date().toISOString()}
          userId={userId}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Delete {deleteConfirm.type === "job" ? "Job Posting" : deleteConfirm.type === "event" ? "Calendar Event" : "Email Thread"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">{deleteConfirm.label}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                {deleteConfirm.type === "job"
                  ? "This will permanently delete this job posting and its tracker entry. This cannot be undone."
                  : deleteConfirm.type === "event"
                  ? "This will permanently delete this calendar event. This cannot be undone."
                  : `This will permanently delete this email thread and all ${deleteConfirm.label ? "its" : "associated"} emails. This cannot be undone.`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteContent}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
