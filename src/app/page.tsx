"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage, Citation, PairedVerse } from "./types";
import { QiblaFinder } from "./qibla";
import { MessageBubble } from "./components/MessageBubble";
import { PrayerTimesWidget } from "./components/PrayerTimesWidget";
import { AyahExplorer } from "./components/AyahExplorer";
import { API_BASE } from "../lib/api";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"questions" | "explorer" | "qibla">("questions");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if there's a verse deep-link and switch to explorer tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const surahParam = params.get("surah");
    const ayahParam = params.get("ayah");
    if (surahParam && ayahParam) setActiveTab("explorer");
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle form submission with streaming
  const handleSubmit = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isLoading) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: "user", content: trimmedQuery };
    const assistantId = (Date.now() + 1).toString();
    const assistantPlaceholder: ChatMessage = { id: assistantId, role: "assistant", content: "", isLoading: true };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setQuery("");
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const history = messages
        .filter((msg) => msg.content && !msg.isLoading)
        .slice(-20)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: trimmedQuery, history }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Request failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let streamedContent = "";
      let context: PairedVerse[] = [];
      let citations: Citation[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "context") {
                  context = event.data;
                  setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, context, isLoading: false } : msg));
                } else if (event.type === "text") {
                  streamedContent += event.data;
                  setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, content: streamedContent } : msg));
                } else if (event.type === "done") {
                  citations = event.data.citations;
                  setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, citations, isLoading: false } : msg));
                } else if (event.type === "error") {
                  throw new Error(event.data);
                }
              } catch {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text") {
                streamedContent += event.data;
                setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, content: streamedContent } : msg));
              } else if (event.type === "done") {
                citations = event.data.citations;
                setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, citations, isLoading: false } : msg));
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `I apologize, but I encountered an error: ${errorMessage}`, isLoading: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isLandingMode = messages.length === 0;

  return (
    <div className="flex min-h-svh flex-col">
      {/* Tabs - always show */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between h-14 relative">
            <div className="flex items-center gap-6 sm:gap-8">
              {(
                [
                  {
                    id: "questions",
                    label: "Ask Questions",
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    ),
                  },
                  {
                    id: "explorer",
                    label: "Ayah Explorer",
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    ),
                  },
                  {
                    id: "qibla",
                    label: "Qibla",
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                      </svg>
                    ),
                  },
                ] as { id: "questions" | "explorer" | "qibla"; label: string; icon: React.ReactNode }[]
              ).map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative px-1 py-2 text-[13px] font-medium transition-all duration-300 ${
                    activeTab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  <span className="sm:hidden">{icon}</span>
                  <span className="hidden sm:inline">{label}</span>
                  {activeTab === id && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: "var(--gold)" }} />
                  )}
                </button>
              ))}
            </div>
            <PrayerTimesWidget />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-border/30" />
      </div>

      {/* Header - only show when in chat mode */}
      {!isLandingMode && activeTab === "questions" && (
        <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M12 7c2.5-2 5-2 7 0" />
                <path d="M12 12c2.5-2 5-2 7 0" />
                <path d="M12 17c2.5-2 5-2 7 0" />
                <path d="M12 7c-2.5-2-5-2-7 0" />
                <path d="M12 12c-2.5-2-5-2-7 0" />
                <path d="M12 17c-2.5-2-5-2-7 0" />
              </svg>
              <span className="font-display text-base font-normal tracking-widest uppercase" style={{ letterSpacing: "0.2em" }}>Hidayah</span>
            </button>
            <button
              onClick={() => setMessages([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              New chat
            </button>
          </div>
        </header>
      )}

      {/* Main content area */}
      <main
        className={`flex-1 ${
          activeTab === "qibla"
            ? "flex flex-col"
            : isLandingMode && activeTab === "questions"
            ? "flex items-center justify-center"
            : "pb-32"
        }`}
      >
        {activeTab === "qibla" ? (
          <QiblaFinder />
        ) : activeTab === "explorer" ? (
          <AyahExplorer />
        ) : isLandingMode ? (
          <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex flex-col items-center gap-3">
                <p
                  className="font-arabic text-6xl sm:text-7xl md:text-8xl"
                  dir="rtl"
                  style={{ color: "var(--gold)", lineHeight: "1.5", opacity: 0.88 }}
                >
                  هداية
                </p>
                <h1
                  className="font-display text-base sm:text-xl md:text-2xl font-light text-foreground/70"
                  style={{ letterSpacing: "0.4em", textTransform: "uppercase" }}
                >
                  Hidayah
                </h1>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 text-center animate-fade-in animation-delay-100">
              <p className="text-[15px] text-muted leading-relaxed max-w-md">
                Ask a question and receive guidance from the Quran with authentic citations.
              </p>
            </div>

            <div className="w-full animate-fade-in animation-delay-200">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-foreground/[0.03] to-foreground/[0.06] rounded-2xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="What does the Quran say about..."
                    rows={1}
                    className="w-full min-h-[56px] max-h-[200px] resize-none overflow-hidden rounded-2xl border border-border/80 bg-background px-5 py-4 pr-14 text-base text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                    }}
                  />
                  <div className="absolute right-3 inset-y-0 flex items-center mb-1">
                    <button
                      type="button"
                      disabled={!query.trim() || isLoading}
                      onClick={handleSubmit}
                      className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground text-background transition-all duration-200 hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-foreground"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[13px] text-muted-foreground/50 animate-fade-in animation-delay-300">
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-foreground/[0.04] dark:bg-foreground/[0.08] font-mono text-[11px]">
                Enter
              </kbd>{" "}
              to ask
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Fixed input at bottom - only show in chat mode */}
      {!isLandingMode && activeTab === "questions" && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border/50 bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a follow-up question..."
                rows={1}
                disabled={isLoading}
                className="w-full min-h-[48px] max-h-[120px] resize-none rounded-xl border border-border/80 bg-background px-4 py-3 pr-12 text-base text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none disabled:opacity-50"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
              />
              <div className="absolute right-2 inset-y-0 flex items-center">
                <button
                  type="button"
                  disabled={!query.trim() || isLoading}
                  onClick={handleSubmit}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground text-background transition-all duration-200 hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer - only in landing mode */}
      {isLandingMode && activeTab === "questions" && (
        <footer className="fixed bottom-0 left-0 right-0 py-6 text-center">
          <p className="text-[12px] text-muted-foreground/40 tracking-wide">
            Answers are AI-generated. Always verify with a scholar.
          </p>
        </footer>
      )}
    </div>
  );
}
