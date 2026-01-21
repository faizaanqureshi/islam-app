/**
 * Retrieval helper for Quran verse search
 * Handles embeddings generation and Supabase vector search
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { PairedVerse, RetrievalResult, VerseRef, ConversationMessage } from "./types";
import { dedupeRefs } from "./citations";

// Configuration
const CONFIG = {
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 3072, // Full quality, no index needed for ~6K verses
  initialRetrievalK: 20, // Initial retrieval before reranking (reduced from 30)
  rerankK: 10, // Number to send to reranker (reduced from 15)
  finalK: 3, // Final anchor verses after reranking (reduced from 5)
  similarityThreshold: 0.3, // Minimum similarity score
  enableReranking: false, // DISABLED - too slow even with optimizations
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
 * Expand short/vague queries into full questions for better semantic search.
 * Single words or short phrases like "music" become "What does the Quran say about music?"
 */
export function expandShortQuery(query: string): string {
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).length;
  
  // Check if the query is already a question or detailed enough
  const isQuestion = /^(what|how|why|when|where|who|which|is|are|does|do|can|should|will|would)\b/i.test(trimmed);
  const hasQuranMention = /quran|islam|allah|muslim|ayah|surah|verse/i.test(trimmed);
  
  // Expand if: short (1-3 words), not a question, and doesn't mention Quran-related terms
  if (wordCount <= 3 && !isQuestion && !hasQuranMention) {
    const expanded = `What does the Quran say about ${trimmed.toLowerCase()}?`;
    console.log(`[Query Expansion] "${trimmed}" -> "${expanded}"`);
    return expanded;
  }
  
  // Also expand slightly longer queries (4-6 words) that are clearly topic-based, not questions
  if (wordCount <= 6 && !isQuestion && !trimmed.includes("?")) {
    // Check if it looks like a topic/phrase rather than a question
    const looksLikeTopic = /^(the\s+)?(concept|meaning|importance|role|purpose|ruling|view|stance|position|topic)\s+of\b/i.test(trimmed) === false;
    if (looksLikeTopic && !hasQuranMention) {
      const expanded = `What does the Quran say about ${trimmed.toLowerCase()}?`;
      console.log(`[Query Expansion] "${trimmed}" -> "${expanded}"`);
      return expanded;
    }
  }
  
  return trimmed;
}

/**
 * Rewrite a follow-up query to be standalone using conversation history.
 * This helps RAG retrieve relevant verses for questions like "what about men?"
 * by expanding them to "What does the Quran say about men's dress and clothing?"
 */
export async function rewriteQueryWithContext(
  query: string,
  history: ConversationMessage[]
): Promise<string> {
  // If no history or query is already detailed, skip rewriting
  if (history.length === 0 || query.length > 100) {
    console.log(`[Query Rewrite] Skipping (no history or query too long)`);
    return query;
  }

  try {
    const client = getOpenAIClient();

    // Build a concise conversation summary (last 2 exchanges max)
    const recentHistory = history.slice(-4);
    const conversationContext = recentHistory
      .map((msg) => `${msg.role}: ${msg.content.slice(0, 300)}`)
      .join("\n");

    console.log(`[Query Rewrite] Rewriting "${query}" with ${recentHistory.length} history messages...`);

    // Use the Responses API
    const response = await client.responses.create({
      model: "gpt-5.2",
      instructions: `You rewrite follow-up questions to be standalone queries for searching the Quran.

Given conversation history and a follow-up question, output ONLY a rewritten standalone question that includes the necessary context.

Rules:
- Keep it concise (under 50 words)
- Include the topic from the conversation
- Make it a complete question about what the Quran says
- Output ONLY the rewritten question, nothing else

Example:
History: "user: what does the quran say about women's dress"
Follow-up: "what about men"
Output: "What does the Quran say about men's dress and clothing?"`,
      input: `History:\n${conversationContext}\n\nFollow-up question: ${query}`,
    });

    const rewritten = response.output_text?.trim();
    
    console.log(`[Query Rewrite] Result: "${rewritten || '(empty)'}"`);
    
    // Fallback to original if rewriting fails
    if (!rewritten || rewritten.length < 5) {
      console.log(`[Query Rewrite] Using original (rewrite too short or empty)`);
      return query;
    }

    return rewritten;
  } catch (error) {
    console.error(`[Query Rewrite] Error:`, error);
    return query; // Fallback to original on error
  }
}

