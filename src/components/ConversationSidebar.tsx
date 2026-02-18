"use client";

import { useState } from "react";

interface Conversation {
  id: string;
  title: string;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  messages?: { id: string }[];
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
}

function formatRelativeTime(date: string | number | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onClose,
}: ConversationSidebarProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <aside className="w-64 h-full bg-gray-50 border-l border-gray-200 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewConversation}
            className="text-gray-400 hover:text-blue-600 transition p-1 rounded-md hover:bg-blue-50"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1 rounded-md hover:bg-gray-100"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {conversations.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400">No conversations yet</p>
            <button
              onClick={onNewConversation}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Start your first chat
            </button>
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const msgCount = conv.messages?.length || 0;

          return (
            <div
              key={conv.id}
              className={`group relative flex items-center rounded-lg transition cursor-pointer ${
                isActive
                  ? "bg-blue-100 text-blue-800"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <button
                onClick={() => onSelectConversation(conv.id)}
                className="flex-1 text-left px-3 py-2.5 min-w-0"
              >
                <p className="text-xs font-medium truncate">{conv.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {msgCount} messages &middot; {formatRelativeTime(conv.updatedAt)}
                </p>
              </button>

              {/* Delete button */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition">
                {confirmDelete === conv.id ? (
                  <div className="flex items-center gap-1 bg-white border border-red-200 rounded-md px-1.5 py-0.5 shadow-sm">
                    <button
                      onClick={() => {
                        onDeleteConversation(conv.id);
                        setConfirmDelete(null);
                      }}
                      className="text-[10px] text-red-600 font-medium hover:text-red-700"
                    >
                      Delete
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-[10px] text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(conv.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete conversation"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* InstantDB badge */}
      <div className="px-4 py-2 border-t border-gray-100 text-center">
        <span className="text-[10px] text-gray-400">
          Powered by InstantDB
        </span>
      </div>
    </aside>
  );
}
