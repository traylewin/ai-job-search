"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useUserId } from "@/hooks/useInstantData";

type ContentType = "job" | "email";

interface AddContentModalProps {
  initialContentType?: ContentType;
  onClose: () => void;
}

const CONTENT_TYPES: { key: ContentType; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    key: "job",
    label: "Job Posting",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    placeholder: "Paste a job posting, job description, or a URL to a job listing...",
  },
  {
    key: "email",
    label: "Email",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    placeholder: "Paste an email or email thread...",
  },
];

const URL_REGEX = /^https?:\/\/[^\s]+$/;

export default function AddContentModal({ initialContentType, onClose }: AddContentModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [contentType, setContentType] = useState<ContentType>(initialContentType || "job");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    isUpdate?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = useUserId();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, processing, saving]);

  // Focus editor on mount
  useEffect(() => {
    setTimeout(() => editorRef.current?.focus(), 100);
  }, []);

  // Get headers for API calls
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-user-id": userId || "",
    };
    if (typeof window !== "undefined") {
      const key = localStorage.getItem("anthropic_api_key");
      const model = localStorage.getItem("anthropic_model");
      if (key) headers["x-anthropic-key"] = key;
      if (model) headers["x-anthropic-model"] = model;
    }
    return headers;
  }, [userId]);

  // Analyze content with AI (parse only, no save)
  const analyzeContent = useCallback(
    async (textToProcess?: string) => {
      const text = textToProcess || content;
      if (!text.trim()) return;

      setProcessing(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/add-content", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ contentType, content: text, save: false }),
        });
        const data = await res.json();

        if (data.success) {
          setTitle(data.autoTitle || "");
          setResult({
            success: true,
            message: "AI analyzed your content. Edit the title and content, then Save.",
            isUpdate: data.isUpdate,
          });
        } else {
          setError(data.error || "Analysis failed");
        }
      } catch (e) {
        setError(`Analysis failed: ${e}`);
      } finally {
        setProcessing(false);
      }
    },
    [content, contentType, getHeaders]
  );

  // Save content to DB + Pinecone
  const saveContent = useCallback(async () => {
    if (!content.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/add-content", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ contentType, content, save: true }),
      });
      const data = await res.json();

      if (data.success) {
        const messages: Record<string, string> = {
          job: data.isUpdate
            ? `Updated existing job posting: ${data.parsed?.company} - ${data.parsed?.title}`
            : `Saved job posting: ${data.parsed?.company} - ${data.parsed?.title}`,
          email: data.isNewThread
            ? `Saved new email thread: ${data.parsed?.subject}`
            : `Saved email to existing thread: ${data.parsed?.subject}`,
        };
        setResult({
          success: true,
          message: messages[contentType] || "Content saved successfully",
          isUpdate: data.isUpdate,
        });
        setSaved(true);
      } else {
        setError(data.error || "Save failed");
      }
    } catch (e) {
      setError(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [content, contentType, getHeaders]);

  // Detect URL paste and auto-fetch
  const handleContentChange = useCallback(
    async (newContent: string) => {
      setContent(newContent);
      setError(null);
      setResult(null);
      setSaved(false);

      const trimmed = newContent.trim();
      if (URL_REGEX.test(trimmed) && trimmed.length < 2000) {
        setFetchingUrl(true);
        try {
          const res = await fetch("/api/fetch-url", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ url: trimmed }),
          });
          const data = await res.json();
          if (data.success && data.content) {
            setContent(data.content);
            analyzeContent(data.content);
          } else {
            setError(data.error || "Failed to fetch URL content");
          }
        } catch (e) {
          setError(`Failed to fetch URL: ${e}`);
        } finally {
          setFetchingUrl(false);
        }
      }
    },
    [getHeaders, analyzeContent]
  );

  // Auto-analyze on paste
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const pastedText = e.clipboardData.getData("text");
      if (pastedText.trim()) {
        setTimeout(() => {
          const trimmed = pastedText.trim();
          if (!URL_REGEX.test(trimmed)) {
            analyzeContent(trimmed);
          }
        }, 100);
      }
    },
    [analyzeContent]
  );

  const activeType = CONTENT_TYPES.find((t) => t.key === contentType)!;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current && !processing && !saving) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-800">Add Content</h3>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Type Tabs */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-50 shrink-0">
          {CONTENT_TYPES.map((type) => (
            <button
              key={type.key}
              onClick={() => {
                if (!processing && !saving) {
                  setContentType(type.key);
                  setContent("");
                  setTitle("");
                  setResult(null);
                  setError(null);
                  setSaved(false);
                }
              }}
              disabled={processing || saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                contentType === type.key
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
              }`}
            >
              {type.icon}
              {type.label}
            </button>
          ))}
        </div>

        {/* Title field */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider shrink-0">
              Title:
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title or let AI set one..."
              className="flex-1 text-sm text-gray-800 font-medium bg-transparent border-none outline-none placeholder:text-gray-300"
            />
            {title && (
              <span className="text-[10px] text-blue-500 shrink-0">AI-generated</span>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden px-5 py-3">
          <div className="relative h-full">
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onPaste={handlePaste}
              placeholder={activeType.placeholder}
              disabled={processing || saving || fetchingUrl}
              className="w-full h-full min-h-[200px] resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:bg-gray-50 disabled:text-gray-400 font-mono"
              style={{ minHeight: "250px" }}
            />

            {/* Loading overlay */}
            {(processing || saving || fetchingUrl) && (
              <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                <div className="flex items-center gap-3 text-sm">
                  <svg
                    className="w-5 h-5 animate-spin text-blue-500"
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
                  <span className="text-gray-600 font-medium">
                    {fetchingUrl
                      ? "Fetching URL content..."
                      : saving
                        ? "Saving..."
                        : "AI is analyzing your content..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="px-5 pb-2 shrink-0">
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          </div>
        )}

        {result && (
          <div className="px-5 pb-2 shrink-0">
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                result.success
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.success && (
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {result.message}
                {result.isUpdate && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                    Updated
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400">
            Paste content or a URL. Use AI to auto-set the title, then Save.
          </p>
          <div className="flex items-center gap-2">
            {saved && (
              <button
                onClick={() => {
                  setContent("");
                  setTitle("");
                  setResult(null);
                  setError(null);
                  setSaved(false);
                  editorRef.current?.focus();
                }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                Add Another
              </button>
            )}
            {/* AI analyze button (icon only) */}
            <button
              onClick={() => analyzeContent()}
              disabled={processing || saving || fetchingUrl || !content.trim()}
              title="Analyze with AI"
              className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 border border-orange-200 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent transition"
            >
              {processing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              )}
            </button>
            {/* Save button (primary) */}
            <button
              onClick={saveContent}
              disabled={processing || saving || fetchingUrl || !content.trim() || saved}
              className="text-xs px-4 py-1.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition"
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
            <button
              onClick={onClose}
              disabled={processing || saving}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-gray-500 hover:bg-gray-100 transition disabled:opacity-50"
            >
              {saved ? "Done" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
