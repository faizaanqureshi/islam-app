"use client";

import { useState, useEffect, useRef } from "react";

const KAABA = { lat: 21.4225, lng: 39.8262 };

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const f1 = toRad(lat1),
    f2 = toRad(lat2),
    dl = toRad(lon2 - lon1);
  return (
    ((Math.atan2(
      Math.sin(dl) * Math.cos(f2),
      Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371,
    df = toRad(lat2 - lat1),
    dl = toRad(lon2 - lon1);
  const a =
    Math.sin(df / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

type LocState = "idle" | "requesting" | "ok" | "denied" | "error" | "timeout";
type CompassState = "unknown" | "needs-ios" | "active" | "denied" | "unsupported";

// ── Compass SVG ──────────────────────────────────────────────────────────────

function CompassSVG({
  faceRot,
  needleRot,
  live,
}: {
  faceRot: number;
  needleRot: number;
  live: boolean;
}) {
  const cx = 150,
    cy = 150;
  const OR = 132; // outer tick radius

  // Tick marks
  const ticks: React.ReactNode[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const isCardinal = deg % 90 === 0;
    const isInter = deg % 45 === 0 && !isCardinal;
    const isMid = deg % 30 === 0 && !isCardinal && !isInter;
    const len = isCardinal ? 18 : isInter ? 14 : isMid ? 9 : 6;
    const sw = isCardinal ? 1.5 : isInter ? 1 : isMid ? 0.75 : 0.5;
    const op = isCardinal ? 0.85 : isInter ? 0.55 : isMid ? 0.32 : 0.18;
    const rad = toRad(deg - 90);
    const x1 = cx + OR * Math.cos(rad);
    const y1 = cy + OR * Math.sin(rad);
    const x2 = cx + (OR - len) * Math.cos(rad);
    const y2 = cy + (OR - len) * Math.sin(rad);
    ticks.push(
      <line
        key={deg}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--gold)"
        strokeWidth={sw}
        strokeLinecap="round"
        opacity={op}
      />
    );
  }

  // Cardinal labels
  const cardinals = [
    { deg: 0, label: "N", main: true },
    { deg: 90, label: "E", main: false },
    { deg: 180, label: "S", main: false },
    { deg: 270, label: "W", main: false },
  ];
  const labels = cardinals.map(({ deg, label, main }) => {
    const rad = toRad(deg - 90);
    const r = OR - 32;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    return (
      <text
        key={label}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={main ? 14 : 11}
        fontWeight={main ? "700" : "400"}
        fill={main ? "var(--gold)" : "rgba(201,166,100,0.6)"}
        fontFamily="var(--font-cormorant), Georgia, serif"
        letterSpacing="0.08em"
      >
        {label}
      </text>
    );
  });

  // Intercardinal dots
  const interDots = [45, 135, 225, 315].map((deg) => {
    const rad = toRad(deg - 90);
    const r = OR - 30;
    return (
      <circle
        key={deg}
        cx={cx + r * Math.cos(rad)}
        cy={cy + r * Math.sin(rad)}
        r="1.5"
        fill="rgba(201,166,100,0.4)"
      />
    );
  });

  const transition = live ? "transform 0.08s linear" : "none";

  // Needle path: tip at (cx, cy-88), base at (cx, cy+32)
  const tipY = cy - 88;
  const baseY = cy + 32;
  const midY = cy + 4; // widest point

  return (
    <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 300, display: "block" }}>
      <defs>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="rgba(28, 22, 10, 0.97)" />
          <stop offset="100%" stopColor="rgba(10, 8, 4, 0.99)" />
        </radialGradient>
        <linearGradient id="needleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold-light)" />
          <stop offset="60%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="rgba(120,85,20,0.7)" />
        </linearGradient>
        <linearGradient id="needleShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Outer glow ring */}
      <circle
        cx={cx}
        cy={cy}
        r={138}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="0.5"
        opacity="0.12"
        filter="url(#glow)"
      />

      {/* Compass background */}
      <circle cx={cx} cy={cy} r={136} fill="url(#bgGrad)" />

      {/* Decorative rings */}
      <circle cx={cx} cy={cy} r={135} fill="none" stroke="var(--gold)" strokeWidth="0.75" opacity="0.3" />
      <circle cx={cx} cy={cy} r={132} fill="none" stroke="var(--gold)" strokeWidth="0.4" opacity="0.12" />
      <circle cx={cx} cy={cy} r={OR - 22} fill="none" stroke="var(--gold)" strokeWidth="0.4" opacity="0.07" />

      {/* Rotating compass face */}
      <g
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: `rotate(${faceRot}deg)`,
          transition,
        }}
      >
        {ticks}
        {labels}
        {interDots}
      </g>

      {/* Subtle inner glow */}
      <circle cx={cx} cy={cy} r={70} fill="rgba(201,166,100,0.025)" />

      {/* Needle + Kaaba indicator */}
      <g
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: `rotate(${needleRot}deg)`,
          transition,
        }}
      >
        {/* Needle shadow */}
        <path
          d={`M ${cx} ${tipY} L ${cx + 10} ${midY} L ${cx} ${baseY} L ${cx - 10} ${midY} Z`}
          fill="rgba(0,0,0,0.35)"
          transform={`translate(2, 3)`}
        />

        {/* Needle body */}
        <path
          d={`M ${cx} ${tipY} L ${cx + 10} ${midY} L ${cx} ${baseY} L ${cx - 10} ${midY} Z`}
          fill="url(#needleGrad)"
        />

        {/* Needle shine */}
        <path
          d={`M ${cx} ${tipY} L ${cx + 10} ${midY} L ${cx} ${baseY} L ${cx - 10} ${midY} Z`}
          fill="url(#needleShine)"
          opacity="0.6"
        />

        {/* Lower half darker */}
        <path
          d={`M ${cx} ${cy} L ${cx + 10} ${midY} L ${cx} ${baseY} L ${cx - 10} ${midY} Z`}
          fill="rgba(8,6,2,0.45)"
        />

        {/* Connector line from tip to Kaaba */}
        <line
          x1={cx}
          y1={tipY}
          x2={cx}
          y2={tipY - 30}
          stroke="var(--gold)"
          strokeWidth="1.5"
          opacity="0.5"
        />

        {/* Kaaba glow */}
        <circle
          cx={cx}
          cy={tipY - 42}
          r={18}
          fill="rgba(201,166,100,0.12)"
          filter="url(#glow)"
        />

        {/* Kaaba body */}
        <g filter="url(#softGlow)">
          {/* Main cube */}
          <rect
            x={cx - 13}
            y={tipY - 56}
            width="26"
            height="26"
            rx="2"
            fill="rgba(18,13,5,0.95)"
            stroke="var(--gold)"
            strokeWidth="1.5"
          />
          {/* Kiswah (black cloth covers ~60% from bottom) */}
          <rect
            x={cx - 13}
            y={tipY - 42}
            width="26"
            height="12"
            fill="rgba(4,3,1,0.92)"
          />
          {/* Gold belt (hizam) */}
          <rect
            x={cx - 13}
            y={tipY - 40}
            width="26"
            height="3.5"
            fill="rgba(201,166,100,0.65)"
          />
          {/* Fine gold embroidery line */}
          <rect
            x={cx - 13}
            y={tipY - 38.5}
            width="26"
            height="0.75"
            fill="rgba(228,192,122,0.4)"
          />
          {/* Door hint */}
          <rect
            x={cx - 4}
            y={tipY - 45}
            width="8"
            height="9"
            rx="1"
            fill="rgba(201,166,100,0.2)"
            stroke="rgba(201,166,100,0.5)"
            strokeWidth="0.75"
          />
        </g>
      </g>

      {/* Center jewel */}
      <circle cx={cx} cy={cy} r={8} fill="var(--background)" opacity="0.8" />
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="var(--gold)"
        opacity="0.9"
        filter="url(#softGlow)"
      />
      <circle cx={cx} cy={cy} r={3} fill="var(--background)" />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function QiblaFinder() {
  const [locState, setLocState] = useState<LocState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [compassState, setCompassState] = useState<CompassState>("unknown");
  const [cityName, setCityName] = useState<string | null>(null);

  // Continuous (non-modular) heading for smooth CSS transitions
  const smoothRef = useRef<number | null>(null);
  const [headingRot, setHeadingRot] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const didInit = useRef(false);

  const qiblaBearing = coords
    ? calcBearing(coords.lat, coords.lng, KAABA.lat, KAABA.lng)
    : null;
  const distKm = coords
    ? calcDistance(coords.lat, coords.lng, KAABA.lat, KAABA.lng)
    : null;

  const isLive = compassState === "active";
  // Compass face stays in world-space by rotating opposite to heading
  const faceRot = -headingRot;
  // Needle points toward Mecca in screen space
  const needleRot = qiblaBearing !== null ? qiblaBearing - headingRot : 0;

  function startCompassListener() {
    const handler = (e: DeviceOrientationEvent) => {
      let raw: number | null = null;
      if ("webkitCompassHeading" in e) {
        raw = (e as unknown as { webkitCompassHeading: number }).webkitCompassHeading;
      } else if (e.alpha !== null) {
        raw = (360 - e.alpha) % 360;
      }
      if (raw === null) return;
      setCompassState("active");
      // Smooth with exponential moving average on continuous axis
      if (smoothRef.current === null) {
        smoothRef.current = raw;
        setHeadingRot(raw);
      } else {
        const prev360 = ((smoothRef.current % 360) + 360) % 360;
        let diff = raw - prev360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        smoothRef.current += diff * 0.25;
        setHeadingRot(smoothRef.current);
      }
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }

  async function initCompass() {
    if (typeof DeviceOrientationEvent === "undefined") {
      setCompassState("unsupported");
      return;
    }
    type DOEPlus = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof (DeviceOrientationEvent as DOEPlus).requestPermission === "function") {
      setCompassState("needs-ios");
    } else {
      cleanupRef.current = startCompassListener();
    }
  }

  async function handleIOSPermission() {
    type DOEPlus = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      const result = await (DeviceOrientationEvent as DOEPlus).requestPermission!();
      if (result === "granted") {
        cleanupRef.current = startCompassListener();
      } else {
        setCompassState("denied");
      }
    } catch {
      setCompassState("denied");
    }
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    setLocState("requesting");

    const timer = setTimeout(() => setLocState("timeout"), 12000);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timer);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setLocState("ok");

        // Reverse geocode (Nominatim – no key needed)
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { "User-Agent": "HidayahApp/1.0" } }
          );
          const d = await r.json();
          const city =
            d.address?.city ||
            d.address?.town ||
            d.address?.village ||
            d.address?.county;
          const country = d.address?.country;
          setCityName([city, country].filter(Boolean).join(", ") || null);
        } catch {
          /* ignore */
        }

        initCompass();
      },
      (err) => {
        clearTimeout(timer);
        setLocState(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { timeout: 11000, enableHighAccuracy: true }
    );

    return () => {
      clearTimeout(timer);
      cleanupRef.current?.();
    };
  }, []); // intentional empty deps – runs once on mount

  // ── Render helpers ──────────────────────────────────────────────────────────

  const cardClass =
    "rounded-2xl border border-border/50 bg-foreground/[0.025] backdrop-blur-sm p-5";

  function StatCard({
    label,
    value,
    sub,
  }: {
    label: string;
    value: string;
    sub?: string;
  }) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="font-display"
          style={{
            fontSize: "2rem",
            fontWeight: 500,
            color: "var(--gold)",
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground">
          {label}
        </span>
        {sub && (
          <span className="text-xs text-muted-foreground/60 mt-0.5">{sub}</span>
        )}
      </div>
    );
  }

  // ── States ──────────────────────────────────────────────────────────────────

  if (locState === "requesting" || locState === "idle") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16">
        {/* Spinner */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "2px solid var(--gold-border)",
            borderTopColor: "var(--gold)",
            animation: "spin 1s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p className="text-sm text-muted-foreground tracking-wide">
          Detecting your location…
        </p>
      </div>
    );
  }

  if (locState === "denied") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 max-w-sm mx-auto text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
            <circle cx="12" cy="10" r="1" fill="var(--gold)" />
          </svg>
        </div>
        <div>
          <h3
            className="font-display text-xl font-medium mb-2"
            style={{ color: "var(--foreground)" }}
          >
            Location Access Denied
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Qibla direction requires your location. Please enable location
            access in your browser or device settings, then reload the page.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs font-medium tracking-widest uppercase px-5 py-2.5 rounded-lg transition-all duration-200 hover:opacity-80"
          style={{
            background: "var(--gold-muted)",
            border: "1px solid var(--gold-border)",
            color: "var(--gold)",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (locState === "timeout" || locState === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 max-w-sm mx-auto text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h3 className="font-display text-xl font-medium mb-2">
            Location Unavailable
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {locState === "timeout"
              ? "Location request timed out. Please check your GPS or network connection."
              : "Unable to retrieve your location. Please try again."}
          </p>
        </div>
        <button
          onClick={() => {
            didInit.current = false;
            setLocState("idle");
            // Re-trigger effect manually
            setTimeout(() => {
              didInit.current = false;
              window.location.reload();
            }, 0);
          }}
          className="text-xs font-medium tracking-widest uppercase px-5 py-2.5 rounded-lg transition-all duration-200 hover:opacity-80"
          style={{
            background: "var(--gold-muted)",
            border: "1px solid var(--gold-border)",
            color: "var(--gold)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Main compass view ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4 py-6 pb-16">

        {/* Header */}
        <div className="flex flex-col items-center gap-1 animate-fade-in">
          <p
            className="font-arabic text-3xl"
            dir="rtl"
            style={{ color: "var(--gold)", lineHeight: 1.6, opacity: 0.85 }}
          >
            القبلة
          </p>
          <h2
            className="font-display text-base font-light text-foreground/60"
            style={{ letterSpacing: "0.35em", textTransform: "uppercase" }}
          >
            Qibla Finder
          </h2>
          {cityName && (
            <p className="text-xs text-muted-foreground mt-1 tracking-wide">
              {cityName}
            </p>
          )}
        </div>

        {/* Compass */}
        <div
          className="w-full animate-fade-in animation-delay-100"
          style={{
            filter:
              "drop-shadow(0 0 32px rgba(201,166,100,0.12)) drop-shadow(0 8px 24px rgba(0,0,0,0.5))",
          }}
        >
          <CompassSVG
            faceRot={isLive ? faceRot : 0}
            needleRot={isLive ? needleRot : (qiblaBearing ?? 0)}
            live={isLive}
          />
        </div>

        {/* iOS compass permission prompt */}
        {compassState === "needs-ios" && (
          <button
            onClick={handleIOSPermission}
            className="flex items-center gap-2.5 text-xs font-medium tracking-widest uppercase px-5 py-3 rounded-xl transition-all duration-200 hover:opacity-80 animate-fade-in"
            style={{
              background: "var(--gold-muted)",
              border: "1px solid var(--gold-border)",
              color: "var(--gold)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            Enable Live Compass
          </button>
        )}

        {/* Stats cards */}
        {qiblaBearing !== null && (
          <div
            className={`w-full ${cardClass} animate-fade-in animation-delay-200`}
          >
            <div className="flex items-center justify-around gap-4">
              <StatCard
                label="Qibla"
                value={`${Math.round(qiblaBearing)}°`}
                sub="from North"
              />
              <div
                style={{
                  width: 1,
                  height: 48,
                  background: "var(--gold-border)",
                }}
              />
              <StatCard
                label="Distance"
                value={distKm ? distKm.toLocaleString() : "—"}
                sub="km to Mecca"
              />
            </div>
          </div>
        )}

        {/* Compass status pill */}
        <div className="animate-fade-in animation-delay-300">
          {isLive ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  boxShadow: "0 0 6px #4ade80",
                  display: "inline-block",
                }}
              />
              Live compass active · rotate your phone to find Qibla
            </div>
          ) : compassState === "unsupported" || compassState === "denied" ? (
            <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-[260px]">
              Live compass unavailable on this device.{" "}
              <span style={{ color: "var(--gold)" }}>
                {Math.round(qiblaBearing ?? 0)}°
              </span>{" "}
              is the Qibla bearing from North — use a physical compass or maps
              app to orient yourself.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Waiting for compass data…
            </p>
          )}
        </div>

        {/* Footnote */}
        <p className="text-[11px] text-muted-foreground/50 text-center leading-relaxed max-w-[260px] mt-2">
          Bearing calculated using the great-circle method to the Kaaba
          (21.4225°N, 39.8262°E).
        </p>
      </div>
    </div>
  );
}
