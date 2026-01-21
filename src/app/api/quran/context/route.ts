/**
 * API Route: Get context for a specific verse
 * Query params: surah (required), ayah (required)
 * Returns context summary and asbab al-nuzul from verse_context table
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface ContextResponse {
  success: boolean;
  data?: {
    theme: string | null;
    context_summary: string;
    asbab_summary: string | null;
    scholarly_notes: string | null;
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
      return NextResponse.json<ContextResponse>(
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
      return NextResponse.json<ContextResponse>(
        {
          success: false,
          error: "Invalid surah number. Must be between 1 and 114.",
        },
        { status: 400 }
      );
    }

    if (isNaN(ayah) || ayah < 1) {
      return NextResponse.json<ContextResponse>(
        {
          success: false,
          error: "Invalid ayah number. Must be greater than 0.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch verse context
    const { data, error } = await supabase
      .from("verse_context")
      .select("theme, context_summary, asbab_summary, scholarly_notes")
      .eq("surah", surah)
      .eq("ayah", ayah)
      .limit(1)
      .single();

    if (error) {
      // If not found, return success with null data
      if (error.code === "PGRST116") {
        return NextResponse.json<ContextResponse>({
          success: true,
          data: undefined,
        });
      }

      console.error("[Context] Error fetching context:", error);
      throw new Error(`Failed to fetch context: ${error.message}`);
    }

    return NextResponse.json<ContextResponse>({
      success: true,
      data: {
        theme: data.theme || null,
        context_summary: data.context_summary || "",
        asbab_summary: data.asbab_summary || null,
        scholarly_notes: data.scholarly_notes || null,
      },
    });
  } catch (error) {
    console.error("[Context] Error:", error);

    return NextResponse.json<ContextResponse>(
      {
        success: false,
        error: "Failed to fetch verse context",
      },
      { status: 500 }
    );
  }
}
