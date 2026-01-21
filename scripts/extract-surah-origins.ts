/**
 * Script to extract Makkah/Madinah origin from surah JSON files
 * and create a mapping file
 */

import * as fs from "fs";
import * as path from "path";

const QURAN_DIR = path.join(process.cwd(), "public", "the_clear_quran_english");
const OUTPUT_PATH = path.join(process.cwd(), "public", "surah-origins.json");

interface SurahMetadata {
  id: number;
  city: string;
  name: {
    translated: string;
    transliterated: string;
  };
}

async function extractSurahOrigins() {
  const surahOrigins: Record<number, string> = {};

  console.log("Extracting surah origins from JSON files...");

  // Read all JSON files (1.json to 114.json)
  for (let i = 1; i <= 114; i++) {
    const filePath = path.join(QURAN_DIR, `${i}.json`);

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content) as [SurahMetadata, ...unknown[]];

      // First element contains metadata
      const metadata = data[0];

      if (metadata && metadata.city) {
        surahOrigins[metadata.id] = metadata.city;
        console.log(`  ${metadata.id}. ${metadata.name.transliterated}: ${metadata.city}`);
      } else {
        console.warn(`  Warning: No city found for surah ${i}`);
      }
    } catch (error) {
      console.error(`  Error reading surah ${i}:`, error);
    }
  }

  // Write to output file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(surahOrigins, null, 2), "utf-8");

  console.log(`\n✓ Surah origins extracted to ${OUTPUT_PATH}`);
  console.log(`Total surahs: ${Object.keys(surahOrigins).length}`);

  // Count Makki vs Madani
  const makki = Object.values(surahOrigins).filter((city) => city === "makkah").length;
  const madani = Object.values(surahOrigins).filter((city) => city === "madinah").length;

  console.log(`\nMakki surahs: ${makki}`);
  console.log(`Madani surahs: ${madani}`);
}

extractSurahOrigins().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
