/**
 * API Route: Get semantically related ayahs for a given verse
 * Query params: surah (required), ayah (required)
 * Uses the verse's existing embedding from Supabase — no re-embedding needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchSimilarVerses, fetchArabicVerses } from "@/lib/retrieval";

export interface RelatedAyah {
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  similarity: number;
  theme: string | null;
}

interface RelatedResponse {
  success: boolean;
  data?: RelatedAyah[];
  error?: string;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const surahParam = searchParams.get("surah");
    const ayahParam = searchParams.get("ayah");

    if (!surahParam || !ayahParam) {
      return NextResponse.json<RelatedResponse>(
        { success: false, error: "Both 'surah' and 'ayah' query parameters are required." },
        { status: 400 }
      );
    }

    const surah = parseInt(surahParam, 10);
    const ayah = parseInt(ayahParam, 10);

    if (isNaN(surah) || surah < 1 || surah > 114 || isNaN(ayah) || ayah < 1) {
      return NextResponse.json<RelatedResponse>(
        { success: false, error: "Invalid surah or ayah parameter." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch the pre-existing embedding for this ayah — no OpenAI call needed
    const { data: sourceRow, error: srcErr } = await supabase
      .from("documents")
      .select("embedding")
      .eq("doc_type", "quran_ayah")
      .eq("surah", surah)
      .eq("ayah", ayah)
      .eq("lang", "en")
      .limit(1)
      .single();

    if (srcErr || !sourceRow?.embedding) {
      return NextResponse.json<RelatedResponse>(
        { success: false, error: "Verse not found." },
        { status: 404 }
      );
    }

    // Run nearest-neighbour search using the stored embedding
    const results = await searchSimilarVerses(sourceRow.embedding, 15, "en");

    // Exclude the source ayah and immediate neighbours (±2 in same surah)
    const filtered = results
      .filter((r) => !(r.surah === surah && Math.abs(r.ayah - ayah) <= 2))
      .slice(0, 7);

    if (filtered.length === 0) {
      return NextResponse.json<RelatedResponse>({ success: true, data: [] });
    }

    // Fetch Arabic text + themes in parallel
    const refs = filtered.map((r) => ({ surah: r.surah, ayah: r.ayah }));
    const conditions = refs.map((ref) => `and(surah.eq.${ref.surah},ayah.eq.${ref.ayah})`);

    const [arabicMap, ctxResult] = await Promise.all([
      fetchArabicVerses(refs),
      supabase
        .from("verse_context")
        .select("surah, ayah, theme")
        .or(conditions.join(",")),
    ]);

    const themeMap = new Map<string, string | null>();
    for (const row of ctxResult.data || []) {
      themeMap.set(`${row.surah}:${row.ayah}`, row.theme || null);
    }

    const related: RelatedAyah[] = filtered.map((r) => ({
      surah: r.surah,
      ayah: r.ayah,
      arabic: arabicMap.get(`${r.surah}:${r.ayah}`) || "",
      english: r.content,
      similarity: r.similarity,
      theme: themeMap.get(`${r.surah}:${r.ayah}`) ?? null,
    }));

    return NextResponse.json<RelatedResponse>({ success: true, data: related });
  } catch (error) {
    console.error("[Related] Error:", error);
    return NextResponse.json<RelatedResponse>(
      { success: false, error: "Failed to fetch related verses." },
      { status: 500 }
    );
  }
}
