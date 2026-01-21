/**
 * Retrieval helper for Quran verse search
 * Handles embeddings generation and Supabase vector search
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { PairedVerse, RetrievalResult, VerseRef } from "./types";
import { dedupeRefs } from "./citations";

// Configuration
const CONFIG = {
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 3072, // Full quality, no index needed for ~6K verses
  topK: 10, // Number of verses to retrieve
  similarityThreshold: 0.3, // Minimum similarity score
};

// Lazy initialization of clients
let supabase: SupabaseClient | null = null;
let openai: OpenAI | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabase;
}

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Generate embedding for a query string
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: CONFIG.embeddingModel,
    input: query,
    dimensions: CONFIG.embeddingDimensions,
  });

  return response.data[0].embedding;
}

/**
 * Search for similar verses using Supabase RPC
 * Primary search is in English for better semantic matching
 */
export async function searchSimilarVerses(
  embedding: number[],
  topK: number = CONFIG.topK,
  lang: string = "en"
): Promise<RetrievalResult[]> {
  const client = getSupabaseClient();

  // Call the match_documents RPC function
  const { data, error } = await client.rpc("match_documents", {
    query_embedding: embedding,
    match_count: topK,
    filter_lang: lang,
    similarity_threshold: CONFIG.similarityThreshold,
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    throw new Error(`Failed to search verses: ${error.message}`);
  }

  return (data || []) as RetrievalResult[];
}

/**
 * Fetch Arabic verses for the given surah/ayah pairs
 */
export async function fetchArabicVerses(
  refs: VerseRef[]
): Promise<Map<string, string>> {
  const client = getSupabaseClient();
  const arabicMap = new Map<string, string>();

  if (refs.length === 0) return arabicMap;

  // Build query for matching verses using PostgREST compound AND syntax
  // Each condition needs and() wrapper for compound filters within or()
  const conditions = refs.map((ref) => 
    `and(surah.eq.${ref.surah},ayah.eq.${ref.ayah})`
  );

  const { data, error } = await client
    .from("documents")
    .select("surah, ayah, content")
    .eq("lang", "ar")
    .eq("doc_type", "quran_ayah")
    .or(conditions.join(","));

  if (error) {
    console.error("Error fetching Arabic verses:", error);
    throw new Error(`Failed to fetch Arabic verses: ${error.message}`);
  }

  for (const row of data || []) {
    const key = `${row.surah}:${row.ayah}`;
    arabicMap.set(key, row.content);
  }

  return arabicMap;
}

/**
 * Main retrieval function: search English, then pair with Arabic
 */
export async function retrievePairedContext(
  query: string,
  topK: number = CONFIG.topK
): Promise<PairedVerse[]> {
  // 1. Generate embedding for the query
  const embedding = await generateQueryEmbedding(query);

  // 2. Search for similar English verses
  const englishResults = await searchSimilarVerses(embedding, topK, "en");

  if (englishResults.length === 0) {
    return [];
  }

  // 3. Get unique verse references
  const refs: VerseRef[] = dedupeRefs(
    englishResults.map((r) => ({ surah: r.surah, ayah: r.ayah }))
  );

  // 4. Fetch matching Arabic verses
  const arabicMap = await fetchArabicVerses(refs);

  // 5. Build paired context
  const pairedContext: PairedVerse[] = englishResults.map((result) => {
    const key = `${result.surah}:${result.ayah}`;
    return {
      ref: `(${result.surah}:${result.ayah})`,
      surah: result.surah,
      ayah: result.ayah,
      arabic: arabicMap.get(key) || "",
      english: result.content,
      similarity: result.similarity,
    };
  });

  return pairedContext;
}

/**
 * Format paired context for the LLM prompt
 */
export function formatContextForPrompt(context: PairedVerse[]): string {
  if (context.length === 0) {
    return "No relevant verses found.";
  }

  return context
    .map(
      (v, i) =>
        `[${i + 1}] ${v.ref}\n` +
        `Arabic: ${v.arabic}\n` +
        `English: ${v.english}\n` +
        `Relevance: ${(v.similarity * 100).toFixed(1)}%`
    )
    .join("\n\n");
}
