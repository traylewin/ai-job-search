"use client";

import { useEffect, useRef, useState } from "react";
import { useEmailsByThread, useActions } from "@/hooks/useInstantData";

// ─── Data types matching InstantDB shapes ───

interface JobPostingDetail {
  id: string;
  filename: string;
  company?: string;
  title?: string;
  location?: string;
  salaryRange?: string;
  team?: string;
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  techStack?: string[];
  rawText: string;
  parseConfidence: string;
  url?: string;
}

interface EmailThreadDetail {
  threadId: string;
  subject: string;
  company?: string;
  emailType: string;
  messageCount: number;
  latestDate?: string;
  participants?: { name: string; email: string }[];
}

interface ResumeDetail {
  id: string;
  name: string;
  contact: string;
  fullText: string;
  summary?: string;
  experience?: string;
  education?: string;
  skills?: string;
  projects?: string;
  sections?: { title: string; content: string }[];
  isNew?: boolean;
}

interface PreferencesDetail {
  id: string;
  fullText: string;
  sections?: { title: string; content: string }[];
  isNew?: boolean;
}

export type SourceDetail =
  | { type: "job"; data: JobPostingDetail }
  | { type: "thread"; data: EmailThreadDetail }
  | { type: "resume"; data: ResumeDetail }
  | { type: "notes"; data: PreferencesDetail };

interface SourceDetailModalProps {
  source: SourceDetail;
  onClose: () => void;
}

// ─── Sub-renderers ───

