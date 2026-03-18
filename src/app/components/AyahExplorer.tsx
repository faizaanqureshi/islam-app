"use client";

import { useState, useRef, useEffect } from "react";
import type { Surah, Verse } from "../types";
import { VerseModal } from "./VerseModal";
import { API_BASE } from "../../lib/api";

export function AyahExplorer() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [, setIsLoadingSurahs] = useState(true);
  const [isLoadingVerses, setIsLoadingVerses] = useState(true);
  const [selectedVerse, setSelectedVerse] = useState<{
    surah: number; ayah: number; arabic: string; english: string;
  } | null>(null);
  const [urlKey, setUrlKey] = useState(0);

  const [viewMode, setViewMode] = useState<"surah" | "safh">("surah");
  const [pageMap, setPageMap] = useState<Record<number, number>>({});
  const [currentSafePage, setCurrentSafePage] = useState<number>(0);
  const [isLoadingPageMap, setIsLoadingPageMap] = useState(false);

  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reciter, setReciter] = useState("Alafasy_128kbps");
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRateRef = useRef(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const versesRef = useRef<Verse[]>([]);
  const reciterRef = useRef("Alafasy_128kbps");
  const selectedSurahRef = useRef(1);
  const playingModeRef = useRef<"single" | "surah">("surah");
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const verseElemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const safhPageRef = useRef<HTMLDivElement | null>(null);
  const timeUpdateListenerRef = useRef<(() => void) | null>(null);
  const pageMapRef = useRef<Record<number, number>>({});
  const currentSafePageRef = useRef<number>(0);
  const fadeInIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const RECITERS = [
    { id: "Alafasy_128kbps", name: "Mishary Al Afasy" },
    { id: "Yasser_Ad-Dussary_128kbps", name: "Yasser Al Dosari" },
  ];

  useEffect(() => {
    const handleUrlChange = () => setUrlKey((prev) => prev + 1);
    window.addEventListener("popstate", handleUrlChange);
    const interval = setInterval(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("surah") || params.get("ayah")) handleUrlChange();
    }, 500);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const surahParam = params.get("surah");
    const ayahParam = params.get("ayah");
    if (surahParam && ayahParam && verses.length > 0 && !isLoadingVerses) {
      const surah = parseInt(surahParam);
      const ayah = parseInt(ayahParam);
      if (!isNaN(surah) && !isNaN(ayah)) {
        if (surah !== selectedSurah) { setSelectedSurah(surah); return; }
        const verse = verses.find((v) => v.ayah === ayah);
        if (verse) setSelectedVerse({ surah, ayah, arabic: verse.arabic, english: verse.english });
      }
    }
  }, [verses, isLoadingVerses, urlKey, selectedSurah]);

  useEffect(() => {
    async function fetchSurahs() {
      try {
        const response = await fetch(`${API_BASE}/api/quran/surahs`);
        const data = await response.json();
        if (data.success) setSurahs(data.data);
      } catch (error) {
        console.error("Failed to fetch surahs:", error);
      } finally {
        setIsLoadingSurahs(false);
      }
    }
    fetchSurahs();
  }, []);

  useEffect(() => {
    async function fetchVerses() {
      setIsLoadingVerses(true);
      try {
        const response = await fetch(`${API_BASE}/api/quran/surah/${selectedSurah}`);
        const data = await response.json();
        if (data.success) setVerses(data.data.verses);
      } catch (error) {
        console.error("Failed to fetch verses:", error);
      } finally {
        setIsLoadingVerses(false);
      }
    }
    fetchVerses();
  }, [selectedSurah]);

  useEffect(() => { versesRef.current = verses; }, [verses]);
  useEffect(() => { pageMapRef.current = pageMap; }, [pageMap]);
  useEffect(() => { currentSafePageRef.current = currentSafePage; }, [currentSafePage]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (nextAudioRef.current) nextAudioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => { reciterRef.current = reciter; }, [reciter]);
  useEffect(() => { selectedSurahRef.current = selectedSurah; }, [selectedSurah]);

  useEffect(() => {
    if (playingAyah !== null) {
      verseElemRefs.current[playingAyah]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingAyah]);

  useEffect(() => {
    if (viewMode !== "safh" || playingAyah === null) return;
    const page = pageMapRef.current[playingAyah];
    if (page && page !== currentSafePageRef.current) setCurrentSafePage(page);
  }, [playingAyah, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { stopAudio(); }, [selectedSurah]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = safhPageRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      if (touchStartXRef.current === null || touchStartYRef.current === null) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
      const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
      if (dx > dy && dx > 8) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  });

  useEffect(() => () => stopAudio(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode !== "safh") return;
    let cancelled = false;
    setPageMap({});
    setCurrentSafePage(0);
    setIsLoadingPageMap(true);
    fetch(`${API_BASE}/api/quran/page-info/${selectedSurah}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setPageMap(data.data);
          const firstPage = Math.min(...Object.values(data.data as Record<number, number>));
          setCurrentSafePage(firstPage);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setIsLoadingPageMap(false); });
    return () => { cancelled = true; };
  }, [viewMode, selectedSurah]); // eslint-disable-line react-hooks/exhaustive-deps

  const safhePages: number[] = Object.keys(pageMap).length
    ? [...new Set(Object.values(pageMap))].sort((a, b) => a - b)
    : [];
  const currentSafePageVerses = verses.filter((v) => pageMap[v.ayah] === currentSafePage);
  const safePageIndex = safhePages.indexOf(currentSafePage);
  const prevSafePage = safePageIndex > 0 ? safhePages[safePageIndex - 1] : null;
  const nextSafePage = safePageIndex < safhePages.length - 1 ? safhePages[safePageIndex + 1] : null;

  const stopAudio = () => {
    if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }
    if (audioRef.current) {
      if (timeUpdateListenerRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeUpdateListenerRef.current);
        timeUpdateListenerRef.current = null;
      }
      audioRef.current.pause();
      audioRef.current.volume = 1;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    nextAudioRef.current = null;
    setIsPlaying(false);
    setPlayingAyah(null);
  };

  const startPlaying = (ayahNumber: number, mode: "single" | "surah", prefetched?: HTMLAudioElement) => {
    if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }
    if (audioRef.current) {
      if (timeUpdateListenerRef.current) {
        audioRef.current.removeEventListener("timeupdate", timeUpdateListenerRef.current);
        timeUpdateListenerRef.current = null;
      }
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
    }
    setPlayingAyah(ayahNumber);
    setIsPlaying(true);
    playingModeRef.current = mode;

    const s = String(selectedSurahRef.current).padStart(3, "0");
    const a = String(ayahNumber).padStart(3, "0");
    const url = `https://everyayah.com/data/${reciterRef.current}/${s}${a}.mp3`;
    const audio = prefetched ?? new Audio(url);
    audio.playbackRate = playbackRateRef.current;
    audioRef.current = audio;

    if (mode === "surah") {
      const vList = versesRef.current;
      const idx = vList.findIndex((v) => v.ayah === ayahNumber);
      if (idx >= 0 && idx < vList.length - 1) {
        const ns = String(selectedSurahRef.current).padStart(3, "0");
        const na = String(vList[idx + 1].ayah).padStart(3, "0");
        const next = new Audio(`https://everyayah.com/data/${reciterRef.current}/${ns}${na}.mp3`);
        next.preload = "auto";
        next.playbackRate = playbackRateRef.current;
        nextAudioRef.current = next;
      } else {
        nextAudioRef.current = null;
      }
    }

    const handleTimeUpdate = () => {
      if (!audio.duration || audio.paused) return;
      const remaining = audio.duration - audio.currentTime;
      if (remaining <= 0.15) audio.volume = Math.max(0, remaining / 0.15);
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    timeUpdateListenerRef.current = handleTimeUpdate;

    const cleanupAudio = () => {
      if (timeUpdateListenerRef.current) {
        audio.removeEventListener("timeupdate", timeUpdateListenerRef.current);
        timeUpdateListenerRef.current = null;
      }
      if (fadeInIntervalRef.current) { clearInterval(fadeInIntervalRef.current); fadeInIntervalRef.current = null; }
    };

    audio.onended = () => {
      cleanupAudio();
      if (playingModeRef.current === "single") {
        setIsPlaying(false); setPlayingAyah(null); audioRef.current = null;
      } else {
        const vList = versesRef.current;
        const idx = vList.findIndex((v) => v.ayah === ayahNumber);
        if (idx >= 0 && idx < vList.length - 1) {
          const buffered = nextAudioRef.current;
          nextAudioRef.current = null;
          if (audioRef.current === audio) startPlaying(vList[idx + 1].ayah, "surah", buffered ?? undefined);
        } else {
          setIsPlaying(false); setPlayingAyah(null); audioRef.current = null; nextAudioRef.current = null;
        }
      }
    };

    audio.onerror = () => {
      cleanupAudio();
      setIsPlaying(false); setPlayingAyah(null); audioRef.current = null; nextAudioRef.current = null;
    };

    if (mode === "surah") {
      audio.volume = 0;
      audio.play().then(() => {
        let vol = 0;
        fadeInIntervalRef.current = setInterval(() => {
          vol = Math.min(1, vol + 0.25);
          if (audioRef.current === audio) audio.volume = vol;
          if (vol >= 1) { clearInterval(fadeInIntervalRef.current!); fadeInIntervalRef.current = null; }
        }, 20);
      }).catch(() => { setIsPlaying(false); setPlayingAyah(null); audioRef.current = null; });
    } else {
      audio.play().catch(() => { setIsPlaying(false); setPlayingAyah(null); audioRef.current = null; });
    }
  };

  const handleVersePlay = (ayahNumber: number) => {
    if (playingAyah === ayahNumber && isPlaying) {
      audioRef.current?.pause(); setIsPlaying(false);
    } else if (playingAyah === ayahNumber && !isPlaying) {
      if (audioRef.current) audioRef.current.volume = 1;
      audioRef.current?.play().catch(() => {}); setIsPlaying(true);
    } else {
      startPlaying(ayahNumber, "single");
    }
  };

  const handleSurahPlay = () => {
    if (isPlaying) {
      audioRef.current?.pause(); setIsPlaying(false);
    } else if (playingAyah !== null && audioRef.current) {
      audioRef.current.volume = 1; audioRef.current.play().catch(() => {}); setIsPlaying(true);
    } else {
      const vList = versesRef.current;
      if (vList.length > 0) startPlaying(vList[0].ayah, "surah");
    }
  };

  const currentSurah = surahs.find((s) => s.number === selectedSurah);

  return (
    <>
      <div className="min-h-[calc(100vh-3.5rem)]">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Surah Selector */}
          <div className="mb-8 animate-fade-in">
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-3 font-medium">
              Select Surah
            </label>
            <select
              value={selectedSurah}
              onChange={(e) => setSelectedSurah(Number(e.target.value))}
              className="w-full max-w-md px-4 py-3 rounded-xl border border-border/80 bg-background text-[15px] text-foreground transition-all duration-200 hover:border-border focus:border-foreground/20 focus:ring-0 focus:outline-none"
            >
              {surahs.map((surah) => (
                <option key={surah.number} value={surah.number}>
                  {surah.number}. {surah.name} ({surah.transliteration}) - {surah.verses} verses
                </option>
              ))}
            </select>
          </div>

          {/* Surah Header */}
          {currentSurah && !isLoadingVerses && (
            <div className="mb-8 text-center animate-fade-in">
              <h1 className="font-display text-4xl font-light text-foreground mb-1" style={{ letterSpacing: "0.04em" }}>
                {currentSurah.name}
              </h1>
              <p className="text-sm text-muted-foreground mb-5">{currentSurah.transliteration}</p>

              {/* Audio controls */}
              <div className="flex items-center justify-center gap-2.5 flex-wrap">
                <button
                  onClick={handleSurahPlay}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200"
                  style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)", color: "var(--gold)" }}
                >
                  {isPlaying ? (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>Pause</>
                  ) : playingAyah !== null ? (
                    <><svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Resume</>
                  ) : (
                    <><svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Play Surah</>
                  )}
                </button>

                <div className="flex overflow-hidden rounded-lg border border-border/60 text-[12px]">
                  {RECITERS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { setReciter(r.id); reciterRef.current = r.id; if (playingAyah !== null) stopAudio(); }}
                      className="px-3 py-1.5 transition-colors"
                      style={reciter === r.id ? { background: "var(--gold-muted)", color: "var(--gold)" } : { color: "var(--muted-foreground)" }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5];
                    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                    setPlaybackRate(next);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-border/60 text-[12px] transition-colors"
                  style={playbackRate !== 1 ? { background: "var(--gold-muted)", color: "var(--gold)", borderColor: "var(--gold-border)" } : { color: "var(--muted-foreground)" }}
                  title="Playback speed"
                >
                  {playbackRate}×
                </button>

                {playingAyah !== null && (
                  <button
                    onClick={stopAudio}
                    title="Stop playback"
                    className="p-1.5 rounded-lg transition-colors text-muted-foreground/50 hover:text-muted-foreground"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="4" width="16" height="16" rx="2"/>
                    </svg>
                  </button>
                )}

                <div className="flex overflow-hidden rounded-lg border border-border/60 text-[12px] ml-1">
                  {(["surah", "safh"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className="px-3 py-1.5 transition-colors capitalize"
                      style={viewMode === mode ? { background: "var(--gold-muted)", color: "var(--gold)" } : { color: "var(--muted-foreground)" }}
                    >
                      {mode === "surah" ? "Surah" : "Safh"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 w-16 h-[1px] bg-border/50 mx-auto" />
            </div>
          )}

          {/* Loading State */}
          {isLoadingVerses && (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {/* Verses — Surah mode */}
          {!isLoadingVerses && viewMode === "surah" && (
            <div className="space-y-8 animate-fade-in">
              {verses.map((verse) => (
                <div
                  key={verse.ayah}
                  ref={(el) => { verseElemRefs.current[verse.ayah] = el; }}
                  className="group relative transition-all duration-400"
                  style={{
                    paddingLeft: "1rem", marginLeft: "-1rem",
                    borderLeft: `2px solid ${playingAyah === verse.ayah ? "var(--gold)" : "transparent"}`,
                    transition: "border-color 0.4s ease",
                  }}
                  data-ayah={verse.ayah}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => handleVersePlay(verse.ayah)}
                      title={`Play verse ${verse.ayah}`}
                      className="relative flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-200"
                      style={playingAyah === verse.ayah ? { background: "var(--gold-muted)", borderColor: "var(--gold-border)" } : undefined}
                      {...(playingAyah !== verse.ayah && {
                        className: "relative flex items-center justify-center w-8 h-8 rounded-full border border-border/50 bg-foreground/[0.04] dark:bg-foreground/[0.06] transition-all duration-200 hover:border-[var(--gold)]/40",
                      })}
                    >
                      {playingAyah === verse.ayah && isPlaying ? (
                        <div className="flex gap-[3px]">
                          <div className="w-[3px] h-3 rounded-full" style={{ background: "var(--gold)" }} />
                          <div className="w-[3px] h-3 rounded-full" style={{ background: "var(--gold)" }} />
                        </div>
                      ) : playingAyah === verse.ayah && !isPlaying ? (
                        <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--gold)" }}>
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground transition-opacity group-hover:opacity-70">
                          {verse.ayah}
                        </span>
                      )}
                    </button>
                    <div className="flex-1 h-[1px] bg-border/30" />
                  </div>

                  <div
                    className="cursor-pointer transition-all duration-200 hover:opacity-70"
                    onClick={() => setSelectedVerse({ surah: selectedSurah, ayah: verse.ayah, arabic: verse.arabic, english: verse.english })}
                  >
                    {verse.arabic && (
                      <p className="text-right font-arabic text-2xl leading-loose text-foreground mb-6" dir="rtl">
                        {verse.arabic}
                      </p>
                    )}
                    <p className="text-[15px] leading-relaxed text-muted-foreground">{verse.english}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Safh (page) mode */}
          {!isLoadingVerses && viewMode === "safh" && (
            <div className="animate-fade-in">
              {isLoadingPageMap ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              ) : safhePages.length === 0 ? (
                <p className="text-center text-muted-foreground py-20 text-sm">Unable to load page data.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <button
                      onClick={() => nextSafePage && setCurrentSafePage(nextSafePage)}
                      disabled={!nextSafePage}
                      className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-opacity hover:opacity-70 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 5l-7 7 7 7"/>
                      </svg>
                      <span className="hidden sm:inline">Next</span>
                    </button>
                    <p className="text-[11px] uppercase tracking-widest text-muted">
                      {safePageIndex + 1} / {safhePages.length} pages
                    </p>
                    <button
                      onClick={() => prevSafePage && setCurrentSafePage(prevSafePage)}
                      disabled={!prevSafePage}
                      className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-opacity hover:opacity-70 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <span className="hidden sm:inline">Prev</span>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>

                  <div
                    ref={safhPageRef}
                    onTouchStart={(e) => {
                      if (e.touches.length > 1) return;
                      touchStartXRef.current = e.touches[0].clientX;
                      touchStartYRef.current = e.touches[0].clientY;
                    }}
                    onTouchEnd={(e) => {
                      if (touchStartXRef.current === null) return;
                      if (e.touches.length > 0) return;
                      const delta = e.changedTouches[0].clientX - touchStartXRef.current;
                      touchStartXRef.current = null; touchStartYRef.current = null;
                      if (Math.abs(delta) < 50) return;
                      if (delta > 0 && nextSafePage) setCurrentSafePage(nextSafePage);
                      else if (delta < 0 && prevSafePage) setCurrentSafePage(prevSafePage);
                    }}
                    style={{
                      position: "relative", border: "1px solid var(--gold-border)",
                      borderRadius: "4px", padding: "1px", boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                    }}
                  >
                    {[
                      { top: -1, left: -1, borderTop: "1.5px solid var(--gold)", borderLeft: "1.5px solid var(--gold)", borderRadius: "3px 0 0 0" },
                      { top: -1, right: -1, borderTop: "1.5px solid var(--gold)", borderRight: "1.5px solid var(--gold)", borderRadius: "0 3px 0 0" },
                      { bottom: -1, left: -1, borderBottom: "1.5px solid var(--gold)", borderLeft: "1.5px solid var(--gold)", borderRadius: "0 0 0 3px" },
                      { bottom: -1, right: -1, borderBottom: "1.5px solid var(--gold)", borderRight: "1.5px solid var(--gold)", borderRadius: "0 0 3px 0" },
                    ].map((s, i) => (
                      <span key={i} style={{ position: "absolute", width: 14, height: 14, ...s }} />
                    ))}

                    <div style={{ border: "1px solid var(--gold-border)", borderRadius: "3px", padding: "1rem 1rem" }}>
                      <p className="font-arabic text-lg sm:text-xl md:text-2xl text-right" dir="rtl" style={{ lineHeight: "2.8" }}>
                        {currentSafePageVerses.map((verse) => (
                          <span
                            key={verse.ayah}
                            ref={(el) => { verseElemRefs.current[verse.ayah] = el as unknown as HTMLDivElement; }}
                            style={{
                              color: playingAyah === verse.ayah ? "var(--gold)" : "var(--foreground)",
                              transition: "color 0.3s ease", cursor: "pointer",
                            }}
                            onClick={() => setSelectedVerse({ surah: selectedSurah, ayah: verse.ayah, arabic: verse.arabic, english: verse.english })}
                          >
                            {verse.arabic}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVersePlay(verse.ayah); }}
                              title={`Play verse ${verse.ayah}`}
                              className="inline-flex items-center justify-center align-middle mx-1.5 transition-all duration-200"
                              style={{
                                width: "1.4rem", height: "1.4rem", borderRadius: "50%",
                                fontSize: "0.58rem", fontFamily: "sans-serif",
                                background: playingAyah === verse.ayah ? "var(--gold)" : "var(--gold-muted)",
                                color: playingAyah === verse.ayah ? "var(--background)" : "var(--gold)",
                                border: "1px solid var(--gold-border)", verticalAlign: "middle", lineHeight: 1,
                              }}
                            >
                              {playingAyah === verse.ayah && isPlaying ? (
                                <span style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                                  <span style={{ width: "2px", height: "7px", borderRadius: "1px", background: "currentColor", display: "block" }} />
                                  <span style={{ width: "2px", height: "7px", borderRadius: "1px", background: "currentColor", display: "block" }} />
                                </span>
                              ) : verse.ayah}
                            </button>
                          </span>
                        ))}
                      </p>

                      <div className="mt-8 pt-6 space-y-3" style={{ borderTop: "1px solid var(--gold-border)" }}>
                        {currentSafePageVerses.map((verse) => (
                          <div key={verse.ayah} className="flex items-start gap-3">
                            <span className="shrink-0 text-[11px] font-mono tabular-nums mt-0.5 w-5 text-right" style={{ color: "var(--gold)" }}>
                              {verse.ayah}
                            </span>
                            <p className="text-[13px] leading-relaxed text-muted-foreground flex-1">{verse.english}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-8 pt-4 flex items-center justify-center gap-4" style={{ borderTop: "1px solid var(--gold-border)" }}>
                        <div className="h-[1px] flex-1" style={{ background: "linear-gradient(to right, transparent, var(--gold-border))" }} />
                        <span className="font-arabic text-base" style={{ color: "var(--gold)", opacity: 0.7 }}>{currentSafePage}</span>
                        <div className="h-[1px] flex-1" style={{ background: "linear-gradient(to left, transparent, var(--gold-border))" }} />
                      </div>
                    </div>
                  </div>

                  <p className="text-center text-[11px] text-muted-foreground/40 mt-4">Swipe left / right to turn pages</p>
                </>
              )}
            </div>
          )}

          {/* Surah navigation */}
          {!isLoadingVerses && surahs.length > 0 && (
            <div className="flex items-center justify-between mt-16 pt-8 border-t border-border/40">
              {selectedSurah > 1 ? (
                <button
                  onClick={() => { stopAudio(); setSelectedSurah(selectedSurah - 1); }}
                  className="group flex items-center gap-3 text-left transition-opacity hover:opacity-70"
                >
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">Previous</p>
                    <p className="font-display text-base font-light text-foreground" style={{ letterSpacing: "0.03em" }}>
                      {surahs.find((s) => s.number === selectedSurah - 1)?.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {surahs.find((s) => s.number === selectedSurah - 1)?.transliteration}
                    </p>
                  </div>
                </button>
              ) : <div />}

              {selectedSurah < 114 ? (
                <button
                  onClick={() => { stopAudio(); setSelectedSurah(selectedSurah + 1); }}
                  className="group flex items-center gap-3 text-right transition-opacity hover:opacity-70"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">Next</p>
                    <p className="font-display text-base font-light text-foreground" style={{ letterSpacing: "0.03em" }}>
                      {surahs.find((s) => s.number === selectedSurah + 1)?.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {surahs.find((s) => s.number === selectedSurah + 1)?.transliteration}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              ) : <div />}
            </div>
          )}

        </div>
      </div>

      {selectedVerse && (
        <VerseModal
          verse={selectedVerse}
          surahs={surahs}
          onNavigate={(s, a, ar, en) => {
            setSelectedVerse({ surah: s, ayah: a, arabic: ar, english: en });
            if (s !== selectedSurah) setSelectedSurah(s);
            const url = new URL(window.location.href);
            url.searchParams.set("surah", String(s));
            url.searchParams.set("ayah", String(a));
            window.history.replaceState({}, "", url.toString());
          }}
          onClose={() => {
            setSelectedVerse(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("surah");
            url.searchParams.delete("ayah");
            window.history.replaceState({}, "", url.toString());
          }}
        />
      )}
    </>
  );
}
