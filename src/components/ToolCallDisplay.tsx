"use client";

import { useState } from "react";
import DraftEmailCard from "./ToolCallDisplays/DraftEmailCard";

interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

const TOOL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  searchJobs: { label: "Searching jobs", icon: "🔍", color: "blue" },
  searchEmails: { label: "Searching emails", icon: "📧", color: "emerald" },
  queryTracker: { label: "Checking tracker", icon: "📊", color: "slate" },
  readJobPosting: { label: "Reading job posting", icon: "📄", color: "blue" },
  readEmailThread: { label: "Reading email thread", icon: "💬", color: "emerald" },
  readResume: { label: "Reading resume", icon: "👤", color: "orange" },
  readPreferences: { label: "Reading preferences", icon: "📝", color: "amber" },
  computeDates: { label: "Computing dates", icon: "📅", color: "slate" },
  readRawFile: { label: "Reading raw file", icon: "📂", color: "gray" },
  updateTracker: { label: "Updating tracker", icon: "✏️", color: "slate" },
  addJobToTracker: { label: "Adding to tracker", icon: "➕", color: "blue" },
  draftEmail: { label: "Drafting email", icon: "✉️", color: "emerald" },
};

export default function ToolCallDisplay({
  toolName,
  args,
  result,
}: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const info = TOOL_LABELS[toolName] || { label: toolName, icon: "🔧", color: "gray" };

  // Special rendering for draftEmail — always show the full draft
  if (toolName === "draftEmail" && result) {
    return <DraftEmailCard result={result} />;
  }

  const argsPreview = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all
          bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 w-full text-left`}
      >
        <span>{info.icon}</span>
        <span className="font-medium">{info.label}</span>
        {argsPreview && (
          <span className="text-gray-400 truncate flex-1">
            ({argsPreview.slice(0, 60)}
            {argsPreview.length > 60 ? "..." : ""})
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-1 ml-6 text-xs space-y-2 animate-in fade-in">
          <div>
            <p className="text-gray-400 font-medium mb-0.5">Input</p>
            <pre className="bg-gray-50 rounded p-2 overflow-x-auto text-gray-600 max-h-40 overflow-y-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {result !== undefined && (
            <div>
              <p className="text-gray-400 font-medium mb-0.5">Result</p>
              <pre className="bg-gray-50 rounded p-2 overflow-x-auto text-gray-600 max-h-60 overflow-y-auto">
                {typeof result === "string"
                  ? result.slice(0, 2000)
                  : JSON.stringify(result, null, 2)?.slice(0, 2000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
