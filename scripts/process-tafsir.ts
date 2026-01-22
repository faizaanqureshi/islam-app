/**
 * Script to process Tafsir Ibn Kathir and populate verse_context table
 *
 * This script:
 * 1. Fetches tafsir from QuranAPI (https://quranapi.pages.dev/api/tafsir/{surah}.json)
 * 2. Fetches corresponding Arabic + English verses from Supabase
 * 3. Sends verse + tafsir to GPT-5-nano for structured context extraction
 * 4. Saves to verse_context table
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as path from "path";

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), ".env.local") });

// Configuration
const TAFSIR_API_BASE = "https://quranapi.pages.dev/api/tafsir";
const BATCH_SIZE = 100; // Process 100 verses at a time
const PARALLEL_REQUESTS = 25; // Process 25 verses in parallel within each batch
const SAVE_BATCH_SIZE = 50; // Save up to 50 records in a single upsert
const DELAY_MS = 200; // 200ms delay between batches (reduced since we're batching saves)
const TOTAL_SURAHS = 114; // Total number of surahs in the Quran

// System prompt for GPT
const SYSTEM_PROMPT = `You are summarizing classical Qur'anic commentary for a study and context tool.

You will be given:
- A Qur'an verse (Arabic + English translation)
- An English tafsir passage (from Tafsir Ibn Kathir)

Your task is to extract structured contextual information strictly from the tafsir.

You must produce FOUR fields:

1) THEME (SELECT FROM PREDEFINED LIST)
   - Select ONE primary theme from the list below
   - Optionally select ONE secondary theme (max 2 total)
   - Separate with " · " (e.g., "Divine guidance · Belief and disbelief")
   - If unsure, use "General guidance"

   THEME LIST (organized by category):

   Guidance & Belief:
   • Divine guidance
   • Belief and disbelief
   • Continuity of revelation
   • Signs and evidence
   • Accountability
   • Remembrance of God

   Worship & Relationship with God:
   • Prayer and worship
   • Gratitude and patience
   • Repentance and forgiveness
   • Reliance on God
   • Fear and hope

   Community & Moral Conduct:
   • Community instruction
   • Justice and fairness
   • Truthfulness and honesty
   • Charity and generosity
   • Family and kinship
   • Moral exhortation
   • Rights and responsibilities

   Narrative & History:
   • Prophetic narrative
   • Historical lesson
   • Past nations
   • Creation and nature

   Opposition, Conflict & Response:
   • Opposition to the message
   • Conflict and treaty
   • Defense and struggle
   • Hypocrites and opponents

   Warning & Reassurance:
   • Warning and consequence
   • Reassurance and promise
   • Resurrection and judgment
   • Paradise and hellfire

   Fallback:
   • General guidance (use if no other theme fits clearly)

2) CONTEXT SUMMARY (KEEP THIS SHORT AND NEUTRAL)
   - 2–3 sentences MAX
   - ONLY answer:
     • What situation is this verse addressing?
     • Who is being addressed?
     • What changed / what is being clarified?
   - DO NOT include:
     • Scholarly debates or interpretations
     • Legal rulings or exceptions
     • Motives or judgments about people
     • Abrogation theory or theological claims
   - Example of CORRECT context:
     "This verse addresses the change in the direction of prayer during the Madinan period, responding to the Prophet's expectation and establishing the Sacred Mosque in Mecca as the new Qiblah. It clarifies this directive for the Muslim community."
   - Example of WRONG context (too much):
     "This verse introduces the first abrogation in Islamic law, notes exceptions for travel, battle, or uncertainty, and explains that the People of the Book deny the truth out of envy."

3) ASBAB AL-NUZUL (HISTORICAL ANCHOR ONLY)
   - ONE sentence describing when/where/why this was revealed
   - Focus on the concrete historical event or circumstance
   - Example: "This verse was revealed after the Prophet's migration to Medina, when the direction of prayer was changed from Jerusalem to the Kaʿbah in Mecca."
   - Return "NONE" if no specific occasion is mentioned

4) SCHOLARLY NOTES (OPTIONAL DEPTH - can be empty)
   - 1-4 sentences for deeper scholarly context
   - This is where you can include:
     • Links to related verses
     • Scholarly interpretations or debates
     • Legal implications or exceptions
     • Abrogation discussions
     • Theological nuances
   - If the tafsir doesn't provide this level of detail, return an empty string
   - Still maintain neutral, factual tone

Rules (strict):
- Use ONLY the provided tafsir text
- Keep Context MINIMAL - just situation/addressee/change
- Keep Occasion FACTUAL - just when/where/why historically
- Put EVERYTHING else in Scholarly Notes
- Do NOT become an authority voice
- Do NOT make interpretive claims in Context
- Write neutrally, as if framing understanding, not teaching conclusions

Tone:
- Neutral
- Factual
- Non-polemical
- Non-apologetic

Output format (STRICT JSON):
{
  "theme": "One or two themes from the predefined list, separated by · if using two",
  "context_summary": "2-3 sentences: situation + addressee + change",
  "asbab_al_nuzul": "ONE sentence historical anchor or NONE",
  "scholarly_notes": "1-4 sentences OR empty string if none"
}

IMPORTANT: The theme MUST be selected from the predefined list above. Do not create new themes.

Output ONLY valid JSON. No additional text.`;

// Initialize clients
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({ apiKey });
}

// Types for API response
interface TafsirEntry {
  author: string;
  groupVerse: string | null;
  content: string;
}

interface VerseTafsirResponse {
  surahName: string;
  surahNo: number;
  ayahNo: number;
  tafsirs: TafsirEntry[];
}

// Fetch tafsir for a specific verse from API
async function fetchVerseTafsir(surahNumber: number, ayahNumber: number): Promise<VerseTafsirResponse | null> {
  const url = `${TAFSIR_API_BASE}/${surahNumber}_${ayahNumber}.json`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      // Verse doesn't have tafsir
      return null;
    }
    throw new Error(`Failed to fetch tafsir for ${surahNumber}:${ayahNumber}: ${response.statusText}`);
  }

  return await response.json();
}

// Get total verse count for a surah (hardcoded for now)
function getTotalVerses(surahNumber: number): number {
  const verseCounts: Record<number, number> = {
    1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
    11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
    21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
    31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
    41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
    51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
    61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
    71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
    81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
    91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
    101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
    111: 5, 112: 4, 113: 5, 114: 6
  };
  return verseCounts[surahNumber] || 0;
}

// Strip markdown headings and clean text
function cleanTafsirText(text: string): string {
  if (!text) return "";

  return text
    .replace(/^##\s+/gm, "") // Remove markdown headers
    .replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
    .trim();
}

// Check if verse context already exists
async function contextExists(surah: number, ayah: number): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("verse_context")
    .select("surah, ayah")
    .eq("surah", surah)
    .eq("ayah", ayah)
    .limit(1);

  if (error) {
    console.error(`Error checking context for ${surah}:${ayah}:`, error);
    return false;
  }

  return data && data.length > 0;
}

// Fetch verse text from Supabase
async function fetchVerse(surah: number, ayah: number) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("documents")
    .select("lang, content")
    .eq("doc_type", "quran_ayah")
    .eq("surah", surah)
    .eq("ayah", ayah)
    .in("lang", ["ar", "en"]);

  if (error) {
    throw new Error(`Failed to fetch verse ${surah}:${ayah}: ${error.message}`);
  }

  const arabic = data?.find((d) => d.lang === "ar")?.content || "";
  const english = data?.find((d) => d.lang === "en")?.content || "";

  return { arabic, english };
}

// Process single verse with GPT
async function processVerse(
  surah: number,
  ayah: number,
  tafsirText: string,
  openai: OpenAI
) {
  // Fetch verse text
  const { arabic, english } = await fetchVerse(surah, ayah);

  // Skip if no tafsir text
  if (!tafsirText) {
    throw new Error(`No tafsir text available for ${surah}:${ayah}`);
  }

  // Build user message
  const userMessage = `VERSE: ${surah}:${ayah}

ARABIC:
${arabic}

ENGLISH:
${english}

TAFSIR (Ibn Kathir):
${tafsirText}

Extract the structured context as JSON.`;

  // Define JSON schema for structured output
  const responseFormat = {
    type: "json_schema" as const,
    json_schema: {
      name: "tafsir_context",
      strict: true,
      schema: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            description: "One or two themes from the predefined list in the system prompt, separated by · if using two. Must select from the provided theme list only.",
          },
          context_summary: {
            type: "string",
            description: "2-3 sentences: situation + addressee + change only",
          },
          asbab_al_nuzul: {
            type: "string",
            description: "ONE sentence historical anchor (when/where/why revealed) or 'NONE'",
          },
          scholarly_notes: {
            type: "string",
            description: "1-4 sentences with scholarly depth (debates, legal notes, related verses) or empty string",
          },
        },
        required: ["theme", "context_summary", "asbab_al_nuzul", "scholarly_notes"],
        additionalProperties: false,
      },
    },
  };

  // Call GPT-5-nano with structured outputs
  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: responseFormat,
  });

  const content = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(content);

  return {
    theme: parsed.theme || "",
    context_summary: parsed.context_summary || "",
    asbab_al_nuzul: parsed.asbab_al_nuzul === "NONE" ? null : parsed.asbab_al_nuzul,
    scholarly_notes: parsed.scholarly_notes || "",
  };
}

// Type for processed verse context
interface ProcessedContext {
  surah: number;
  ayah: number;
  theme: string;
  context_summary: string;
  asbab_summary: string | null;
  scholarly_notes: string;
  source_name: string;
}

// Save batch to Supabase (much faster than individual saves)
async function saveBatchToSupabase(contexts: ProcessedContext[]) {
  if (contexts.length === 0) return;
  
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("verse_context").upsert(
    contexts,
    {
      onConflict: "surah,ayah",
    }
  );

  if (error) {
    throw new Error(`Failed to save batch: ${error.message}`);
  }
}

// Main processing function
async function main() {
  console.log("Starting tafsir processing...");
  console.log(`Config: BATCH_SIZE=${BATCH_SIZE}, PARALLEL=${PARALLEL_REQUESTS}, SAVE_BATCH=${SAVE_BATCH_SIZE}`);
  console.log(`Fetching individual verse tafsir from API for ${TOTAL_SURAHS} surahs...\n`);

  const openai = getOpenAIClient();

  let processed = 0;
  let errors = 0;
  let skipped = 0;
  let noTafsir = 0;
  let pendingSaves: ProcessedContext[] = [];

  // Helper to flush pending saves
  async function flushSaves() {
    if (pendingSaves.length === 0) return;
    
    // Save in sub-batches
    for (let i = 0; i < pendingSaves.length; i += SAVE_BATCH_SIZE) {
      const batch = pendingSaves.slice(i, i + SAVE_BATCH_SIZE);
      try {
        await saveBatchToSupabase(batch);
        console.log(`  💾 Saved batch of ${batch.length} verses`);
      } catch (error) {
        console.error(`  ✗ Error saving batch:`, error);
        errors += batch.length;
      }
    }
    pendingSaves = [];
  }

  // Process each surah
  for (let surahNumber = 1; surahNumber <= TOTAL_SURAHS; surahNumber++) {
    const totalVerses = getTotalVerses(surahNumber);
    console.log(`\n=== Processing Surah ${surahNumber} (${totalVerses} verses) ===`);

    // Process verses in batches
    for (let i = 1; i <= totalVerses; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE - 1, totalVerses);
      const batchVerses = Array.from({ length: batchEnd - i + 1 }, (_, idx) => i + idx);

      console.log(`\nProcessing batch (verses ${i}-${batchEnd})...`);

      // Split batch into chunks for parallel processing
      for (let j = 0; j < batchVerses.length; j += PARALLEL_REQUESTS) {
        const chunk = batchVerses.slice(j, j + PARALLEL_REQUESTS);

        // Process chunk in parallel
        const promises = chunk.map(async (ayah) => {
          try {
            // Check if context already exists
            const exists = await contextExists(surahNumber, ayah);
            if (exists) {
              return { type: 'skipped' as const, ref: `${surahNumber}:${ayah}` };
            }

            // Fetch tafsir for this specific verse
            const verseTafsirData = await fetchVerseTafsir(surahNumber, ayah);

            if (!verseTafsirData) {
              return { type: 'noTafsir' as const, ref: `${surahNumber}:${ayah}` };
            }

            // Find Ibn Kathir's tafsir
            const ibnKathirEntry = verseTafsirData.tafsirs.find(
              (entry) => entry.author === "Ibn Kathir"
            );

            if (!ibnKathirEntry) {
              return { type: 'noTafsir' as const, ref: `${surahNumber}:${ayah}` };
            }

            const tafsirText = cleanTafsirText(ibnKathirEntry.content);

            if (!tafsirText) {
              return { type: 'noTafsir' as const, ref: `${surahNumber}:${ayah}` };
            }

            // Process with GPT
            const context = await processVerse(surahNumber, ayah, tafsirText, openai);

            // Return processed context for batched saving
            return {
              type: 'processed' as const,
              ref: `${surahNumber}:${ayah}`,
              data: {
                surah: surahNumber,
                ayah,
                theme: context.theme,
                context_summary: context.context_summary,
                asbab_summary: context.asbab_al_nuzul,
                scholarly_notes: context.scholarly_notes,
                source_name: "Tafsir Ibn Kathir",
              } as ProcessedContext,
            };
          } catch (error) {
            console.error(`  ✗ Error processing ${surahNumber}:${ayah}:`, error);
            return { type: 'error' as const, ref: `${surahNumber}:${ayah}`, error };
          }
        });

        // Wait for all parallel requests to complete
        const results = await Promise.all(promises);

        // Collect results and queue saves
        for (const result of results) {
          switch (result.type) {
            case 'skipped':
              skipped++;
              break;
            case 'noTafsir':
              noTafsir++;
              break;
            case 'processed':
              processed++;
              pendingSaves.push(result.data);
              break;
            case 'error':
              errors++;
              break;
          }
        }

        // Save immediately after each parallel chunk completes (streaming saves)
        if (pendingSaves.length >= SAVE_BATCH_SIZE) {
          await flushSaves();
        }
      }

      // Flush any remaining saves after the batch
      await flushSaves();

      // Brief delay between batches
      if (batchEnd < totalVerses) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      // Progress update
      const totalProcessedThisSurah = processed + skipped + noTafsir + errors;
      console.log(`  Progress: ${processed} processed, ${skipped} skipped, ${noTafsir} no tafsir, ${errors} errors`);
    }

    // No extra delay between surahs - keep the momentum
  }

  // Final flush
  await flushSaves();

  console.log("\n=== Processing Complete ===");
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`No tafsir available: ${noTafsir}`);
  console.log(`Errors: ${errors}`);
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
