/**
 * Utility functions for parsing and managing Quran citations
 */

import type { Citation, VerseRef } from "./types";

/**
 * Parse citation references from text
 * Matches patterns like (2:153), (1:1-7), [2:255]
 */
export function parseCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  
  // Match patterns: (2:153), [2:153], 2:153
  const pattern = /[\[\(]?(\d{1,3}):(\d{1,3})[\]\)]?/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const surah = parseInt(match[1], 10);
    const ayah = parseInt(match[2], 10);

    // Validate surah (1-114) and ayah (1-286 max)
    if (surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= 286) {
      citations.push({ surah, ayah });
    }
  }

  return citations;
}

/**
 * Deduplicate verse references
 */
export function dedupeRefs(refs: VerseRef[]): VerseRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.surah}:${ref.ayah}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format a verse reference as a citation string
 */
export function formatCitation(surah: number, ayah: number): string {
  return `(${surah}:${ayah})`;
}

/**
 * Check if a paragraph contains at least one citation
 */
export function paragraphHasCitation(paragraph: string): boolean {
  const pattern = /[\[\(](\d{1,3}):(\d{1,3})[\]\)]/;
  return pattern.test(paragraph);
}

/**
 * Split text into paragraphs (non-empty lines)
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Validate that all citations in the answer exist in the provided context
 */
export function validateCitationsAgainstContext(
  answer: string,
  contextRefs: VerseRef[]
): { valid: boolean; invalidCitations: Citation[] } {
  const citations = parseCitations(answer);
  const contextSet = new Set(
    contextRefs.map((ref) => `${ref.surah}:${ref.ayah}`)
  );

  const invalidCitations = citations.filter(
    (c) => !contextSet.has(`${c.surah}:${c.ayah}`)
  );

  return {
    valid: invalidCitations.length === 0,
    invalidCitations,
  };
}
