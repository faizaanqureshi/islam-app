"use client";

import type { PairedVerse } from "../types";
import { CitationWithTooltip } from "./CitationWithTooltip";

function parseCitationString(citationStr: string): Array<{ surah: number; ayah: number }> {
  const refs: Array<{ surah: number; ayah: number }> = [];
  const matches = citationStr.matchAll(/(\d+):(\d+)(?:[-–](\d+))?/g);
  for (const match of matches) {
    const surah = parseInt(match[1]);
    const startAyah = parseInt(match[2]);
    const endAyah = match[3] ? parseInt(match[3]) : startAyah;
    for (let ayah = startAyah; ayah <= endAyah; ayah++) {
      refs.push({ surah, ayah });
    }
  }
  return refs;
}

function citationHasRange(citationStr: string): boolean {
  return /\d+:\d+[-–]\d+/.test(citationStr);
}

function InlineFormatting({ text, context }: { text: string; context?: PairedVerse[] }) {
  const tokenPattern = /(\*\*.+?\*\*|\(\d+:\d+(?:[-–]\d+)?(?:[;,]\s*\d+:\d+(?:[-–]\d+)?)*\))/g;
  const parts = text.split(tokenPattern).filter(Boolean);

  const findVerse = (surah: number, ayah: number): PairedVerse | undefined =>
    context?.find((v) => v.surah === surah && v.ayah === ayah);

  return (
    <>
      {parts.map((part, i) => {
        if (/^\(\d+:\d+(?:[-–]\d+)?(?:[;,]\s*\d+:\d+(?:[-–]\d+)?)*\)$/.test(part)) {
          const refs = parseCitationString(part);
          const verses = refs.map((r) => findVerse(r.surah, r.ayah)).filter(Boolean) as PairedVerse[];
          return (
            <CitationWithTooltip
              key={i}
              citation={part}
              verses={verses}
              verseRefs={refs}
              hasRange={citationHasRange(part)}
            />
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <span key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function MarkdownRenderer({ content, context }: { content: string; context?: PairedVerse[] }) {
  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalizedContent
    .split(/\n\n+/)
    .flatMap((p) => {
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

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="font-display text-lg font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(4)} context={context} />
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="font-display text-xl font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(3)} context={context} />
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} className="font-display text-2xl font-semibold mt-4 mb-2">
              <InlineFormatting text={trimmed.slice(2)} context={context} />
            </h1>
          );
        }

        if (trimmed.match(/^\d+[.)]\s/m)) {
          const items = trimmed
            .split(/\n/)
            .filter((line) => line.trim())
            .flatMap((line) => {
              const multiMatch = line.match(/^(\d+[.)]\s.+?)(?=\s+\d+[.)]\s|$)/g);
              return multiMatch && multiMatch.length > 1 ? multiMatch : [line];
            })
            .filter((line) => line.match(/^\d+[.)]\s/));
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

        return (
          <p key={i} className="text-[15px] leading-relaxed my-3">
            <InlineFormatting text={trimmed} context={context} />
          </p>
        );
      })}
    </>
  );
}
