"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

// Types for the chat
interface Citation {
  surah: number;
  ayah: number;
}

interface PairedVerse {
  ref: string;
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  context?: PairedVerse[];
  uncertainty?: string | null;
  isLoading?: boolean;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"questions" | "explorer">("questions");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if there's a verse deep-link and switch to explorer tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const surahParam = params.get('surah');
    const ayahParam = params.get('ayah');

    if (surahParam && ayahParam) {
      setActiveTab("explorer");
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle form submission with streaming
  const handleSubmit = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedQuery,
    };

    // Add placeholder for assistant response
    const assistantId = (Date.now() + 1).toString();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setQuery("");
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // Build conversation history from previous messages (last 10 exchanges max)
      const history = messages
        .filter((msg) => msg.content && !msg.isLoading)
        .slice(-20)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message: trimmedQuery, history }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Request failed");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let streamedContent = "";
      let context: PairedVerse[] = [];
      let citations: Citation[] = [];
      let buffer = ""; // Buffer for incomplete SSE events

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events (ending with \n\n)
        const events = buffer.split("\n\n");
        // Keep the last potentially incomplete event in the buffer
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));

                if (event.type === "context") {
                  context = event.data;
                  // Update with context, stop loading indicator
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? { ...msg, context, isLoading: false }
                        : msg
                    )
                  );
                } else if (event.type === "text") {
                  streamedContent += event.data;
                  // Update content progressively
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? { ...msg, content: streamedContent }
                        : msg
                    )
                  );
                } else if (event.type === "done") {
                  citations = event.data.citations;
                  // Final update with citations
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? { ...msg, citations, isLoading: false }
                        : msg
                    )
                  );
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

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text") {
                streamedContent += event.data;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: streamedContent }
                      : msg
                  )
                );
              } else if (event.type === "done") {
                citations = event.data.citations;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, citations, isLoading: false }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      // Handle error
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: `I apologize, but I encountered an error: ${errorMessage}`,
                isLoading: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we're in landing mode (no messages)
  const isLandingMode = messages.length === 0;

  return (
    <div className="flex min-h-svh flex-col">
      {/* Tabs - always show */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex items-center gap-8 h-14 relative">
            <button
              onClick={() => setActiveTab("questions")}
              className={`relative px-1 py-2 text-[13px] font-medium transition-all duration-300 ${
                activeTab === "questions"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              Ask Questions
              {activeTab === "questions" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("explorer")}
              className={`relative px-1 py-2 text-[13px] font-medium transition-all duration-300 ${
                activeTab === "explorer"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              Ayah Explorer
              {activeTab === "explorer" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground rounded-full" />
              )}
            </button>
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
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v18" />
                <path d="M12 7c2.5-2 5-2 7 0" />
                <path d="M12 12c2.5-2 5-2 7 0" />
                <path d="M12 17c2.5-2 5-2 7 0" />
                <path d="M12 7c-2.5-2-5-2-7 0" />
                <path d="M12 12c-2.5-2-5-2-7 0" />
                <path d="M12 17c-2.5-2-5-2-7 0" />
              </svg>
              <span className="font-medium text-sm">Hidayah</span>
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
          isLandingMode && activeTab === "questions"
            ? "flex items-center justify-center"
            : "pb-32"
        }`}
      >
        {activeTab === "explorer" ? (
          // Ayah Explorer view
          <AyahExplorer />
        ) : isLandingMode ? (
          // Landing mode - centered content
          <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-6">
            {/* Logo / Title */}
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-foreground/[0.03] dark:bg-foreground/[0.06] border border-border/50">
                <svg
                  className="w-6 h-6 text-foreground/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M12 7c2.5-2 5-2 7 0" />
                  <path d="M12 12c2.5-2 5-2 7 0" />
                  <path d="M12 17c2.5-2 5-2 7 0" />
                  <path d="M12 7c-2.5-2-5-2-7 0" />
                  <path d="M12 12c-2.5-2-5-2-7 0" />
                  <path d="M12 17c-2.5-2-5-2-7 0" />
                </svg>
              </div>
              <h1 className="text-xl font-medium tracking-tight text-foreground">
                Hidayah
              </h1>
            </div>

            {/* Tagline */}
            <div className="flex flex-col items-center gap-2 text-center animate-fade-in animation-delay-100">
              <p className="text-[15px] text-muted leading-relaxed max-w-md">
                Ask a question and receive guidance from the Quran with authentic
                citations.
              </p>
            </div>

            {/* Input area */}
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
                    className="w-full min-h-[56px] max-h-[200px] resize-none rounded-2xl border border-border/80 bg-background px-5 py-4 pr-14 text-base text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                  <div className="absolute right-3 inset-y-0 flex items-center">
                    <button
                      type="button"
                      disabled={!query.trim() || isLoading}
                      onClick={handleSubmit}
                      className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground text-background transition-all duration-200 hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-foreground"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Subtle hint */}
            <p className="text-[13px] text-muted-foreground/50 animate-fade-in animation-delay-300">
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-foreground/[0.04] dark:bg-foreground/[0.08] font-mono text-[11px]">
                Enter
              </kbd>{" "}
              to ask
            </p>
          </div>
        ) : (
          // Chat mode - message list
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
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
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
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
                  ) : (
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
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

// Message bubble component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`mb-6 ${isUser ? "flex justify-end" : ""}`}
    >
      {isUser ? (
        // User message
        <div className="max-w-[85%] rounded-2xl bg-foreground text-background px-4 py-3">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      ) : (
        // Assistant message
        <div className="space-y-4">
          {message.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-sm">Searching the Quran...</span>
            </div>
          ) : (
            <>
              {/* Main answer */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={message.content} context={message.context} />
              </div>

              {/* Uncertainty notice */}
              {message.uncertainty && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-sm">{message.uncertainty}</p>
                </div>
              )}

              {/* Citations */}
              {message.citations && message.citations.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    Referenced verses:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {message.citations.map((citation, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/[0.04] dark:bg-foreground/[0.08] text-xs font-mono text-muted-foreground"
                      >
                        {citation.surah}:{citation.ayah}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Expandable context */}
              {message.context && message.context.length > 0 && (
                <ContextExpander context={message.context} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Simple markdown renderer (handles basic formatting)
function MarkdownRenderer({ content, context }: { content: string; context?: PairedVerse[] }) {
  // Normalize line endings and split into paragraphs
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by double newlines, but also handle single newlines before numbered/bullet lists
  const paragraphs = normalizedContent
    .split(/\n\n+/)
    .flatMap(p => {
      // If paragraph contains a header followed by list items, split them
      const headerMatch = p.match(/^(.+?)\n(\d+[.)]\s.+)/s);
      if (headerMatch && !headerMatch[1].match(/^\d+[.)]\s/)) {
        return [headerMatch[1], headerMatch[2]];
      }
      return [p];
    });

  return (
    <>
      {paragraphs.map((paragraph, i) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        // Handle markdown headers
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(4)} context={context} />
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(3)} context={context} />
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} className="text-xl font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(2)} context={context} />
            </h1>
          );
        }

        // Handle numbered lists (1), 2), 1., 2., etc.)
        if (trimmed.match(/^\d+[.)]\s/m)) {
          // Split by newlines and also by pattern like "1) " at start of segments
          const items = trimmed
            .split(/\n/)
            .filter((line) => line.trim())
            .flatMap(line => {
              // Check if line contains multiple numbered items
              const multiMatch = line.match(/^(\d+[.)]\s.+?)(?=\s+\d+[.)]\s|$)/g);
              return multiMatch && multiMatch.length > 1 ? multiMatch : [line];
            })
            .filter(line => line.match(/^\d+[.)]\s/));
          
          if (items.length > 0) {
            return (
              <ol key={i} className="list-none space-y-4 my-4">
                {items.map((item, j) => (
                  <li key={j} className="text-[15px] leading-relaxed">
                    <InlineFormatting text={item.replace(/^\d+[.)]\s*/, "")} context={context} />
                  </li>
                ))}
              </ol>
            );
          }
        }

        // Handle bullet lists
        if (trimmed.match(/^[-*•]\s/m)) {
          const items = trimmed.split(/\n/).filter((line) => line.trim() && line.match(/^[-*•]\s/));
          if (items.length > 0) {
            return (
              <ul key={i} className="list-disc list-inside space-y-1 my-2">
                {items.map((item, j) => (
                  <li key={j} className="text-[15px] leading-relaxed">
                    <InlineFormatting text={item.replace(/^[-*•]\s*/, "")} context={context} />
                  </li>
                ))}
              </ul>
            );
          }
        }

        // Regular paragraph with inline formatting
        return (
          <p key={i} className="text-[15px] leading-relaxed my-3">
            <InlineFormatting text={trimmed} context={context} />
          </p>
        );
      })}
    </>
  );
}

// Inline formatting (bold, citations with hover tooltips)
function InlineFormatting({ text, context }: { text: string; context?: PairedVerse[] }) {
  // Combined pattern for bold and citations
  // Bold: **text** (allowing asterisks inside by using lazy match)
  // Citations: (2:153), (16:127; 70:5), (4:11, 4:12), (2:231-232), (4:23–24)
  // Note: handles both hyphen (-) and en-dash (–) for ranges
  const tokenPattern = /(\*\*.+?\*\*|\(\d+:\d+(?:[-–]\d+)?(?:[;,]\s*\d+:\d+(?:[-–]\d+)?)*\))/g;
  const parts = text.split(tokenPattern).filter(Boolean);

  // Helper to find verse in context
  const findVerse = (surah: number, ayah: number): PairedVerse | undefined => {
    return context?.find((v) => v.surah === surah && v.ayah === ayah);
  };

  // Parse citations from a citation string like "(2:153)", "(16:127; 70:5)", or "(2:231-232)"
  // Returns expanded list of all individual verses (ranges are expanded)
  const parseCitationString = (citationStr: string): Array<{ surah: number; ayah: number }> => {
    const refs: Array<{ surah: number; ayah: number }> = [];
    // Match patterns like "2:153" or "2:231-232" or "2:231–232" (en-dash)
    const matches = citationStr.matchAll(/(\d+):(\d+)(?:[-–](\d+))?/g);
    for (const match of matches) {
      const surah = parseInt(match[1]);
      const startAyah = parseInt(match[2]);
      const endAyah = match[3] ? parseInt(match[3]) : startAyah;
      
      // Expand range into individual verses
      for (let ayah = startAyah; ayah <= endAyah; ayah++) {
        refs.push({ surah, ayah });
      }
    }
    return refs;
  };

  // Check if citation contains any ranges
  const citationHasRange = (citationStr: string): boolean => {
    return /\d+:\d+[-–]\d+/.test(citationStr);
  };

  return (
    <>
      {parts.map((part, i) => {
        // Check if it's a citation (updated pattern to include ranges)
        if (/^\(\d+:\d+(?:[-–]\d+)?(?:[;,]\s*\d+:\d+(?:[-–]\d+)?)*\)$/.test(part)) {
          const refs = parseCitationString(part);
          const verses = refs.map((r) => findVerse(r.surah, r.ayah)).filter(Boolean) as PairedVerse[];
          const hasRange = citationHasRange(part);

          // Always render citation badge, even if verse not in context
          return (
            <CitationWithTooltip 
              key={i} 
              citation={part} 
              verses={verses} 
              verseRefs={refs}
              hasRange={hasRange}
            />
          );
        }
        // Check if it's bold text - use semibold for subtler emphasis
        if (part.startsWith("**") && part.endsWith("**")) {
          return <span key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</span>;
        }
        // Regular text
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Extended verse type that includes fetched verses (may not have similarity)
interface ExtendedVerse {
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity?: number;
}

// Citation with click-to-open modal
function CitationWithTooltip({ 
  citation, 
  verses, 
  verseRefs,
  hasRange 
}: { 
  citation: string; 
  verses: PairedVerse[];
  verseRefs: Array<{ surah: number; ayah: number }>;
  hasRange: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextData, setContextData] = useState<Record<string, VerseContext | null>>({});
  const [loadingContext, setLoadingContext] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [allVerses, setAllVerses] = useState<ExtendedVerse[]>([]);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  // Total number of verses in this citation (for ranges)
  const totalVerses = verseRefs.length;

  // Detect mobile on mount
  useEffect(() => {
    // Schedule mount state update to avoid synchronous setState in effect
    queueMicrotask(() => setMounted(true));
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch all verses (including those not in context) when opening
  const fetchAllVerses = async () => {
    if (allVerses.length > 0) return; // Already fetched
    
    setLoadingVerses(true);
    const fetchedVerses: ExtendedVerse[] = [];

    for (const ref of verseRefs) {
      // First check if verse is in the context
      const existingVerse = verses.find(v => v.surah === ref.surah && v.ayah === ref.ayah);
      if (existingVerse) {
        fetchedVerses.push({
          surah: existingVerse.surah,
          ayah: existingVerse.ayah,
          arabic: existingVerse.arabic,
          english: existingVerse.english,
          similarity: existingVerse.similarity,
        });
      } else {
        // Fetch from API
        try {
          const res = await fetch(`/api/quran/ayah?surah=${ref.surah}&ayah=${ref.ayah}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              fetchedVerses.push({
                surah: ref.surah,
                ayah: ref.ayah,
                arabic: data.data.arabic || "",
                english: data.data.english || "",
              });
            }
          }
        } catch {
          // If fetch fails, add placeholder
          fetchedVerses.push({
            surah: ref.surah,
            ayah: ref.ayah,
            arabic: "",
            english: "Unable to load verse",
          });
        }
      }
    }

    setAllVerses(fetchedVerses);
    setLoadingVerses(false);
  };

  // Fetch context data for current verse
  const fetchContext = async () => {
    const versesToFetch = allVerses.length > 0 ? allVerses : verses;
    if (versesToFetch.length === 0) return;

    const currentVerse = versesToFetch[currentVerseIndex];
    if (!currentVerse) return;

    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    if (contextData[key] !== undefined) return; // Already fetched

    setLoadingContext(true);
    try {
      const res = await fetch(`/api/quran/context?surah=${currentVerse.surah}&ayah=${currentVerse.ayah}`);
      if (res.ok) {
        const data = await res.json();
        setContextData(prev => ({
          ...prev,
          [key]: data.success && data.data ? data.data : null,
        }));
      } else {
        setContextData(prev => ({ ...prev, [key]: null }));
      }
    } catch {
      setContextData(prev => ({ ...prev, [key]: null }));
    }
    setLoadingContext(false);
  };

  // Fetch context when current verse changes
  useEffect(() => {
    if (isOpen && (allVerses.length > 0 || verses.length > 0)) {
      fetchContext();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVerseIndex, isOpen, allVerses]);

  // Click handler for opening modal (works for both desktop and mobile)
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
    if (hasRange || verses.length === 0) {
      await fetchAllVerses();
    }
    fetchContext();
  };

  // Navigation handlers
  const goToPrevVerse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentVerseIndex(prev => Math.max(0, prev - 1));
  };

  const goToNextVerse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentVerseIndex(prev => Math.min(totalVerses - 1, prev + 1));
  };

  // Reset verse index when closing
  const handleClose = () => {
    setIsOpen(false);
    setCurrentVerseIndex(0);
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store current scroll position
      const scrollY = window.scrollY;
      
      // Lock body scroll (works on most browsers)
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      
      return () => {
        // Restore scroll position
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Get current verse to display
  const versesToShow = allVerses.length > 0 ? allVerses : verses;
  const currentVerse = versesToShow[currentVerseIndex];

  // Tooltip/Modal content - now shows one verse at a time with navigation for ranges
  const renderContent = () => {
    if (loadingVerses) {
      return (
        <div className="p-4 flex items-center justify-center">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-zinc-500/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-zinc-500/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-zinc-500/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      );
    }

    if (!currentVerse) {
      return (
        <div className="p-4 text-sm text-zinc-500">
          Unable to load verse
        </div>
      );
    }

    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    const context = contextData[key];

    return (
      <div className="p-4">
        {/* Navigation header for ranges */}
        {totalVerses > 1 && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-700/30">
            <button
              onClick={goToPrevVerse}
              disabled={currentVerseIndex === 0}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-4 h-4 text-zinc-600 dark:text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {currentVerseIndex + 1} / {totalVerses}
            </span>
            <button
              onClick={goToNextVerse}
              disabled={currentVerseIndex === totalVerses - 1}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-4 h-4 text-zinc-600 dark:text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        {/* Verse reference with theme */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
              Surah {currentVerse.surah}, Ayah {currentVerse.ayah}
            </span>
            {context?.theme && (
              <>
                <span className="text-zinc-400 dark:text-zinc-600 hidden sm:inline">•</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
                  {context.theme}
                </span>
              </>
            )}
          </div>
          {currentVerse.similarity !== undefined && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
              {(currentVerse.similarity * 100).toFixed(0)}% match
            </span>
          )}
        </div>

        {/* Arabic text */}
        {currentVerse.arabic && (
          <p
            className="text-lg sm:text-xl leading-loose text-zinc-900 dark:text-zinc-100 mb-3 font-arabic text-right"
            dir="rtl"
          >
            {currentVerse.arabic}
          </p>
        )}

        {/* English translation */}
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 mb-3">
          {currentVerse.english}
        </p>

        {/* Context information */}
        {loadingContext && context === undefined && (
          <div className="text-xs text-zinc-500 italic">
            Loading context...
          </div>
        )}

        {context && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700/30 space-y-2">
            {context.context_summary && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Context
                </div>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {context.context_summary}
                </p>
              </div>
            )}

            {context.asbab_summary && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Occasion
                </div>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {context.asbab_summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Determine if we have content to show
  const hasContent = verseRefs.length > 0;

  return (
    <>
      <span
        ref={triggerRef}
        onClick={hasContent ? handleClick : undefined}
        className={`inline-flex items-center px-1 py-0.5 mx-0.5 rounded bg-foreground/[0.04] dark:bg-foreground/[0.08] font-mono text-xs text-muted-foreground transition-colors ${
          hasContent
            ? "cursor-pointer hover:bg-foreground/[0.08] dark:hover:bg-foreground/[0.12]"
            : "cursor-default"
        }`}
        title={!hasContent ? "Verse preview not available" : undefined}
      >
        {citation}
      </span>

      {/* Modal (both desktop and mobile) */}
      {mounted && isOpen && hasContent && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={handleClose}
          style={{ 
            display: 'flex', 
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobile ? 0 : '1rem'
          }}
        >
          <div
            className={`relative bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden ${
              isMobile 
                ? "w-full max-h-[85vh] border-t border-zinc-200 dark:border-zinc-700/50 rounded-t-2xl animate-slide-up" 
                : "w-full max-w-lg max-h-[80vh] border border-zinc-200 dark:border-zinc-700/50 rounded-2xl animate-fade-in"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with citation and close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">{citation}</span>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg
                  className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className={`overflow-y-auto ${isMobile ? "max-h-[calc(85vh-56px)]" : "max-h-[calc(80vh-56px)]"}`}>
              {renderContent()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Expandable context section
function ContextExpander({ context }: { context: PairedVerse[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        View source verses ({context.length})
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {context.map((verse, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-foreground/[0.02] dark:bg-foreground/[0.04] border border-border/50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {verse.ref}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {(verse.similarity * 100).toFixed(0)}% match
                </span>
              </div>
              {verse.arabic && (
                <p
                  className="text-right font-arabic text-base leading-loose text-foreground/90 mb-2"
                  dir="rtl"
                >
                  {verse.arabic}
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {verse.english}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ayah Explorer Component
interface Surah {
  number: number;
  name: string;
  transliteration: string;
  verses: number;
}

interface Verse {
  ayah: number;
  arabic: string;
  english: string;
}

interface VerseContext {
  theme: string | null;
  context_summary: string;
  asbab_summary: string | null;
  scholarly_notes: string | null;
}

interface VerseModalProps {
  verse: {
    surah: number;
    ayah: number;
    arabic: string;
    english: string;
  };
  onClose: () => void;
}

function AyahExplorer() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [, setIsLoadingSurahs] = useState(true);
  const [isLoadingVerses, setIsLoadingVerses] = useState(true);
  const [selectedVerse, setSelectedVerse] = useState<{
    surah: number;
    ayah: number;
    arabic: string;
    english: string;
  } | null>(null);
  const [urlKey, setUrlKey] = useState(0); // Track URL changes

  // Listen for URL changes (popstate for back/forward, and manual checks)
  useEffect(() => {
    const handleUrlChange = () => {
      setUrlKey(prev => prev + 1);
    };

    // Listen to browser back/forward
    window.addEventListener('popstate', handleUrlChange);

    // Check URL periodically for manual changes (as a fallback)
    const interval = setInterval(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('surah') || params.get('ayah')) {
        handleUrlChange();
      }
    }, 500);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      clearInterval(interval);
    };
  }, []);

  // Check URL params for deep-linked verse
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const surahParam = params.get('surah');
    const ayahParam = params.get('ayah');

    if (surahParam && ayahParam && verses.length > 0 && !isLoadingVerses) {
      const surah = parseInt(surahParam);
      const ayah = parseInt(ayahParam);

      if (!isNaN(surah) && !isNaN(ayah)) {
        // Update selected surah if different
        if (surah !== selectedSurah) {
          setSelectedSurah(surah);
          return; // Wait for verses to reload
        }

        const verse = verses.find(v => v.ayah === ayah);
        if (verse) {
          setSelectedVerse({
            surah,
            ayah,
            arabic: verse.arabic,
            english: verse.english,
          });
        }
      }
    }
  }, [verses, isLoadingVerses, urlKey, selectedSurah]);

  // Fetch surahs list on mount
  useEffect(() => {
    async function fetchSurahs() {
      try {
        const response = await fetch("/api/quran/surahs");
        const data = await response.json();
        if (data.success) {
          setSurahs(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch surahs:", error);
      } finally {
        setIsLoadingSurahs(false);
      }
    }
    fetchSurahs();
  }, []);

  // Fetch verses when surah changes
  useEffect(() => {
    async function fetchVerses() {
      setIsLoadingVerses(true);
      try {
        const response = await fetch(`/api/quran/surah/${selectedSurah}`);
        const data = await response.json();
        if (data.success) {
          setVerses(data.data.verses);
        }
      } catch (error) {
        console.error("Failed to fetch verses:", error);
      } finally {
        setIsLoadingVerses(false);
      }
    }
    fetchVerses();
  }, [selectedSurah]);

  const currentSurah = surahs.find((s) => s.number === selectedSurah);

  return (
    <>
      <div className="min-h-[calc(100vh-3.5rem)] bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Surah Selector */}
        <div className="mb-8 animate-fade-in">
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-3 font-medium">
            Select Surah
          </label>
          <select
            value={selectedSurah}
            onChange={(e) => setSelectedSurah(Number(e.target.value))}
            className="w-full max-w-md px-4 py-3 rounded-xl border border-border/80 bg-background text-[15px] text-foreground transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none"
          >
            {surahs.map((surah) => (
              <option key={surah.number} value={surah.number}>
                {surah.number}. {surah.name} ({surah.transliteration}) - {surah.verses} verses
              </option>
            ))}
          </select>
        </div>

        {/* Surah Header */}
        {currentSurah && !isLoadingVerses && (
          <div className="mb-8 text-center animate-fade-in">
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              {currentSurah.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentSurah.transliteration}
            </p>
            <div className="mt-4 w-16 h-[1px] bg-border/50 mx-auto" />
          </div>
        )}

        {/* Loading State */}
        {isLoadingVerses && (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Verses */}
        {!isLoadingVerses && (
          <div className="space-y-8 animate-fade-in">
            {verses.map((verse) => (
              <div key={verse.ayah} className="group relative" data-ayah={verse.ayah}>
                {/* Ayah Number Badge */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-foreground/[0.04] dark:bg-foreground/[0.06] border border-border/50">
                    <span className="text-xs font-medium text-muted-foreground">
                      {verse.ayah}
                    </span>
                  </div>
                  <div className="flex-1 h-[1px] bg-border/30" />
                </div>

                {/* Clickable verse content */}
                <div
                  className="cursor-pointer transition-all duration-200 hover:opacity-70"
                  onClick={() =>
                    setSelectedVerse({
                      surah: selectedSurah,
                      ayah: verse.ayah,
                      arabic: verse.arabic,
                      english: verse.english,
                    })
                  }
                >
                  {/* Arabic Text */}
                  {verse.arabic && (
                    <p
                      className="text-right font-arabic text-2xl leading-loose text-foreground mb-6"
                      dir="rtl"
                    >
                      {verse.arabic}
                    </p>
                  )}

                  {/* English Translation */}
                  <p className="text-[15px] leading-relaxed text-muted-foreground">
                    {verse.english}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Verse Detail Modal - Outside container for proper centering */}
      {selectedVerse && (
        <VerseModal
          verse={selectedVerse}
          onClose={() => {
            setSelectedVerse(null);
            // Clear URL parameters when closing modal
            const url = new URL(window.location.href);
            url.searchParams.delete('surah');
            url.searchParams.delete('ayah');
            window.history.replaceState({}, '', url.toString());
          }}
        />
      )}
    </>
  );
}

// Verse Detail Modal Component
function VerseModal({ verse, onClose }: VerseModalProps) {
  const [context, setContext] = useState<VerseContext | null>(null);
  const [city, setCity] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Copy share link to clipboard
  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?surah=${verse.surah}&ayah=${verse.ayah}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    async function fetchVerseDetails() {
      setIsLoading(true);
      try {
        // Fetch surah origins
        const originsRes = await fetch("/surah-origins.json");
        const origins = await originsRes.json();
        setCity(origins[verse.surah] || "");

        // Try to get context from verse_context table via API
        const ctxRes = await fetch(
          `/api/quran/context?surah=${verse.surah}&ayah=${verse.ayah}`
        );
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (ctxData.success && ctxData.data) {
            setContext(ctxData.data);
          }
        }
      } catch (error) {
        console.error("Failed to fetch verse details:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchVerseDetails();
  }, [verse.surah, verse.ayah]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed top-0 left-0 w-screen h-screen z-[9999] bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      style={{
        display: 'grid',
        placeItems: 'center',
        margin: 0,
        padding: '1rem'
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-background border border-border/50 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          {/* Copy link button */}
          <button
            onClick={copyShareLink}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/[0.06] transition-colors"
            title="Copy share link"
          >
            {copied ? (
              <svg
                className="w-4 h-4 text-green-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/[0.06] transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">
                Surah {verse.surah}:{verse.ayah}
              </span>
              {city && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {city}
                  </span>
                </>
              )}
              {context?.theme && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-xs px-2 py-1 rounded-md bg-foreground/[0.04] dark:bg-foreground/[0.06] text-muted-foreground">
                    {context.theme}
                  </span>
                </>
              )}
            </div>
            <div className="h-[1px] bg-border/30" />
          </div>

          {/* Arabic Text */}
          <p
            className="text-right font-arabic text-3xl leading-loose text-foreground mb-8"
            dir="rtl"
          >
            {verse.arabic}
          </p>

          {/* English Translation */}
          <p className="text-base leading-relaxed text-muted-foreground mb-8">
            {verse.english}
          </p>

          {/* Context Section */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : context ? (
            <div className="space-y-6">
              <div className="h-[1px] bg-border/30" />

              {/* Context Summary */}
              {context.context_summary && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    Context
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {context.context_summary}
                  </p>
                </div>
              )}

              {/* Asbab al-Nuzul */}
              {context.asbab_summary && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    Occasion of Revelation
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {context.asbab_summary}
                  </p>
                </div>
              )}

              {/* Scholarly Notes (Collapsible) */}
              {context.scholarly_notes && (
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-foreground mb-3 flex items-center gap-2 hover:text-foreground/80 transition-colors">
                    <svg
                      className="w-3 h-3 transition-transform group-open:rotate-90"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Scholarly Notes
                  </summary>
                  <p className="text-sm leading-relaxed text-muted-foreground pl-5">
                    {context.scholarly_notes}
                  </p>
                </details>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground/60">
                No contextual information available for this verse.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