function JobContent({ job }: { job: JobPostingDetail }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState(job.company || "");
  const [title, setTitle] = useState(job.title || "");
  const [location, setLocation] = useState(job.location || "");
  const [salaryRange, setSalaryRange] = useState(job.salaryRange || "");
  const [team, setTeam] = useState(job.team || "");
  const [description, setDescription] = useState(job.description || "");
  const [requirements, setRequirements] = useState(job.requirements?.join("\n") || "");
  const [responsibilities, setResponsibilities] = useState(job.responsibilities?.join("\n") || "");
  const [techStack, setTechStack] = useState(job.techStack?.join(", ") || "");
  const [url, setUrl] = useState(job.url || "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!company.trim() && !title.trim()) return;
    actions.updateJobPosting(job.id, {
      company: company || undefined,
      title: title || undefined,
      location: location || undefined,
      salaryRange: salaryRange || undefined,
      team: team || undefined,
      description: description || undefined,
      requirements: requirements.trim() ? requirements.split("\n").map((r) => r.trim()).filter(Boolean) : [],
      responsibilities: responsibilities.trim() ? responsibilities.split("\n").map((r) => r.trim()).filter(Boolean) : [],
      techStack: techStack.trim() ? techStack.split(",").map((t) => t.trim()).filter(Boolean) : [],
      url: url || undefined,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditing(false);
    }, 1200);
  };

  const handleCancel = () => {
    setCompany(job.company || "");
    setTitle(job.title || "");
    setLocation(job.location || "");
    setSalaryRange(job.salaryRange || "");
    setTeam(job.team || "");
    setDescription(job.description || "");
    setRequirements(job.requirements?.join("\n") || "");
    setResponsibilities(job.responsibilities?.join("\n") || "");
    setTechStack(job.techStack?.join(", ") || "");
    setUrl(job.url || "");
    setEditing(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                className="w-full text-lg font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300 placeholder:font-normal"
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Job title"
                className="w-full text-sm text-gray-600 font-medium bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
              />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Job posting URL (optional)"
                className="w-full text-xs text-blue-600 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                  className="text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
                />
                <input
                  type="text"
                  value={salaryRange}
                  onChange={(e) => setSalaryRange(e.target.value)}
                  placeholder="Salary range"
                  className="text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
                />
                <input
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="Team / department"
                  className="text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-900">
                  {job.company || job.filename.replace(".html", "")}
                </h3>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    job.parseConfidence === "full"
                      ? "bg-green-100 text-green-700"
                      : job.parseConfidence === "partial"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {job.parseConfidence}
                </span>
              </div>
              {job.title && (
                <p className="text-sm text-gray-600 font-medium">{job.title}</p>
              )}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1 transition"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  {url.replace(/^https?:\/\//, "").split("/")[0]}
                </a>
              )}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {job.location}
                  </span>
                )}
                {job.salaryRange && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {job.salaryRange}
                  </span>
                )}
                {job.team && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {job.team}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition shrink-0 ml-3"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              onClick={handleCancel}
              className="text-xs px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                saved
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {editing ? (
        <Section title="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Job description..."
            rows={Math.max(3, description.split("\n").length)}
            className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y"
          />
        </Section>
      ) : job.description ? (
        <Section title="Description">
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            {job.description}
          </p>
        </Section>
      ) : null}

      {/* Requirements */}
      {editing ? (
        <Section title="Requirements (one per line)">
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="One requirement per line..."
            rows={Math.max(3, requirements.split("\n").length)}
            className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono"
          />
        </Section>
      ) : job.requirements && job.requirements.length > 0 ? (
        <Section title="Requirements">
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {job.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Responsibilities */}
      {editing ? (
        <Section title="Responsibilities (one per line)">
          <textarea
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            placeholder="One responsibility per line..."
            rows={Math.max(3, responsibilities.split("\n").length)}
            className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono"
          />
        </Section>
      ) : job.responsibilities && job.responsibilities.length > 0 ? (
        <Section title="Responsibilities">
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {job.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Tech Stack */}
      {editing ? (
        <Section title="Tech Stack (comma-separated)">
          <input
            type="text"
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
            placeholder="React, TypeScript, Node.js..."
            className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
          />
        </Section>
      ) : job.techStack && job.techStack.length > 0 ? (
        <Section title="Tech Stack">
          <div className="flex flex-wrap gap-1.5">
            {job.techStack.map((t, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Source file */}
      <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
        Source: {job.filename}
      </div>
    </div>
  );
}

function EmailThreadContent({ thread }: { thread: EmailThreadDetail }) {
  const { emails, isLoading } = useEmailsByThread(thread.threadId);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900">{thread.subject}</h3>
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
          {thread.company && (
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">
              {thread.company}
            </span>
          )}
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {thread.emailType}
          </span>
          <span>{thread.messageCount} messages</span>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <svg
              className="w-4 h-4 animate-spin text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-gray-400">Loading emails...</span>
          </div>
        )}
        {!isLoading &&
          emails.map((email) => (
            <div
              key={email.id}
              className="border border-gray-100 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {email.fromName}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {email.fromEmail}
                  </p>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0 ml-3">
                  {formatDate(email.date)}
                </span>
              </div>
              {email.subject && (
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  {email.subject}
                </p>
              )}
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {email.body}
              </p>
            </div>
          ))}
        {!isLoading && emails.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            No email messages found for this thread.
          </p>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function ResumeContent({ resume }: { resume: ResumeDetail }) {
  const actions = useActions();
  const [editing, setEditing] = useState(!!resume.isNew);
  const [name, setName] = useState(resume.name);
  const [contact, setContact] = useState(resume.contact);
  const [sections, setSections] = useState(resume.sections || []);
  const [fullText, setFullText] = useState(resume.fullText);
  const [saved, setSaved] = useState(false);

  const hasSections = sections.length > 0;

  const handleSave = () => {
    const updatedFullText = hasSections
      ? sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n")
      : fullText;
    if (!updatedFullText.trim() && !name.trim()) return;
    actions.updateResume(resume.id, {
      name: name || "My Resume",
      contact,
      sections,
      fullText: updatedFullText,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditing(false);
    }, 1200);
  };

  const handleCancel = () => {
    setName(resume.name);
    setContact(resume.contact);
    setSections(resume.sections || []);
    setFullText(resume.fullText);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                className="w-full text-lg font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300 placeholder:font-normal"
              />
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Contact info (email, phone, location)"
                className="w-full text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-400 focus:outline-none pb-0.5 placeholder:text-gray-300"
              />
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-gray-900">{name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{contact}</p>
            </>
          )}
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition shrink-0 ml-3"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              onClick={handleCancel}
              className="text-xs px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                saved
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        )}
      </div>

      {hasSections ? (
        sections.map((s, i) => (
          <div key={i}>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {editing ? (
                <input
                  type="text"
                  value={s.title}
                  onChange={(e) => {
                    const updated = [...sections];
                    updated[i] = { ...updated[i], title: e.target.value };
                    setSections(updated);
                  }}
                  className="w-full text-xs font-semibold text-gray-500 uppercase tracking-wider bg-transparent border-b border-gray-300 focus:border-blue-400 focus:outline-none pb-0.5"
                />
              ) : (
                s.title
              )}
            </h4>
            {editing ? (
              <textarea
                value={s.content}
                onChange={(e) => {
                  const updated = [...sections];
                  updated[i] = { ...updated[i], content: e.target.value };
                  setSections(updated);
                }}
                rows={Math.max(3, s.content.split("\n").length)}
                className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono"
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {s.content}
              </p>
            )}
          </div>
        ))
      ) : editing ? (
        <textarea
          value={fullText}
          onChange={(e) => setFullText(e.target.value)}
          placeholder="Paste or type your resume here..."
          rows={Math.max(8, fullText.split("\n").length)}
          className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono placeholder:text-gray-300 placeholder:font-sans"
        />
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
          {fullText}
        </p>
      )}
    </div>
  );
}

function NotesContent({ prefs }: { prefs: PreferencesDetail }) {
  const actions = useActions();
  const [editing, setEditing] = useState(!!prefs.isNew);
  const [sections, setSections] = useState(prefs.sections || []);
  const [fullText, setFullText] = useState(prefs.fullText);
  const [saved, setSaved] = useState(false);

  const hasSections = sections.length > 0;

  const handleSave = () => {
    const updatedFullText = hasSections
      ? sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n")
      : fullText;
    if (!updatedFullText.trim()) return;
    actions.updatePreferences(prefs.id, {
      sections: hasSections ? sections : [],
      fullText: updatedFullText,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setEditing(false);
    }, 1200);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">
          Job Search Notes &amp; Preferences
        </h3>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSections(prefs.sections || []);
                setFullText(prefs.fullText);
                setEditing(false);
              }}
              className="text-xs px-2.5 py-1 rounded-lg font-medium text-gray-500 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                saved
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        )}
      </div>

      {hasSections ? (
        sections.map((s, i) => (
          <div key={i}>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {editing ? (
                <input
                  type="text"
                  value={s.title}
                  onChange={(e) => {
                    const updated = [...sections];
                    updated[i] = { ...updated[i], title: e.target.value };
                    setSections(updated);
                  }}
                  className="w-full text-xs font-semibold text-gray-500 uppercase tracking-wider bg-transparent border-b border-gray-300 focus:border-blue-400 focus:outline-none pb-0.5"
                />
              ) : (
                s.title
              )}
            </h4>
            {editing ? (
              <textarea
                value={s.content}
                onChange={(e) => {
                  const updated = [...sections];
                  updated[i] = { ...updated[i], content: e.target.value };
                  setSections(updated);
                }}
                rows={Math.max(3, s.content.split("\n").length)}
                className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono"
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {s.content}
              </p>
            )}
          </div>
        ))
      ) : editing ? (
        <textarea
          value={fullText}
          onChange={(e) => setFullText(e.target.value)}
          placeholder="Type your job search notes, salary preferences, deal-breakers, companies you're excited about..."
          rows={Math.max(8, fullText.split("\n").length)}
          className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-y font-mono placeholder:text-gray-300 placeholder:font-sans"
        />
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
          {fullText}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ─── Modal shell ───

const HEADER_COLORS: Record<string, { bg: string; icon: string }> = {
  job: { bg: "bg-blue-500", icon: "text-white" },
  thread: { bg: "bg-emerald-500", icon: "text-white" },
  resume: { bg: "bg-orange-500", icon: "text-white" },
  notes: { bg: "bg-amber-500", icon: "text-white" },
};

const HEADER_LABELS: Record<string, string> = {
  job: "Job Posting",
  thread: "Email Thread",
  resume: "Resume",
  notes: "Notes & Preferences",
};

export default function SourceDetailModal({
  source,
  onClose,
}: SourceDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const colors = HEADER_COLORS[source.type];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 sm:mx-4">
        {/* Header bar */}
        <div
          className={`flex items-center justify-between px-5 py-3 ${colors.bg} flex-shrink-0`}
        >
          <span className="text-sm font-semibold text-white">
            {HEADER_LABELS[source.type]}
          </span>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {source.type === "job" && <JobContent job={source.data} />}
          {source.type === "thread" && (
            <EmailThreadContent thread={source.data} />
          )}
          {source.type === "resume" && <ResumeContent resume={source.data} />}
          {source.type === "notes" && <NotesContent prefs={source.data} />}
        </div>
      </div>
    </div>
  );
}
