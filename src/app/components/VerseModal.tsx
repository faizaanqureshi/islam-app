"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { VerseContext, RelatedAyah, VerseModalProps } from "../types";

export function VerseModal({ verse, surahs, onNavigate, onClose }: VerseModalProps) {
  const [context, setContext] = useState<VerseContext | null>(null);
  const [city, setCity] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [relatedAyahs, setRelatedAyahs] = useState<RelatedAyah[]>([]);
  const [navStack, setNavStack] = useState<{ surah: number; ayah: number; arabic: string; english: string }[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?surah=${verse.surah}&ayah=${verse.ayah}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    async function fetchVerseDetails() {
      setIsLoading(true);
      setContext(null);
      try {
        const originsRes = await fetch("/surah-origins.json");
        const origins = await originsRes.json();
        setCity(origins[verse.surah] || "");

        const ctxRes = await fetch(`/api/quran/context?surah=${verse.surah}&ayah=${verse.ayah}`);
        if (ctxRes.ok) {
          const ctxData = await ctxRes.json();
          if (ctxData.success && ctxData.data) {
            setContext(ctxData.data);
          }
        }
      } catch (error) {
        console.error("Failed to fetch verse details:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVerseDetails();
  }, [verse.surah, verse.ayah]);

  useEffect(() => {
    async function fetchRelated() {
      setIsLoadingRelated(true);
      setRelatedAyahs([]);
      try {
        const res = await fetch(`/api/quran/related?surah=${verse.surah}&ayah=${verse.ayah}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) setRelatedAyahs(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch related verses:", error);
      } finally {
        setIsLoadingRelated(false);
      }
    }
    fetchRelated();
  }, [verse.surah, verse.ayah]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleRelatedClick = (r: RelatedAyah) => {
    setNavStack((prev) => [...prev, { surah: verse.surah, ayah: verse.ayah, arabic: verse.arabic, english: verse.english }]);
    onNavigate(r.surah, r.ayah, r.arabic, r.english);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = navStack[index];
    setNavStack((prev) => prev.slice(0, index));
    onNavigate(target.surah, target.ayah, target.arabic, target.english);
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed top-0 left-0 w-screen h-screen z-[9999] bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      style={{ display: "grid", placeItems: "center", margin: 0, padding: "1rem" }}
    >
      <div
        className="relative w-full max-w-2xl lg:max-w-4xl max-h-[85vh] overflow-y-auto bg-background border border-border/50 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            onClick={copyShareLink}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/[0.06] transition-colors"
            title="Copy share link"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-8">
          {/* Breadcrumb navigation */}
          {navStack.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-5 -mt-1">
              {navStack.map((v, i) => {
                const name = surahs.find((s) => s.number === v.surah)?.name ?? `Surah ${v.surah}`;
                return (
                  <span key={`${v.surah}:${v.ayah}-${i}`} className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleBreadcrumbClick(i)}
                      className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors underline-offset-2 hover:underline"
                    >
                      {name} {v.surah}:{v.ayah}
                    </button>
                    <span className="text-muted-foreground/25 text-xs select-none">›</span>
                  </span>
                );
              })}
              <span className="text-[11px] text-muted-foreground/80">
                {surahs.find((s) => s.number === verse.surah)?.name ?? `Surah ${verse.surah}`} {verse.surah}:{verse.ayah}
              </span>
            </div>
          )}

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">
                Surah {verse.surah}:{verse.ayah}
              </span>
              {city && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-sm text-muted-foreground capitalize">{city}</span>
                </>
              )}
              {context?.theme && (
                <>
                  <span className="text-muted-foreground/30">•</span>
                  <span className="text-xs px-2 py-1 rounded-md bg-foreground/[0.04] dark:bg-foreground/[0.06] text-muted-foreground">
                    {context.theme}
                  </span>
                </>
              )}
            </div>
            <div className="h-[1px] bg-border/30" />
          </div>

          {/* Arabic Text */}
          <p className="text-right font-arabic text-3xl leading-loose text-foreground mb-8" dir="rtl">
            {verse.arabic}
          </p>

          {/* English Translation */}
          <p className="text-base leading-relaxed text-muted-foreground mb-8">
            {verse.english}
          </p>

          {/* Context Section */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : context ? (
            <div className="space-y-6">
              <div className="h-[1px] bg-border/30" />

              {context.context_summary && (
                <div>
                  <h3 className="font-display text-base font-medium text-foreground mb-3 tracking-wide">Context</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{context.context_summary}</p>
                </div>
              )}

              {context.asbab_summary && (
                <div>
                  <h3 className="font-display text-base font-medium text-foreground mb-3 tracking-wide">Occasion of Revelation</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{context.asbab_summary}</p>
                </div>
              )}

              {context.scholarly_notes && (
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-foreground mb-3 flex items-center gap-2 hover:text-foreground/80 transition-colors">
                    <svg
                      className="w-3 h-3 transition-transform group-open:rotate-90"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Scholarly Notes
                  </summary>
                  <p className="text-sm leading-relaxed text-muted-foreground pl-5">{context.scholarly_notes}</p>
                </details>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground/60">No contextual information available for this verse.</p>
            </div>
          )}

          {/* Related Verses */}
          {(isLoadingRelated || relatedAyahs.length > 0) && (
            <div className="mt-6">
              <div className="h-[1px] bg-border/30 mb-6" />
              <h3 className="font-display text-base font-medium text-foreground mb-4 tracking-wide">Related Verses</h3>

              {isLoadingRelated ? (
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex-none w-[260px] h-[140px] rounded-xl bg-foreground/[0.04] animate-pulse snap-start" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0">
                  {relatedAyahs.map((r) => {
                    const surahLabel = surahs.find((s) => s.number === r.surah)?.name ?? `Surah ${r.surah}`;
                    return (
                      <button
                        key={`${r.surah}:${r.ayah}`}
                        onClick={() => handleRelatedClick(r)}
                        className="flex-none w-[260px] sm:w-auto text-left rounded-xl border border-border/50 bg-foreground/[0.02] hover:bg-foreground/[0.05] hover:border-border/80 transition-all duration-150 p-4 snap-start"
                      >
                        <div className="mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {surahLabel} {r.surah}:{r.ayah}
                          </span>
                        </div>
                        {r.theme && (
                          <div className="mb-4">
                            <span
                              className="inline-block text-[10px] px-2 py-0.5 rounded leading-tight"
                              style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)", color: "var(--gold)" }}
                            >
                              {r.theme}
                            </span>
                          </div>
                        )}
                        <p className="font-arabic text-sm text-right text-foreground/80 leading-loose line-clamp-2 mb-2" dir="rtl">
                          {r.arabic}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{r.english}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
