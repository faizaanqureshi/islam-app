/**
 * API Route: Get a specific ayah
 * Query params: surah (required), ayah (required)
 * Returns both Arabic and English for the specified verse
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface AyahResponse {
  success: boolean;
  data?: {
    surah: number;
    ayah: number;
    arabic: string;
    english: string;
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const surahParam = searchParams.get("surah");
    const ayahParam = searchParams.get("ayah");

    // Validate parameters
    if (!surahParam || !ayahParam) {
      return NextResponse.json<AyahResponse>(
        {
          success: false,
          error: "Both 'surah' and 'ayah' query parameters are required.",
        },
        { status: 400 }
      );
    }

    const surah = parseInt(surahParam, 10);
    const ayah = parseInt(ayahParam, 10);

    if (isNaN(surah) || surah < 1 || surah > 114) {
      return NextResponse.json<AyahResponse>(
        {
          success: false,
          error: "Invalid surah number. Must be between 1 and 114.",
        },
        { status: 400 }
      );
    }

    if (isNaN(ayah) || ayah < 1) {
      return NextResponse.json<AyahResponse>(
        {
          success: false,
          error: "Invalid ayah number. Must be greater than 0.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch both Arabic and English for this specific verse
    const { data, error } = await supabase
      .from("documents")
      .select("lang, content")
      .eq("doc_type", "quran_ayah")
      .eq("surah", surah)
      .eq("ayah", ayah)
      .in("lang", ["ar", "en"]);

    if (error) {
      console.error("[Ayah] Error fetching verse:", error);
      throw new Error(`Failed to fetch verse: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return NextResponse.json<AyahResponse>(
        {
          success: false,
          error: `Verse ${surah}:${ayah} not found.`,
        },
        { status: 404 }
      );
    }

    // Build response
    let arabic = "";
    let english = "";

    for (const row of data) {
      if (row.lang === "ar") {
        arabic = row.content;
      } else if (row.lang === "en") {
        english = row.content;
      }
    }

    return NextResponse.json<AyahResponse>({
      success: true,
      data: {
        surah,
        ayah,
        arabic,
        english,
      },
    });
  } catch (error) {
    console.error("[Ayah] Error:", error);

    return NextResponse.json<AyahResponse>(
      {
        success: false,
        error: "Failed to fetch ayah",
      },
      { status: 500 }
    );
  }
}