/**
 * Search for similar verses using Supabase RPC
 * Primary search is in English for better semantic matching
 */
export async function searchSimilarVerses(
  embedding: number[],
  topK: number = CONFIG.initialRetrievalK,
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
 * Fetch context summaries and themes for verses
 */
async function fetchVerseContexts(
  refs: VerseRef[]
): Promise<Map<string, { context_summary: string; theme: string | null }>> {
  const client = getSupabaseClient();
  const contextMap = new Map<string, { context_summary: string; theme: string | null }>();

  if (refs.length === 0) return contextMap;

  const conditions = refs.map((ref) =>
    `and(surah.eq.${ref.surah},ayah.eq.${ref.ayah})`
  );

  const { data, error } = await client
    .from("verse_context")
    .select("surah, ayah, context_summary, theme")
    .or(conditions.join(","));

  if (error) {
    console.error("Error fetching verse contexts:", error);
    // Non-fatal: continue without context
    return contextMap;
  }

  for (const row of data || []) {
    const key = `${row.surah}:${row.ayah}`;
    contextMap.set(key, {
      context_summary: row.context_summary || "",
      theme: row.theme || null,
    });
  }

  return contextMap;
}

/**
 * LLM-based reranking using parallel pointwise scoring (much faster)
 */
async function rerankWithLLM(
  query: string,
  candidates: Array<{
    id: number;
    surah: number;
    ayah: number;
    translation: string;
    context: string;
    theme: string | null;
  }>
): Promise<number[]> {
  const client = getOpenAIClient();

  // Pointwise parallel scoring: score each verse independently in parallel
  const scoringPromises = candidates.map(async (c, idx) => {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-5-nano",
        messages: [
          {
            role: "system",
            content: "Score verse relevance 1-10. Return only number.",
          },
          {
            role: "user",
            content: `Q: ${query}\nVerse: ${c.translation.slice(0, 200)}\nScore:`,
          },
        ],
      });

      const score = parseInt(response.choices[0]?.message?.content?.trim() || "5");
      return { id: idx, score: isNaN(score) ? 5 : score };
    } catch {
      return { id: idx, score: 5 }; // Default middle score on error
    }
  });

  // Wait for all scores in parallel
  const scores = await Promise.all(scoringPromises);

  // Sort by score descending and return IDs
  const ranked = scores.sort((a, b) => b.score - a.score);
  return ranked.map((r) => r.id);
}

/**
 * Expand passage by fetching ±2 verses around anchor verses
 */
async function expandPassages(anchors: PairedVerse[]): Promise<PairedVerse[]> {
  const client = getSupabaseClient();
  const expanded = new Map<string, PairedVerse>();

  // Collect all verse refs we need (anchor ±2)
  const refsToFetch: VerseRef[] = [];
  for (const anchor of anchors) {
    for (let offset = -2; offset <= 2; offset++) {
      const ayah = anchor.ayah + offset;
      if (ayah > 0) {
        refsToFetch.push({ surah: anchor.surah, ayah });
      }
    }
  }

  // Dedupe
  const uniqueRefs = dedupeRefs(refsToFetch);

  // Fetch English
  const enConditions = uniqueRefs.map((ref) =>
    `and(surah.eq.${ref.surah},ayah.eq.${ref.ayah})`
  );

  const { data: enData } = await client
    .from("documents")
    .select("surah, ayah, content")
    .eq("lang", "en")
    .eq("doc_type", "quran_ayah")
    .or(enConditions.join(","))
    .order("surah", { ascending: true })
    .order("ayah", { ascending: true });

  // Fetch Arabic
  const arabicMap = await fetchArabicVerses(uniqueRefs);

  // Build expanded results maintaining natural order
  for (const row of enData || []) {
    const key = `${row.surah}:${row.ayah}`;
    if (!expanded.has(key)) {
      expanded.set(key, {
        ref: `(${row.surah}:${row.ayah})`,
        surah: row.surah,
        ayah: row.ayah,
        arabic: arabicMap.get(key) || "",
        english: row.content,
        similarity: 1.0, // Expanded verses get full weight
      });
    }
  }

  return Array.from(expanded.values());
}

