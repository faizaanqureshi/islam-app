"use client";

import { useState } from "react";
import type { PairedVerse } from "../types";

export function ContextExpander({ context }: { context: PairedVerse[] }) {
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
                <span className="font-mono text-xs text-muted-foreground">{verse.ref}</span>
                <span className="text-[10px] text-muted-foreground/60">
                  {(verse.similarity * 100).toFixed(0)}% match
                </span>
              </div>
              {verse.arabic && (
                <p className="text-right font-arabic text-base leading-loose text-foreground/90 mb-2" dir="rtl">
                  {verse.arabic}
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">{verse.english}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
