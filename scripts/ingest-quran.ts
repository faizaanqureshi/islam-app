/**
 * Quran Data Ingestion Script for Supabase with OpenAI Embeddings
 *
 * This script reads the quran.json file, generates embeddings using OpenAI,
 * and ingests all ayahs into the Supabase documents table for semantic search.
 *
 * Usage:
 *   pnpm ingest:quran
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Your Supabase service role key
 *   OPENAI_API_KEY - Your OpenAI API key
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: resolve(__dirname, "../.env.local") });

// Types for the Quran JSON structure
interface Verse {
  id: number;
  text: string;
}

interface Surah {
  id: number;
  name: string;
  transliteration: string;
  type: "meccan" | "medinan";
  total_verses: number;
  verses: Verse[];
}

// Document type for insertion (matches your table schema)
interface DocumentWithEmbedding {
  doc_type: string;
  lang: string;
  source: string;
  surah: number;
  ayah: number;
  content: string;
  embedding: number[];
}

// Configuration
const CONFIG = {
  docType: "quran_ayah",
  lang: "ar",
  source: "quran_json",
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 3072, // Full quality, no index needed for ~6K verses
  embeddingBatchSize: 200, // Increased from 100 - OpenAI can handle larger batches
  insertBatchSize: 100, // Increased from 50 - Supabase can handle larger batches
};

// Helper to delay execution (rate limiting)
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateEmbeddings(
  openai: OpenAI,
  texts: string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: CONFIG.embeddingModel,
    input: texts,
    dimensions: CONFIG.embeddingDimensions,
  });

  return response.data.map((item: { embedding: number[] }) => item.embedding);
}

async function main() {
  // Check for environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    console.error("❌ Missing environment variables:");
    if (!supabaseUrl) console.error("   - SUPABASE_URL");
    if (!supabaseServiceKey) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    if (!openaiApiKey) console.error("   - OPENAI_API_KEY");
    console.error("\n   Add these to your .env.local file");
    process.exit(1);
  }

  console.log("🕌 Quran Data Ingestion Script with Embeddings\n");

  // Read the Quran JSON file
  const quranPath = resolve(__dirname, "../public/quran.json");
  console.log(`📖 Reading Quran data from: ${quranPath}`);

  let surahs: Surah[];
  try {
    const rawData = readFileSync(quranPath, "utf-8");
    surahs = JSON.parse(rawData);
    console.log(`✓ Loaded ${surahs.length} surahs\n`);
  } catch (error) {
    console.error("❌ Failed to read quran.json:", error);
    process.exit(1);
  }

  // Initialize clients
  console.log("🔗 Connecting to Supabase...");
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Test Supabase connection
  const { error: testError } = await supabase
    .from("documents")
    .select("id")
    .limit(1);

  if (testError) {
    console.error("❌ Failed to connect to Supabase:", testError.message);
    process.exit(1);
  }
  console.log("✓ Connected to Supabase");

  // Initialize OpenAI
  console.log("🔗 Connecting to OpenAI...");
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Test OpenAI connection with a simple embedding
  try {
    await openai.embeddings.create({
      model: CONFIG.embeddingModel,
      input: "test",
    });
    console.log("✓ Connected to OpenAI\n");
  } catch (error) {
    console.error("❌ Failed to connect to OpenAI:", error);
    process.exit(1);
  }

  // Prepare all documents (without embeddings first)
  // Store surah info separately for display purposes
  interface PreparedDoc {
    doc_type: string;
    lang: string;
    source: string;
    surah: number;
    ayah: number;
    content: string;
    surahName: string; // For display only, not inserted
  }

  const documents: PreparedDoc[] = [];

  for (const surah of surahs) {
    for (const verse of surah.verses) {
      documents.push({
        doc_type: CONFIG.docType,
        lang: CONFIG.lang,
        source: CONFIG.source,
        surah: surah.id,
        ayah: verse.id,
        content: verse.text,
        surahName: surah.transliteration, // For progress display
      });
    }
  }

  const totalAyahs = documents.length;
  console.log(`📊 Total ayahs to process: ${totalAyahs}`);
  console.log(`🧠 Embedding model: ${CONFIG.embeddingModel}`);
  console.log(`📦 Embedding batch size: ${CONFIG.embeddingBatchSize}`);
  console.log(`💾 Insert batch size: ${CONFIG.insertBatchSize}\n`);

  // Process in batches: generate embeddings and insert
  console.log("🚀 Generating embeddings and inserting documents...\n");

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < documents.length; i += CONFIG.embeddingBatchSize) {
    const batch = documents.slice(i, i + CONFIG.embeddingBatchSize);
    const texts = batch.map((doc) => doc.content);

    try {
      // Generate embeddings for this batch
      const embeddings = await generateEmbeddings(openai, texts);

      // Combine documents with their embeddings (exclude surahName)
      const docsWithEmbeddings: DocumentWithEmbedding[] = batch.map(
        (doc, idx) => ({
          doc_type: doc.doc_type,
          lang: doc.lang,
          source: doc.source,
          surah: doc.surah,
          ayah: doc.ayah,
          content: doc.content,
          embedding: embeddings[idx],
        })
      );

      // Insert in smaller sub-batches
      for (let j = 0; j < docsWithEmbeddings.length; j += CONFIG.insertBatchSize) {
        const insertBatch = docsWithEmbeddings.slice(
          j,
          j + CONFIG.insertBatchSize
        );

        const { error } = await supabase.from("documents").upsert(insertBatch, {
          onConflict: "doc_type,lang,source,surah,ayah",
        });

        if (error) {
          console.error(`\n❌ Insert error at ${i + j}:`, error.message);
          errors++;
        }
      }

      processed += batch.length;
      const progress = ((processed / totalAyahs) * 100).toFixed(1);
      const surahInfo = batch[0]
        ? `${batch[0].surahName} ${batch[0].surah}:${batch[0].ayah}`
        : "";
      process.stdout.write(
        `\r   Progress: ${progress}% (${processed}/${totalAyahs}) - ${surahInfo}                    `
      );

      // Small delay to avoid rate limiting (reduced since we're using larger batches)
      await delay(50);
    } catch (error) {
      console.error(`\n❌ Error processing batch at index ${i}:`, error);
      errors++;
      // Wait longer on error (might be rate limited)
      await delay(1000);
    }
  }

  console.log("\n\n");

  // Verify insertion
  const { count, error: countError } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("doc_type", CONFIG.docType)
    .eq("source", CONFIG.source);

  if (countError) {
    console.error("❌ Error counting documents:", countError.message);
  } else {
    console.log("✅ Ingestion complete!");
    console.log(`   Total documents in database: ${count}`);
    console.log(`   Documents with embeddings: ${processed}`);

    if (errors > 0) {
      console.log(`   ⚠️  ${errors} batch(es) had errors`);
    }
  }

  // Show sample data
  console.log("\n📋 Sample inserted documents:");
  const { data: samples, error: sampleError } = await supabase
    .from("documents")
    .select("surah, ayah, content, embedding")
    .eq("doc_type", CONFIG.docType)
    .order("surah", { ascending: true })
    .order("ayah", { ascending: true })
    .limit(3);

  if (sampleError) {
    console.error("   Error fetching samples:", sampleError.message);
  } else if (samples) {
    for (const row of samples) {
      const preview = row.content.substring(0, 40);
      const hasEmbedding = row.embedding ? "✓ embedded" : "✗ no embedding";
      console.log(
        `   Surah ${row.surah}:${row.ayah} - ${preview}... [${hasEmbedding}]`
      );
    }
  }

  console.log("\n👋 Done!");
}

main();
