"use client";

import { useState, useRef, useEffect } from "react";

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
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message: trimmedQuery }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

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
      {/* Header - only show when in chat mode */}
      {!isLandingMode && (
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
          isLandingMode
            ? "flex items-center justify-center"
            : "pb-32"
        }`}
      >
        {isLandingMode ? (
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
                    className="w-full min-h-[56px] max-h-[200px] resize-none rounded-2xl border border-border/80 bg-background px-5 py-4 pr-14 text-[15px] text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none"
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
                  <div className="absolute right-3 bottom-3">
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
      {!isLandingMode && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl px-4 py-4">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a follow-up question..."
                rows={1}
                disabled={isLoading}
                className="w-full min-h-[48px] max-h-[120px] resize-none rounded-xl border border-border/80 bg-background px-4 py-3 pr-12 text-[15px] text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none disabled:opacity-50"
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
              <div className="absolute right-2 bottom-2">
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
      {isLandingMode && (
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
                <MarkdownRenderer content={message.content} />
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
function MarkdownRenderer({ content }: { content: string }) {
  // Split into paragraphs and render
  const paragraphs = content.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((paragraph, i) => {
        // Handle headers
        if (paragraph.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-semibold mt-4 mb-2">
              {paragraph.slice(4)}
            </h3>
          );
        }
        if (paragraph.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-semibold mt-4 mb-2">
              {paragraph.slice(3)}
            </h2>
          );
        }

        // Handle lists
        if (paragraph.match(/^[-*•]\s/m)) {
          const items = paragraph.split(/\n/).filter((line) => line.trim());
          return (
            <ul key={i} className="list-disc list-inside space-y-1 my-2">
              {items.map((item, j) => (
                <li key={j} className="text-[15px] leading-relaxed">
                  {item.replace(/^[-*•]\s*/, "")}
                </li>
              ))}
            </ul>
          );
        }

        // Regular paragraph with inline formatting
        return (
          <p key={i} className="text-[15px] leading-relaxed my-2">
            <InlineFormatting text={paragraph} />
          </p>
        );
      })}
    </>
  );
}

// Inline formatting (bold, citations)
function InlineFormatting({ text }: { text: string }) {
  // Combined pattern for both bold and citations
  // Citations: (2:153), (16:127; 70:5), (4:11), (4:12)
  // Bold: **text**
  const tokenPattern = /(\*\*[^*]+\*\*|\(\d+:\d+(?:[;,]\s*\d+:\d+)*\))/g;
  const parts = text.split(tokenPattern).filter(Boolean);

  return (
    <>
      {parts.map((part, i) => {
        // Check if it's a citation
        if (/^\(\d+:\d+(?:[;,]\s*\d+:\d+)*\)$/.test(part)) {
          return (
            <span
              key={i}
              className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded bg-foreground/[0.04] dark:bg-foreground/[0.08] font-mono text-xs text-muted-foreground"
            >
              {part}
            </span>
          );
        }
        // Check if it's bold text
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        // Regular text
        return <span key={i}>{part}</span>;
      })}
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
