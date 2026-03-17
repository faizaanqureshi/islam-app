/**
 * One-time script: fetch the Madani Mushaf page number for every Quranic verse
 * from the Quran.com public API and write the result to public/quran-page-numbers.json
 *
 * Format: { "surah": { "ayah": pageNumber } }
 * e.g. { "1": { "1": 1, "2": 1 }, "2": { "1": 2, ... } }
 *
 * Usage:
 *   pnpm fetch:page-numbers
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const TOTAL_SURAHS = 114;
const PER_PAGE = 50;
const DELAY_MS = 120; // stay well under rate limits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchSurahPageNumbers(
  surahNum: number
): Promise<Record<number, number>> {
  const base = `https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?fields=page_number&per_page=${PER_PAGE}`;
  const pageMap: Record<number, number> = {};

  let apiPage = 1;
  let totalApiPages = 1;

  do {
    const res = await fetch(`${base}&page=${apiPage}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(
        `Quran.com API error ${res.status} for surah ${surahNum} page ${apiPage}`
      );
    }

    const data = await res.json();
    totalApiPages = data.pagination?.total_pages ?? 1;

    for (const v of data.verses ?? []) {
      pageMap[v.verse_number] = v.page_number;
    }

    apiPage++;
    if (apiPage <= totalApiPages) await sleep(DELAY_MS);
  } while (apiPage <= totalApiPages);

  return pageMap;
}

async function main() {
  const result: Record<string, Record<string, number>> = {};
  let totalVerses = 0;

  for (let s = 1; s <= TOTAL_SURAHS; s++) {
    process.stdout.write(`Fetching surah ${s}/${TOTAL_SURAHS}...`);
    const map = await fetchSurahPageNumbers(s);
    const count = Object.keys(map).length;
    result[String(s)] = Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, v])
    );
    totalVerses += count;
    console.log(` ${count} verses`);
    if (s < TOTAL_SURAHS) await sleep(DELAY_MS);
  }

  const outPath = resolve(process.cwd(), "public", "quran-page-numbers.json");
  writeFileSync(outPath, JSON.stringify(result), "utf-8");
  console.log(`\nDone. ${totalVerses} verses written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
