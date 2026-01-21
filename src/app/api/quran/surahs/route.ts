/**
 * API Route: Get all Surahs metadata
 * Returns list of all 114 surahs with their names and verse counts
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Surah metadata (name, transliteration, verse count)
const SURAH_METADATA = [
  { number: 1, name: "Al-Fatihah", transliteration: "The Opening", verses: 7 },
  { number: 2, name: "Al-Baqarah", transliteration: "The Cow", verses: 286 },
  { number: 3, name: "Ali 'Imran", transliteration: "Family of Imran", verses: 200 },
  { number: 4, name: "An-Nisa", transliteration: "The Women", verses: 176 },
  { number: 5, name: "Al-Ma'idah", transliteration: "The Table Spread", verses: 120 },
  { number: 6, name: "Al-An'am", transliteration: "The Cattle", verses: 165 },
  { number: 7, name: "Al-A'raf", transliteration: "The Heights", verses: 206 },
  { number: 8, name: "Al-Anfal", transliteration: "The Spoils of War", verses: 75 },
  { number: 9, name: "At-Tawbah", transliteration: "The Repentance", verses: 129 },
  { number: 10, name: "Yunus", transliteration: "Jonah", verses: 109 },
  { number: 11, name: "Hud", transliteration: "Hud", verses: 123 },
  { number: 12, name: "Yusuf", transliteration: "Joseph", verses: 111 },
  { number: 13, name: "Ar-Ra'd", transliteration: "The Thunder", verses: 43 },
  { number: 14, name: "Ibrahim", transliteration: "Abraham", verses: 52 },
  { number: 15, name: "Al-Hijr", transliteration: "The Rocky Tract", verses: 99 },
  { number: 16, name: "An-Nahl", transliteration: "The Bee", verses: 128 },
  { number: 17, name: "Al-Isra", transliteration: "The Night Journey", verses: 111 },
  { number: 18, name: "Al-Kahf", transliteration: "The Cave", verses: 110 },
  { number: 19, name: "Maryam", transliteration: "Mary", verses: 98 },
  { number: 20, name: "Taha", transliteration: "Ta-Ha", verses: 135 },
  { number: 21, name: "Al-Anbya", transliteration: "The Prophets", verses: 112 },
  { number: 22, name: "Al-Hajj", transliteration: "The Pilgrimage", verses: 78 },
  { number: 23, name: "Al-Mu'minun", transliteration: "The Believers", verses: 118 },
  { number: 24, name: "An-Nur", transliteration: "The Light", verses: 64 },
  { number: 25, name: "Al-Furqan", transliteration: "The Criterion", verses: 77 },
  { number: 26, name: "Ash-Shu'ara", transliteration: "The Poets", verses: 227 },
  { number: 27, name: "An-Naml", transliteration: "The Ant", verses: 93 },
  { number: 28, name: "Al-Qasas", transliteration: "The Stories", verses: 88 },
  { number: 29, name: "Al-'Ankabut", transliteration: "The Spider", verses: 69 },
  { number: 30, name: "Ar-Rum", transliteration: "The Romans", verses: 60 },
  { number: 31, name: "Luqman", transliteration: "Luqman", verses: 34 },
  { number: 32, name: "As-Sajdah", transliteration: "The Prostration", verses: 30 },
  { number: 33, name: "Al-Ahzab", transliteration: "The Combined Forces", verses: 73 },
  { number: 34, name: "Saba", transliteration: "Sheba", verses: 54 },
  { number: 35, name: "Fatir", transliteration: "Originator", verses: 45 },
  { number: 36, name: "Ya-Sin", transliteration: "Ya Sin", verses: 83 },
  { number: 37, name: "As-Saffat", transliteration: "Those who set the Ranks", verses: 182 },
  { number: 38, name: "Sad", transliteration: "The Letter Sad", verses: 88 },
  { number: 39, name: "Az-Zumar", transliteration: "The Troops", verses: 75 },
  { number: 40, name: "Ghafir", transliteration: "The Forgiver", verses: 85 },
  { number: 41, name: "Fussilat", transliteration: "Explained in Detail", verses: 54 },
  { number: 42, name: "Ash-Shuraa", transliteration: "The Consultation", verses: 53 },
  { number: 43, name: "Az-Zukhruf", transliteration: "The Ornaments of Gold", verses: 89 },
  { number: 44, name: "Ad-Dukhan", transliteration: "The Smoke", verses: 59 },
  { number: 45, name: "Al-Jathiyah", transliteration: "The Crouching", verses: 37 },
  { number: 46, name: "Al-Ahqaf", transliteration: "The Wind-Curved Sandhills", verses: 35 },
  { number: 47, name: "Muhammad", transliteration: "Muhammad", verses: 38 },
  { number: 48, name: "Al-Fath", transliteration: "The Victory", verses: 29 },
  { number: 49, name: "Al-Hujurat", transliteration: "The Rooms", verses: 18 },
  { number: 50, name: "Qaf", transliteration: "The Letter Qaf", verses: 45 },
  { number: 51, name: "Adh-Dhariyat", transliteration: "The Winnowing Winds", verses: 60 },
  { number: 52, name: "At-Tur", transliteration: "The Mount", verses: 49 },
  { number: 53, name: "An-Najm", transliteration: "The Star", verses: 62 },
  { number: 54, name: "Al-Qamar", transliteration: "The Moon", verses: 55 },
  { number: 55, name: "Ar-Rahman", transliteration: "The Beneficent", verses: 78 },
  { number: 56, name: "Al-Waqi'ah", transliteration: "The Inevitable", verses: 96 },
  { number: 57, name: "Al-Hadid", transliteration: "The Iron", verses: 29 },
  { number: 58, name: "Al-Mujadila", transliteration: "The Pleading Woman", verses: 22 },
  { number: 59, name: "Al-Hashr", transliteration: "The Exile", verses: 24 },
  { number: 60, name: "Al-Mumtahanah", transliteration: "She that is to be examined", verses: 13 },
  { number: 61, name: "As-Saf", transliteration: "The Ranks", verses: 14 },
  { number: 62, name: "Al-Jumu'ah", transliteration: "The Congregation", verses: 11 },
  { number: 63, name: "Al-Munafiqun", transliteration: "The Hypocrites", verses: 11 },
  { number: 64, name: "At-Taghabun", transliteration: "The Mutual Disillusion", verses: 18 },
  { number: 65, name: "At-Talaq", transliteration: "The Divorce", verses: 12 },
  { number: 66, name: "At-Tahrim", transliteration: "The Prohibition", verses: 12 },
  { number: 67, name: "Al-Mulk", transliteration: "The Sovereignty", verses: 30 },
  { number: 68, name: "Al-Qalam", transliteration: "The Pen", verses: 52 },
  { number: 69, name: "Al-Haqqah", transliteration: "The Reality", verses: 52 },
  { number: 70, name: "Al-Ma'arij", transliteration: "The Ascending Stairways", verses: 44 },
  { number: 71, name: "Nuh", transliteration: "Noah", verses: 28 },
  { number: 72, name: "Al-Jinn", transliteration: "The Jinn", verses: 28 },
  { number: 73, name: "Al-Muzzammil", transliteration: "The Enshrouded One", verses: 20 },
  { number: 74, name: "Al-Muddaththir", transliteration: "The Cloaked One", verses: 56 },
  { number: 75, name: "Al-Qiyamah", transliteration: "The Resurrection", verses: 40 },
  { number: 76, name: "Al-Insan", transliteration: "The Man", verses: 31 },
  { number: 77, name: "Al-Mursalat", transliteration: "The Emissaries", verses: 50 },
  { number: 78, name: "An-Naba", transliteration: "The Tidings", verses: 40 },
  { number: 79, name: "An-Nazi'at", transliteration: "Those who drag forth", verses: 46 },
  { number: 80, name: "Abasa", transliteration: "He Frowned", verses: 42 },
  { number: 81, name: "At-Takwir", transliteration: "The Overthrowing", verses: 29 },
  { number: 82, name: "Al-Infitar", transliteration: "The Cleaving", verses: 19 },
  { number: 83, name: "Al-Mutaffifin", transliteration: "The Defrauding", verses: 36 },
  { number: 84, name: "Al-Inshiqaq", transliteration: "The Splitting Open", verses: 25 },
  { number: 85, name: "Al-Buruj", transliteration: "The Mansions of the Stars", verses: 22 },
  { number: 86, name: "At-Tariq", transliteration: "The Nightcommer", verses: 17 },
  { number: 87, name: "Al-A'la", transliteration: "The Most High", verses: 19 },
  { number: 88, name: "Al-Ghashiyah", transliteration: "The Overwhelming", verses: 26 },
  { number: 89, name: "Al-Fajr", transliteration: "The Dawn", verses: 30 },
  { number: 90, name: "Al-Balad", transliteration: "The City", verses: 20 },
  { number: 91, name: "Ash-Shams", transliteration: "The Sun", verses: 15 },
  { number: 92, name: "Al-Layl", transliteration: "The Night", verses: 21 },
  { number: 93, name: "Ad-Duhaa", transliteration: "The Morning Hours", verses: 11 },
  { number: 94, name: "Ash-Sharh", transliteration: "The Relief", verses: 8 },
  { number: 95, name: "At-Tin", transliteration: "The Fig", verses: 8 },
  { number: 96, name: "Al-Alaq", transliteration: "The Clot", verses: 19 },
  { number: 97, name: "Al-Qadr", transliteration: "The Power", verses: 5 },
  { number: 98, name: "Al-Bayyinah", transliteration: "The Clear Proof", verses: 8 },
  { number: 99, name: "Az-Zalzalah", transliteration: "The Earthquake", verses: 8 },
  { number: 100, name: "Al-Adiyat", transliteration: "The Courser", verses: 11 },
  { number: 101, name: "Al-Qari'ah", transliteration: "The Calamity", verses: 11 },
  { number: 102, name: "At-Takathur", transliteration: "The Rivalry in world increase", verses: 8 },
  { number: 103, name: "Al-Asr", transliteration: "The Declining Day", verses: 3 },
  { number: 104, name: "Al-Humazah", transliteration: "The Traducer", verses: 9 },
  { number: 105, name: "Al-Fil", transliteration: "The Elephant", verses: 5 },
  { number: 106, name: "Quraysh", transliteration: "Quraysh", verses: 4 },
  { number: 107, name: "Al-Ma'un", transliteration: "The Small kindnesses", verses: 7 },
  { number: 108, name: "Al-Kawthar", transliteration: "The Abundance", verses: 3 },
  { number: 109, name: "Al-Kafirun", transliteration: "The Disbelievers", verses: 6 },
  { number: 110, name: "An-Nasr", transliteration: "The Divine Support", verses: 3 },
  { number: 111, name: "Al-Masad", transliteration: "The Palm Fiber", verses: 5 },
  { number: 112, name: "Al-Ikhlas", transliteration: "The Sincerity", verses: 4 },
  { number: 113, name: "Al-Falaq", transliteration: "The Daybreak", verses: 5 },
  { number: 114, name: "An-Nas", transliteration: "Mankind", verses: 6 },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export async function GET() {
  try {
    // Return the static metadata
    // We could optionally verify counts from the database, but this is faster
    return NextResponse.json({
      success: true,
      data: SURAH_METADATA,
    });
  } catch (error) {
    console.error("[Surahs] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch surahs metadata",
      },
      { status: 500 }
    );
  }
}
