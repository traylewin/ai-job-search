"use client";

import { useState } from "react";

interface DraftEmailCardProps {
  result: unknown;
}

export default function DraftEmailCard({ result }: DraftEmailCardProps) {
  const [copied, setCopied] = useState(false);
  const data = result as {
    draft?: { to?: string; subject?: string; body?: string };
    metadata?: { tone?: string; context?: string; note?: string };
  };
  const draft = data?.draft;
  if (!draft) return null;

  const fullText = `To: ${draft.to || ""}\nSubject: ${draft.subject || ""}\n\n${draft.body || ""}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-2 border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <span className="text-sm">✉️</span>
          <span className="text-xs font-semibold text-emerald-700">
            Draft Email
          </span>
          {data?.metadata?.note && (
            <span className="text-[10px] text-emerald-500 italic">
              — {data.metadata.note}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition font-medium"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Email fields */}
      <div className="px-4 py-3 space-y-2">
        {draft.to && (
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-14 shrink-0">
              To
            </span>
            <span className="text-sm text-gray-800">{draft.to}</span>
          </div>
        )}
        {draft.subject && (
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-14 shrink-0">
              Subject
            </span>
            <span className="text-sm font-medium text-gray-800">
              {draft.subject}
            </span>
          </div>
        )}
        {draft.body && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
              {draft.body}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
