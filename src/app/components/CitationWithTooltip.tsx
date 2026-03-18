"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PairedVerse, ExtendedVerse, VerseContext } from "../types";
import { API_BASE } from "../../lib/api";

export function CitationWithTooltip({
  citation,
  verses,
  verseRefs,
  hasRange,
}: {
  citation: string;
  verses: PairedVerse[];
  verseRefs: Array<{ surah: number; ayah: number }>;
  hasRange: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextData, setContextData] = useState<Record<string, VerseContext | null>>({});
  const [loadingContext, setLoadingContext] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [allVerses, setAllVerses] = useState<ExtendedVerse[]>([]);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const totalVerses = verseRefs.length;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const fetchAllVerses = async () => {
    if (allVerses.length > 0) return;
    setLoadingVerses(true);
    const fetchedVerses: ExtendedVerse[] = [];

    for (const ref of verseRefs) {
      const existingVerse = verses.find((v) => v.surah === ref.surah && v.ayah === ref.ayah);
      if (existingVerse) {
        fetchedVerses.push({
          surah: existingVerse.surah,
          ayah: existingVerse.ayah,
          arabic: existingVerse.arabic,
          english: existingVerse.english,
          similarity: existingVerse.similarity,
        });
      } else {
        try {
          const res = await fetch(`${API_BASE}/api/quran/ayah?surah=${ref.surah}&ayah=${ref.ayah}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.data) {
              fetchedVerses.push({
                surah: ref.surah,
                ayah: ref.ayah,
                arabic: data.data.arabic || "",
                english: data.data.english || "",
              });
            }
          }
        } catch {
          fetchedVerses.push({ surah: ref.surah, ayah: ref.ayah, arabic: "", english: "Unable to load verse" });
        }
      }
    }

    setAllVerses(fetchedVerses);
    setLoadingVerses(false);
  };

  const fetchContext = async () => {
    const versesToFetch = allVerses.length > 0 ? allVerses : verses;
    if (versesToFetch.length === 0) return;
    const currentVerse = versesToFetch[currentVerseIndex];
    if (!currentVerse) return;
    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    if (contextData[key] !== undefined) return;

    setLoadingContext(true);
    try {
      const res = await fetch(`${API_BASE}/api/quran/context?surah=${currentVerse.surah}&ayah=${currentVerse.ayah}`);
      if (res.ok) {
        const data = await res.json();
        setContextData((prev) => ({
          ...prev,
          [key]: data.success && data.data ? data.data : null,
        }));
      } else {
        setContextData((prev) => ({ ...prev, [key]: null }));
      }
    } catch {
      setContextData((prev) => ({ ...prev, [key]: null }));
    }
    setLoadingContext(false);
  };

  useEffect(() => {
    if (isOpen && (allVerses.length > 0 || verses.length > 0)) {
      fetchContext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVerseIndex, isOpen, allVerses]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
    if (hasRange || verses.length === 0) await fetchAllVerses();
    fetchContext();
  };

  const goToPrevVerse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentVerseIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextVerse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentVerseIndex((prev) => Math.min(totalVerses - 1, prev + 1));
  };

  const handleClose = () => {
    setIsOpen(false);
    setCurrentVerseIndex(0);
  };

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  const versesToShow = allVerses.length > 0 ? allVerses : verses;
  const currentVerse = versesToShow[currentVerseIndex];

  const renderContent = () => {
    if (loadingVerses) {
      return (
        <div className="p-4 flex items-center justify-center">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      );
    }

    if (!currentVerse) {
      return <div className="p-4 text-sm text-muted">Unable to load verse</div>;
    }

    const key = `${currentVerse.surah}:${currentVerse.ayah}`;
    const context = contextData[key];

    return (
      <div className="p-4">
        {totalVerses > 1 && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/40">
            <button
              onClick={goToPrevVerse}
              disabled={currentVerseIndex === 0}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-xs font-medium text-muted">{currentVerseIndex + 1} / {totalVerses}</span>
            <button
              onClick={goToNextVerse}
              disabled={currentVerseIndex === totalVerses - 1}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
              Surah {currentVerse.surah}, Ayah {currentVerse.ayah}
            </span>
            {context?.theme && (
              <>
                <span className="text-muted-foreground/40 hidden sm:inline">•</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">{context.theme}</span>
              </>
            )}
          </div>
          {currentVerse.similarity !== undefined && (
            <span className="text-[10px] text-muted-foreground/60">{(currentVerse.similarity * 100).toFixed(0)}% match</span>
          )}
        </div>

        {currentVerse.arabic && (
          <p className="text-lg sm:text-xl leading-loose text-foreground mb-3 font-arabic text-right" dir="rtl">
            {currentVerse.arabic}
          </p>
        )}

        <p className="text-sm leading-relaxed text-muted-foreground mb-3">{currentVerse.english}</p>

        {loadingContext && context === undefined && (
          <div className="text-xs text-muted italic">Loading context...</div>
        )}

        {context && (
          <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
            {context.context_summary && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Context</div>
                <p className="text-xs leading-relaxed text-muted-foreground">{context.context_summary}</p>
              </div>
            )}
            {context.asbab_summary && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Occasion</div>
                <p className="text-xs leading-relaxed text-muted-foreground">{context.asbab_summary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const hasContent = verseRefs.length > 0;

  return (
    <>
      <span
        ref={triggerRef}
        onClick={hasContent ? handleClick : undefined}
        className={`citation-badge mx-0.5 ${hasContent ? "cursor-pointer" : "cursor-default opacity-60"}`}
        title={!hasContent ? "Verse preview not available" : undefined}
      >
        {citation}
      </span>

      {mounted && isOpen && hasContent &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
            style={{
              display: "flex",
              alignItems: isMobile ? "flex-end" : "center",
              justifyContent: "center",
              padding: isMobile ? 0 : "1rem",
            }}
          >
            <div
              className={`relative bg-background shadow-2xl overflow-hidden ${
                isMobile
                  ? "w-full max-h-[85vh] border-t border-border/50 rounded-t-2xl animate-slide-up"
                  : "w-full max-w-lg max-h-[80vh] border border-border/50 rounded-2xl animate-fade-in"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-mono text-muted-foreground">{citation}</span>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-accent hover:bg-accent/70 transition-colors"
                >
                  <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className={`overflow-y-auto ${isMobile ? "max-h-[calc(85vh-56px)]" : "max-h-[calc(80vh-56px)]"}`}>
                {renderContent()}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
