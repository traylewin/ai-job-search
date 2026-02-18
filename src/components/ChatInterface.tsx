"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import ToolCallDisplay from "./ToolCallDisplay";
import ProactiveAlerts from "./ProactiveAlerts";
import { ProactiveAlert } from "@/types";
import {
  useActions,
  useUserId,
  useConversationMessages,
} from "@/hooks/useInstantData";

interface ReferencedMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string | number | Date;
}

interface ChatInterfaceProps {
  alerts: ProactiveAlert[];
  focusedCompanies: string[];
  onToggleCompany: (company: string) => void;
  onClearFocus: () => void;
  allCompanies: string[];
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  scrollToTopTrigger?: number;
  referencedMessages?: ReferencedMessage[];
  referencedConvTitle?: string | null;
  onClearReference?: () => void;
  hasData?: boolean;
  onLoadSampleData?: () => void;
  isLoadingSampleData?: boolean;
  loadSampleDataStatus?: string | null;
  onOpenSources?: () => void;
}

const SUGGESTED_PROMPTS = [
  "What's the status of all my applications?",
  "Compare the Stripe and Datadog offers",
  "Help me prep for my Notion interview",
  "Draft a follow-up for Figma",
];

export default function ChatInterface({
  alerts,
  focusedCompanies,
  onToggleCompany,
  onClearFocus,
  allCompanies,
  conversationId,
  onConversationCreated,
  scrollToTopTrigger = 0,
  referencedMessages = [],
  referencedConvTitle = null,
  onClearReference,
  hasData = true,
  onLoadSampleData,
  isLoadingSampleData = false,
  loadSampleDataStatus = null,
  onOpenSources,
}: ChatInterfaceProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [promptDetail, setPromptDetail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lastSavedMsgCount = useRef(0);

  const userId = useUserId();
  const actions = useActions();

  const transport = useMemo(() => {
    const headers: Record<string, string> = { "x-user-id": userId || "" };
    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("anthropic_api_key");
      const storedModel = localStorage.getItem("anthropic_model");
      if (storedKey) headers["x-anthropic-key"] = storedKey;
      if (storedModel) headers["x-anthropic-model"] = storedModel;
    }
    return new DefaultChatTransport({ headers });
  }, [userId]);
  const onChatError = useCallback((err: Error) => {
    console.error("[Chat] Error:", err);
  }, []);
  const { messages, sendMessage, status, error: chatError } = useChat({
    transport,
    onError: onChatError,
    experimental_throttle: 50,
  });
  const isLoading = status === "submitted" || status === "streaming";

  // Load saved messages for the active conversation
  const { messages: savedMessages } = useConversationMessages(conversationId);

  // Auto-scroll to bottom on new messages
  const messageCount = messages.length;
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messageCount, status]);

  // Scroll to first question when triggered from conversation sidebar
  useEffect(() => {
    if (scrollToTopTrigger > 0) {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [scrollToTopTrigger]);

  // Auto-scroll to referenced messages when they appear
  const referencedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (referencedMessages.length > 0 && referencedRef.current) {
      referencedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [referencedMessages]);

  // Hide suggestions once a message is sent
  useEffect(() => {
    if (messageCount > 0) setShowSuggestions(false);
  }, [messageCount]);

  // Auto-focus chat input when focused companies change (e.g. from tracker)
  useEffect(() => {
    if (focusedCompanies.length > 0) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [focusedCompanies]);

  // Persist when streaming completes (not during streaming)
  useEffect(() => {
    if (status !== "ready" || messageCount === 0 || !conversationId) return;
    // Only save messages we haven't saved yet
    const newMessages = messages.slice(lastSavedMsgCount.current);
    for (const msg of newMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const textParts = msg.parts.filter(
          (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
        );
        const textContent = textParts.map((p) => p.text).join("");
        if (textContent.trim()) {
          actions.saveMessage(
            conversationId,
            msg.role,
            textContent,
            JSON.parse(JSON.stringify(msg.parts))
          );
        }
      }
    }
    lastSavedMsgCount.current = messageCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, conversationId]);

  const resizeTextarea = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxHeight = lineHeight * 3 + 20;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleSuggestedPrompt = (prompt: string) => {
    let finalPrompt = prompt;
    if (focusedCompanies.length > 0) {
      finalPrompt = `[Focused on: ${focusedCompanies.join(", ")}] ${prompt}`;
    }
    setInputValue(finalPrompt);
    setTimeout(() => {
      resizeTextarea();
      inputRef.current?.focus();
    }, 50);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    // Auto-create conversation if none active
    let activeConvId = conversationId;
    if (!activeConvId) {
      const title = inputValue.slice(0, 50) + (inputValue.length > 50 ? "..." : "");
      activeConvId = actions.createConversation(title);
      onConversationCreated(activeConvId);
    }

    let finalInput = inputValue;
    if (focusedCompanies.length > 0 && !inputValue.startsWith("[Focused on:")) {
      finalInput = `[Context: I'm asking about ${focusedCompanies.join(", ")}] ${inputValue}`;
    }

    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    try {
      await sendMessage({ text: finalInput });
    } catch (err) {
      console.error("[Chat] sendMessage failed:", err);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Proactive Alerts */}
      <ProactiveAlerts
        alerts={alerts}
        onAlertAction={(alert) => {
          onClearFocus();
          const prompts: Record<string, string> = {
            "Review offer details": `Tell me about the ${alert.company} offer and help me compare it with my other options.`,
            "Compare offers": `Compare the ${alert.company} offer with my other offers based on what matters to me.`,
            "Prep for interview": `Help me prep for my ${alert.company} interview.`,
            "Review posting": `What can you tell me about the ${alert.company} position?`,
            "Draft follow-up": `Draft a follow-up email to the ${alert.company} recruiter.`,
          };
          const prompt = prompts[alert.actionLabel || ""] || `Tell me about ${alert.company}`;
          setInputValue(prompt);
          setTimeout(() => {
            resizeTextarea();
            inputRef.current?.focus();
          }, 50);
        }}
        onFocusCompany={onToggleCompany}
      />

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Show saved messages from previous sessions */}
          {messages.length === 0 && savedMessages.length > 0 && (
            <div className="space-y-4">
              <div className="text-center text-xs text-gray-400 py-2">
                Previous conversation restored from InstantDB
              </div>
              {savedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5"
                        : "bg-white"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              <div className="text-center">
                <span className="inline-block text-[10px] text-gray-300 border-t border-gray-100 pt-2 px-4">
                  End of saved messages &middot; Continue the conversation below
                </span>
              </div>
            </div>
          )}

          {/* Empty state with suggestions or Load Sample Data CTA */}
          {messages.length === 0 && savedMessages.length === 0 && showSuggestions && (
            <div className="flex flex-col items-center h-full pt-6 sm:pt-[12vh]">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">
                Job Hunt Agent
              </h2>

              {!hasData && onLoadSampleData ? (
                <div className="flex flex-col items-center gap-4 mt-2 w-full max-w-md">
                  <p className="text-sm text-gray-500 text-center">
                    Get started by loading sample data &mdash; resumes, job postings, emails,
                    tracker entries, and notes &mdash; so you can explore what the agent can do.
                  </p>
                  <button
                    onClick={onLoadSampleData}
                    disabled={isLoadingSampleData}
                    className="relative flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-80 disabled:cursor-not-allowed"
                  >
                    {isLoadingSampleData ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Loading Sample Data...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Load Sample Data
                      </>
                    )}
                  </button>
                  {loadSampleDataStatus && (
                    <p className={`text-xs text-center ${loadSampleDataStatus.toLowerCase().includes("error") || loadSampleDataStatus.toLowerCase().includes("fail") ? "text-red-500" : "text-gray-500"}`}>
                      {loadSampleDataStatus}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
                    I have access to your job postings, emails, resume, tracker, and notes.
                    Ask me anything about your job search.{" "}
                    {onOpenSources && (
                      <button
                        onClick={onOpenSources}
                        className="text-blue-600 hover:text-blue-700 underline underline-offset-2 font-medium"
                      >
                        Add sources here
                      </button>
                    )}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSuggestedPrompt(prompt)}
                        className="text-left text-xs px-3 py-2.5 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition text-gray-600 hover:text-gray-800"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Live messages */}
          {messages.map((message) => {
            const textParts = message.parts.filter(
              (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
            );
            const textContent = textParts.map((p) => p.text).join("");
            const toolParts = message.parts.filter(
              (p) => p.type.startsWith("tool-") && p.type !== "tool-result"
            );

            return (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] ${
                    message.role === "user"
                      ? "bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5"
                      : "bg-white"
                  }`}
                >
                  {message.role === "user" ? (
                    <div className="flex items-start gap-1.5">
                      <p className="text-sm whitespace-pre-wrap flex-1">{textContent}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPromptDetail(textContent); setCopied(false); }}
                        className="shrink-0 mt-0.5 p-0.5 rounded text-white/40 hover:text-white/80 transition"
                        title="View full prompt"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div>
                      {(() => {
                        const hasDraftEmail = message.parts.some(
                          (p) => p.type.startsWith("tool-") && p.type.replace("tool-", "") === "draftEmail"
                        );
                        let seenDraftEmail = false;

                        return message.parts.map((part, i) => {
                          if (part.type.startsWith("tool-") && "toolCallId" in part) {
                            const toolPart = part as {
                              type: string;
                              toolCallId: string;
                              state: string;
                              input?: unknown;
                              output?: unknown;
                            };
                            const toolName = toolPart.type.replace("tool-", "");
                            if (toolName === "draftEmail") seenDraftEmail = true;
                            return (
                              <ToolCallDisplay
                                key={`${toolPart.toolCallId}-${i}`}
                                toolName={toolName}
                                args={(toolPart.input as Record<string, unknown>) || {}}
                                result={
                                  toolPart.state === "output-available"
                                    ? toolPart.output
                                    : undefined
                                }
                              />
                            );
                          }
                          if (part.type === "text" && part.text) {
                            if (hasDraftEmail && seenDraftEmail) return null;
                            return <MarkdownRenderer key={i} content={part.text} />;
                          }
                          return null;
                        });
                      })()}
                      {textParts.length === 0 && toolParts.length === 0 && (
                        <p className="text-sm text-gray-400 italic">Processing...</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Referenced conversation messages (injected from history) */}
          {referencedMessages.length > 0 && (
            <div ref={referencedRef} className="space-y-4 pt-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-50 text-orange-500 font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {referencedConvTitle || "From history"}
                </span>
                {onClearReference && (
                  <button
                    onClick={onClearReference}
                    className="p-0.5 rounded text-gray-400 hover:text-red-500 transition"
                    title="Dismiss"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>
              {referencedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-2xl rounded-br-md px-4 py-2.5"
                        : "bg-orange-50 border border-orange-100 rounded-2xl px-4 py-2.5"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              <div className="text-center">
                <span className="inline-block text-[10px] text-gray-300 border-t border-dashed border-gray-200 pt-2 px-4">
                  End of referenced conversation
                </span>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 px-4 py-2.5 text-gray-400">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {/* Error display */}
          {chatError && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <p className="font-medium">Error from chat API</p>
                <p className="text-xs mt-1 text-red-500">{chatError.message}</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Job Focus Chips */}
      {allCompanies.length > 0 && (
        <div className="px-3 sm:px-5 pt-2 pb-1 border-t border-gray-50 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider whitespace-nowrap flex-shrink-0">
                Focus:
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[...new Map(allCompanies.map((c) => [c.toLowerCase(), c])).values()]
                  .sort((a, b) => {
                    const aActive = focusedCompanies.includes(a) ? 0 : 1;
                    const bActive = focusedCompanies.includes(b) ? 0 : 1;
                    if (aActive !== bActive) return aActive - bActive;
                    return a.localeCompare(b);
                  })
                  .map((company) => {
                  const isActive = focusedCompanies.includes(company);
                  return (
                    <button
                      key={company}
                      onClick={() => onToggleCompany(company)}
                      className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap transition font-medium border ${
                        isActive
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                      }`}
                    >
                      {company}
                    </button>
                  );
                })}
              </div>
              {focusedCompanies.length > 0 && (
                <button
                  onClick={onClearFocus}
                  className="text-[11px] text-gray-400 hover:text-red-500 whitespace-nowrap transition flex-shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="shrink-0 px-3 sm:px-5 py-2 sm:py-3 bg-white border-t border-gray-100">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              placeholder={
                focusedCompanies.length > 0
                  ? `Ask about ${focusedCompanies.join(", ")}...`
                  : "Ask about your job search..."
              }
              rows={1}
              className="flex-1 min-w-0 resize-none border border-gray-200 rounded-xl px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              style={{ height: "40px", maxHeight: "80px" }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
          {focusedCompanies.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-1 ml-1">
              Scoped to: {focusedCompanies.join(", ")}
            </p>
          )}
        </form>
      </div>

      {/* Prompt detail dialog */}
      {promptDetail !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setPromptDetail(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-semibold text-gray-800">Full Prompt Sent</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(promptDetail);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                    copied
                      ? "bg-green-50 text-green-600 border border-green-200"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {copied ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setPromptDetail(null)}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                {promptDetail}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