/**
 * Main retrieval function with optional reranking and passage expansion
 */
export async function retrievePairedContext(
  query: string,
  topK: number = 10
): Promise<PairedVerse[]> {
  // Generate embedding and retrieve verses
  const embedding = await generateQueryEmbedding(query);

  // If reranking is disabled, use simple retrieval with passage expansion
  if (!CONFIG.enableReranking) {
    const englishResults = await searchSimilarVerses(embedding, topK, "en");

    if (englishResults.length === 0) {
      return [];
    }

    // Build anchor verses with context summaries
    const refs = englishResults.map((r) => ({ surah: r.surah, ayah: r.ayah }));
    const [arabicMap, contextMap] = await Promise.all([
      fetchArabicVerses(refs),
      fetchVerseContexts(refs),
    ]);

    const anchors: PairedVerse[] = englishResults.map((result) => {
      const key = `${result.surah}:${result.ayah}`;
      const context = contextMap.get(key);
      return {
        ref: `(${result.surah}:${result.ayah})`,
        surah: result.surah,
        ayah: result.ayah,
        arabic: arabicMap.get(key) || "",
        english: result.content,
        similarity: result.similarity,
        context_summary: context?.context_summary || undefined,
        theme: context?.theme || undefined,
      };
    });

    // Expand with ±2 verses for context
    const expanded = await expandPassages(anchors);
    console.log(`[Retrieval] Expanded ${anchors.length} verses to ${expanded.length} with context`);

    return expanded;
  }

  // Reranking enabled - use full pipeline
  const englishResults = await searchSimilarVerses(
    embedding,
    CONFIG.initialRetrievalK,
    "en"
  );

  if (englishResults.length === 0) {
    return [];
  }

  console.log(`[Retrieval] Initial retrieval: ${englishResults.length} verses`);

  // Fetch Arabic and context for top 15 candidates
  const candidatesForRerank = englishResults.slice(0, CONFIG.rerankK);
  const refs = candidatesForRerank.map((r) => ({ surah: r.surah, ayah: r.ayah }));

  const [arabicMap, contextMap] = await Promise.all([
    fetchArabicVerses(refs),
    fetchVerseContexts(refs),
  ]);

  // Prepare candidates for reranking
  const rerankCandidates = candidatesForRerank.map((result, i) => {
    const key = `${result.surah}:${result.ayah}`;
    const context = contextMap.get(key);
    return {
      id: i,
      surah: result.surah,
      ayah: result.ayah,
      translation: result.content,
      context: context?.context_summary || "",
      theme: context?.theme || null,
    };
  });

  // Rerank with LLM
  const rankedIds = await rerankWithLLM(query, rerankCandidates);
  console.log(`[Retrieval] Reranked ${rankedIds.length} verses`);

  // Select top anchors
  const anchorIds = rankedIds.slice(0, CONFIG.finalK);
  const anchors: PairedVerse[] = anchorIds.map((id) => {
    const candidate = candidatesForRerank[id];
    const key = `${candidate.surah}:${candidate.ayah}`;
    return {
      ref: `(${candidate.surah}:${candidate.ayah})`,
      surah: candidate.surah,
      ayah: candidate.ayah,
      arabic: arabicMap.get(key) || "",
      english: candidate.content,
      similarity: candidate.similarity,
    };
  });

  console.log(`[Retrieval] Selected ${anchors.length} anchor verses`);

  // Expand passages (±2 verses)
  const expanded = await expandPassages(anchors);
  console.log(`[Retrieval] Expanded to ${expanded.length} total verses`);

  return expanded;
}

/**
 * Format paired context for the LLM prompt
 */
export function formatContextForPrompt(context: PairedVerse[]): string {
  if (context.length === 0) {
    return "No relevant verses found.";
  }

  return context
    .map((v, i) => {
      let formatted =
        `[${i + 1}] ${v.ref}\n` +
        `Arabic: ${v.arabic}\n` +
        `English: ${v.english}\n`;

      if (v.theme) {
        formatted += `Theme: ${v.theme}\n`;
      }

      if (v.context_summary) {
        formatted += `Context: ${v.context_summary}\n`;
      }

      formatted += `Relevance: ${(v.similarity * 100).toFixed(1)}%`;

      return formatted;
    })
    .join("\n\n");
}
