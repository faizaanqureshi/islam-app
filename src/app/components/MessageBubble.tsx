"use client";

import type { ChatMessage } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ContextExpander } from "./ContextExpander";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`mb-6 ${isUser ? "flex justify-end" : ""}`}>
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl bg-foreground text-background px-4 py-3">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      ) : (
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
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={message.content} context={message.context} />
              </div>

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

              {message.citations && message.citations.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">Referenced verses:</p>
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
