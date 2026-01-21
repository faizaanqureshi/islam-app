/**
 * API Route: Get all verses for a specific Surah
 * Returns both Arabic and English translations
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface Verse {
  ayah: number;
  arabic: string;
  english: string;
}

interface SurahResponse {
  success: boolean;
  data?: {
    surah: number;
    verses: Verse[];
  };
  error?: string;
}

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;
    const surahNumber = parseInt(number, 10);

    // Validate surah number
    if (isNaN(surahNumber) || surahNumber < 1 || surahNumber > 114) {
      return NextResponse.json<SurahResponse>(
        {
          success: false,
          error: "Invalid surah number. Must be between 1 and 114.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch both Arabic and English verses for this surah
    const { data: arabicData, error: arabicError } = await supabase
      .from("documents")
      .select("ayah, content")
      .eq("doc_type", "quran_ayah")
      .eq("lang", "ar")
      .eq("surah", surahNumber)
      .order("ayah", { ascending: true });

    if (arabicError) {
      console.error("[Surah] Error fetching Arabic:", arabicError);
      throw new Error(`Failed to fetch Arabic verses: ${arabicError.message}`);
    }

    const { data: englishData, error: englishError } = await supabase
      .from("documents")
      .select("ayah, content")
      .eq("doc_type", "quran_ayah")
      .eq("lang", "en")
      .eq("surah", surahNumber)
      .order("ayah", { ascending: true });

    if (englishError) {
      console.error("[Surah] Error fetching English:", englishError);
      throw new Error(`Failed to fetch English verses: ${englishError.message}`);
    }

    // Build a map for quick lookups
    const arabicMap = new Map<number, string>();
    for (const verse of arabicData || []) {
      arabicMap.set(verse.ayah, verse.content);
    }

    const englishMap = new Map<number, string>();
    for (const verse of englishData || []) {
      englishMap.set(verse.ayah, verse.content);
    }

    // Combine into paired verses
    // Use English as the primary source for verse numbers
    const verses: Verse[] = [];
    const allAyahNumbers = new Set([
      ...(arabicData || []).map((v) => v.ayah),
      ...(englishData || []).map((v) => v.ayah),
    ]);

    for (const ayah of Array.from(allAyahNumbers).sort((a, b) => a - b)) {
      verses.push({
        ayah,
        arabic: arabicMap.get(ayah) || "",
        english: englishMap.get(ayah) || "",
      });
    }

    return NextResponse.json<SurahResponse>({
      success: true,
      data: {
        surah: surahNumber,
        verses,
      },
    });
  } catch (error) {
    console.error("[Surah] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json<SurahResponse>(
      {
        success: false,
        error: "Failed to fetch surah verses",
      },
      { status: 500 }
    );
  }
}
