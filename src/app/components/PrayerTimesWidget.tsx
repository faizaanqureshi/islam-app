"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

type NotifType = "adhan" | "notify";
interface PrayerNotifSetting {
  enabled: boolean;
  type: NotifType;
  adhan: string;
}
type NotifSettings = Record<string, PrayerNotifSetting>;

const FAJR_ADHANS = [
  { id: "Mishary Rashid - Fajr", name: "Mishary Rashid" },
  { id: "Ali Ahmed Mullah - Fajr", name: "Ali Ahmed Mullah" },
  { id: "Mansour Zahrani - Fajr", name: "Mansour Zahrani" },
];

const REGULAR_ADHANS = [
  { id: "Ali Ahmed Mullah", name: "Ali Ahmed Mullah" },
  { id: "Mohamed Tarek", name: "Mohamed Tarek" },
  { id: "Muhammad Marwan Qassas", name: "Muhammad Marwan Qassas" },
  { id: "Omar Hisham Al Arabi", name: "Omar Hisham Al Arabi" },
];

function getAdhanList(prayerName: string) {
  return prayerName === "Fajr" ? FAJR_ADHANS : REGULAR_ADHANS;
}

function getDefaultAdhan(prayerName: string) {
  return prayerName === "Fajr" ? FAJR_ADHANS[0].id : REGULAR_ADHANS[0].id;
}

