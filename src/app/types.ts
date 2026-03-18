// Shared application types

export interface Citation {
  surah: number;
  ayah: number;
}

export interface PairedVerse {
  ref: string;
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  context?: PairedVerse[];
  uncertainty?: string | null;
  isLoading?: boolean;
}

// Extended verse type that includes fetched verses (may not have similarity)
export interface ExtendedVerse {
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity?: number;
}

// Verse context from the API
export interface VerseContext {
  theme: string | null;
  context_summary: string;
  asbab_summary: string | null;
  scholarly_notes: string | null;
}

// Ayah Explorer types
export interface Surah {
  number: number;
  name: string;
  transliteration: string;
  verses: number;
}

export interface Verse {
  ayah: number;
  arabic: string;
  english: string;
}

export interface RelatedAyah {
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity: number;
  theme: string | null;
}

export interface VerseModalProps {
  verse: {
    surah: number;
    ayah: number;
    arabic: string;
    english: string;
  };
  surahs: Surah[];
  onNavigate: (surah: number, ayah: number, arabic: string, english: string) => void;
  onClose: () => void;
}
