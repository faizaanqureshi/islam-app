/**
 * Shared types for the Hidayah Quran AI system
 */

// Verse reference
export interface VerseRef {
  surah: number;
  ayah: number;
}

// Paired context item (Arabic + English)
export interface PairedVerse {
  ref: string; // "(2:153)"
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity: number;
}

// Retrieval result from Supabase
export interface RetrievalResult {
  surah: number;
  ayah: number;
  content: string;
  similarity: number;
}

// Citation in the response
export interface Citation {
  surah: number;
  ayah: number;
}

// Chat response from the model
export interface ChatResponse {
  answer_markdown: string;
  citations: Citation[];
  uncertainty: string | null;
}

// API request body
export interface ChatRequest {
  message: string;
  conversationId?: string;
}

// API response
export interface ChatAPIResponse {
  success: boolean;
  data?: ChatResponse;
  context?: PairedVerse[];
  error?: string;
}