export function PrayerTimesWidget() {
  const [prayerData, setPrayerData] = useState<{
    next: { name: string; time: string; timeUntil: string };
    allPrayers: Array<{ name: string; time: string; isPast: boolean; isCurrent: boolean }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotifSettings>({});
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const scheduledIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isExpanded && triggerRef.current && !isMobile) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isExpanded, isMobile]);

  const formatTime = (time24: string) => {
    const match = time24.match(/(\d{1,2}):(\d{2})/);
    if (!match) return time24;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const getPrayerIcon = (prayerName: string) => {
    const sizeClass = "w-3.5 h-3.5";
    switch (prayerName) {
      case "Fajr":
        return (
          <svg className={sizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" />
            <path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" />
            <path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" />
          </svg>
        );
      case "Dhuhr":
        return (
          <svg className={sizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" /><path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
          </svg>
        );
      case "Asr":
        return (
          <svg className={sizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 4v2" /><path d="M12 18v2" />
            <path d="m6.34 6.34 1.42 1.42" /><path d="m16.24 16.24 1.42 1.42" />
            <path d="M4 12h2" /><path d="M18 12h2" />
          </svg>
        );
      case "Maghrib":
        return (
          <svg className={sizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" />
            <path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" />
            <path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
          </svg>
        );
      case "Isha":
        return (
          <svg className={sizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            <path d="M19 3v4" /><path d="M21 5h-4" />
          </svg>
        );
      default:
        return null;
    }
  };

  const parseTimeString = (timeStr: string): { hours: number; minutes: number } => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
    }
    return { hours: 0, minutes: 0 };
  };

  const fetchPrayerTimes = async (latitude: number, longitude: number) => {
    try {
      const today = new Date();
      const timestamp = Math.floor(today.getTime() / 1000);
      const response = await fetch(
        `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${latitude}&longitude=${longitude}&method=2`
      );
      if (!response.ok) throw new Error("Failed to fetch prayer times");

      const data = await response.json();
      const timings = data.data.timings as PrayerTimes;

      const now = new Date();
      const prayers = [
        { name: "Fajr", time: timings.Fajr },
        { name: "Dhuhr", time: timings.Dhuhr },
        { name: "Asr", time: timings.Asr },
        { name: "Maghrib", time: timings.Maghrib },
        { name: "Isha", time: timings.Isha },
      ];

      const prayerDates = prayers.map((prayer) => {
        const { hours, minutes } = parseTimeString(prayer.time);
        const prayerDate = new Date(now);
        prayerDate.setHours(hours, minutes, 0, 0);
        return { ...prayer, date: prayerDate };
      });

      let nextIndex = prayerDates.findIndex((prayer) => prayer.date.getTime() > now.getTime());
      const isTomorrow = nextIndex === -1;
      if (isTomorrow) nextIndex = 0;

      const nextPrayer = prayerDates[nextIndex];
      let nextDate = new Date(nextPrayer.date);
      if (isTomorrow) nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);

      let msUntil = nextDate.getTime() - now.getTime();
      if (msUntil < 0) {
        nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
        msUntil = nextDate.getTime() - now.getTime();
      }

      const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
      let timeUntilStr: string;
      if (hoursUntil > 0) timeUntilStr = `${hoursUntil}h ${minutesUntil}m`;
      else if (minutesUntil > 0) timeUntilStr = `${minutesUntil}m`;
      else timeUntilStr = "<1m";

      const allPrayers = prayerDates.map((prayer, i) => ({
        name: prayer.name,
        time: prayer.time,
        isPast: isTomorrow ? true : prayer.date.getTime() < now.getTime(),
        isCurrent: i === nextIndex,
      }));

      setPrayerData({ next: { name: nextPrayer.name, time: nextPrayer.time, timeUntil: timeUntilStr }, allPrayers });
      setIsLoading(false);
      setError(false);
    } catch (err) {
      console.error("Error fetching prayer times:", err);
      setError(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const storedLocation = localStorage.getItem("prayerLocation");
    if (storedLocation) {
      const { latitude, longitude } = JSON.parse(storedLocation);
      fetchPrayerTimes(latitude, longitude);
    } else {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            localStorage.setItem("prayerLocation", JSON.stringify({ latitude, longitude }));
            fetchPrayerTimes(latitude, longitude);
          },
          (err) => {
            console.error("Geolocation error:", err);
            setError(true);
            setIsLoading(false);
          }
        );
      } else {
        setError(true);
        setIsLoading(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prayerData) return;
    const interval = setInterval(() => {
      const storedLocation = localStorage.getItem("prayerLocation");
      if (storedLocation) {
        const { latitude, longitude } = JSON.parse(storedLocation);
        fetchPrayerTimes(latitude, longitude);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [prayerData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
    const saved = localStorage.getItem("prayerNotificationSettings");
    if (saved) {
      try { setNotifSettings(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!prayerData) return;
    const saved = localStorage.getItem("prayerNotificationSettings");
    if (!saved) return;
    try { scheduleAllNotifications(JSON.parse(saved), prayerData.allPrayers); } catch { /* ignore */ }
  }, [prayerData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isExpanded) setIsSettingsMode(false);
  }, [isExpanded]);

  function scheduleAllNotifications(
    settings: NotifSettings,
    prayers: Array<{ name: string; time: string }>
  ) {
    scheduledIds.current.forEach((id) => clearTimeout(id));
    scheduledIds.current = [];
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const ARABIC: Record<string, string> = {
      Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء",
    };

    prayers.forEach((prayer) => {
      const setting = settings[prayer.name];
      if (!setting?.enabled) return;
      const { hours, minutes } = parseTimeString(prayer.time);
      for (let day = 0; day < 7; day++) {
        const target = new Date();
        target.setDate(target.getDate() + day);
        target.setHours(hours, minutes, 0, 0);
        const delay = target.getTime() - Date.now();
        if (delay <= 0) continue;
        const id = setTimeout(() => {
          if (Notification.permission !== "granted") return;
          const title = `${prayer.name} · ${ARABIC[prayer.name] ?? ""}`;
          if (setting.type === "adhan") {
            const audio = new Audio(`/adhan/${setting.adhan}.mp3`);
            audio.play().catch(() => {});
            new Notification(title, { body: setting.adhan });
          } else {
            new Notification(title, { body: "Time to pray" });
          }
        }, delay);
        scheduledIds.current.push(id);
      }
    });
  }

  async function requestNotifPermission(): Promise<boolean> {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") { setNotifPermission("denied"); return false; }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    return result === "granted";
  }

  async function togglePrayerEnabled(name: string) {
    const isCurrentlyEnabled = notifSettings[name]?.enabled ?? false;
    if (!isCurrentlyEnabled) {
      const granted = await requestNotifPermission();
      if (!granted) return;
    }
    setNotifSettings((prev) => ({
      ...prev,
      [name]: { enabled: !isCurrentlyEnabled, type: prev[name]?.type ?? "notify", adhan: prev[name]?.adhan ?? getDefaultAdhan(name) },
    }));
  }

  function updatePrayerSetting(name: string, update: Partial<PrayerNotifSetting>) {
    setNotifSettings((prev) => ({
      ...prev,
      [name]: { enabled: prev[name]?.enabled ?? false, type: prev[name]?.type ?? ("notify" as NotifType), adhan: prev[name]?.adhan ?? getDefaultAdhan(name), ...update },
    }));
  }

  function handleSave() {
    localStorage.setItem("prayerNotificationSettings", JSON.stringify(notifSettings));
    if (prayerData) scheduleAllNotifications(notifSettings, prayerData.allPrayers);
    setIsSettingsMode(false);
  }

  function getPrayerSetting(name: string): PrayerNotifSetting {
    return notifSettings[name] ?? { enabled: false, type: "notify", adhan: getDefaultAdhan(name) };
  }


  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground/60 dark:text-muted-foreground/70">
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 dark:bg-muted-foreground/50 animate-pulse" />
        <span className="text-[11px]">Loading...</span>
      </div>
    );
  }

  if (error || !prayerData) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 sm:gap-2 py-1 text-muted-foreground hover:text-foreground transition-colors group"
      >
        <div className="text-muted-foreground/70 dark:text-muted-foreground/80 group-hover:text-foreground/80 transition-colors">
          {getPrayerIcon(prayerData.next.name)}
        </div>
        <span className="text-[11px] sm:text-[12px] font-medium text-foreground/90 dark:text-foreground/95 group-hover:text-foreground transition-colors">
          {prayerData.next.name}
        </span>
        <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 dark:text-muted-foreground/80">
          {formatTime(prayerData.next.time)}
        </span>
        <span className="hidden sm:inline text-muted-foreground/40 dark:text-muted-foreground/50">·</span>
        <span className="hidden sm:inline text-[11px] text-muted-foreground/60 dark:text-muted-foreground/70 tabular-nums">
          in {prayerData.next.timeUntil}
        </span>
        <svg
          className={`w-3 h-3 text-muted-foreground/40 dark:text-muted-foreground/50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {mounted && isExpanded && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setIsExpanded(false)} />
          <div
            className={`fixed z-[101] ${isMobile ? "bottom-0 left-0 right-0 animate-slide-up" : "animate-fade-in"}`}
            style={isMobile ? {} : { top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }}
          >
            <div className={`p-3 bg-background/95 backdrop-blur-xl border border-border/50 shadow-xl ${isMobile ? "w-full border-t rounded-t-2xl pb-6" : "w-64 rounded-xl"}`}>

              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/30">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  {isSettingsMode ? "Notifications" : "Prayer Times"}
                </span>
                <div className="flex items-center gap-2">
                  {!isSettingsMode && (
                    <span className="text-[10px] text-muted-foreground/50">
                      {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsSettingsMode((v) => !v); }}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: isSettingsMode ? "var(--gold)" : "var(--muted-foreground)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Notifications blocked warning */}
              {isSettingsMode && notifPermission === "denied" && (
                <div className="mb-2.5 px-2.5 py-2 rounded-lg" style={{ background: "rgba(201,166,100,0.06)", border: "1px solid var(--gold-border)" }}>
                  <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                    Notifications are blocked. Enable them in your browser or device settings to receive prayer reminders.
                  </p>
                </div>
              )}

              {/* Prayer rows */}
              <div className={`${isSettingsMode ? "space-y-1" : "space-y-0.5"} max-h-[60vh] overflow-y-auto pb-safe`}>
                {prayerData.allPrayers.map((prayer) => {
                  if (!isSettingsMode) {
                    return (
                      <div
                        key={prayer.name}
                        className={`flex items-center justify-between py-2.5 px-2.5 rounded-lg transition-all duration-200 ${
                          prayer.isCurrent ? "bg-foreground/[0.05]" : prayer.isPast ? "opacity-50" : "hover:bg-foreground/[0.02]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={prayer.isCurrent ? "text-foreground/80" : "text-muted-foreground/60"}>
                            {getPrayerIcon(prayer.name)}
                          </div>
                          <span className={`text-[13px] font-medium ${prayer.isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                            {prayer.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] tabular-nums ${prayer.isCurrent ? "text-foreground/90" : "text-muted-foreground/70"}`}>
                            {formatTime(prayer.time)}
                          </span>
                          {prayer.isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          {prayer.isPast && !prayer.isCurrent && (
                            <svg className="w-3 h-3 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const setting = getPrayerSetting(prayer.name);
                  return (
                    <div
                      key={prayer.name}
                      className="px-2.5 py-2 rounded-lg transition-all duration-200"
                      style={{ background: setting.enabled ? "rgba(201,166,100,0.04)" : "transparent" }}
                    >
                      {/* Prayer name + toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="text-muted-foreground/60">{getPrayerIcon(prayer.name)}</div>
                          <span className="text-[13px] font-medium text-muted-foreground">{prayer.name}</span>
                        </div>
                        <button
                          onClick={() => togglePrayerEnabled(prayer.name)}
                          className="relative flex-none rounded-full transition-all duration-200"
                          style={{
                            width: 36, height: 20,
                            background: setting.enabled ? "var(--gold-muted)" : "rgba(100,90,78,0.2)",
                            border: `1.5px solid ${setting.enabled ? "var(--gold-border)" : "transparent"}`,
                          }}
                        >
                          <div
                            className="absolute rounded-full transition-all duration-200"
                            style={{
                              top: 3, width: 12, height: 12,
                              background: setting.enabled ? "var(--gold)" : "rgba(138,122,102,0.6)",
                              transform: `translateX(${setting.enabled ? 18 : 2}px)`,
                            }}
                          />
                        </button>
                      </div>

                      {/* Expanded controls */}
                      {setting.enabled && (
                        <div className="mt-3 ml-0 space-y-2">
                          {/* Notify / Adhan pill selector */}
                          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                            {(["notify", "adhan"] as NotifType[]).map((t, i) => (
                              <button
                                key={t}
                                onClick={() => updatePrayerSetting(prayer.name, { type: t })}
                                className="flex-1 py-1.5 text-[11px] uppercase tracking-wider font-medium transition-all duration-150"
                                style={{
                                  background: setting.type === t ? "var(--gold-muted)" : "transparent",
                                  color: setting.type === t ? "var(--gold)" : "var(--muted-foreground)",
                                  borderRight: i === 0 ? "1px solid var(--border)" : "none",
                                }}
                              >
                                {t === "notify" ? "Notify" : "Adhan"}
                              </button>
                            ))}
                          </div>
                          {/* Qari selector */}
                          {setting.type === "adhan" && (
                            <select
                              value={setting.adhan}
                              onChange={(e) => updatePrayerSetting(prayer.name, { adhan: e.target.value })}
                              className="w-full rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                              style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                            >
                              {getAdhanList(prayer.name).map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save button (settings mode only) */}
              {isSettingsMode && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  <button
                    onClick={handleSave}
                    className="w-full text-[11px] font-medium tracking-widest uppercase py-2 rounded-lg transition-all duration-200 hover:opacity-80"
                    style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)", color: "var(--gold)" }}
                  >
                    Save
                  </button>
                </div>
              )}

            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
