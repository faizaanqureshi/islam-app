import type { NextConfig } from "next";

// When building for Capacitor (static export), set CAPACITOR_BUILD=true.
// The out/ directory is served as the webDir. API routes are excluded from
// the static export and must be called via NEXT_PUBLIC_API_BASE_URL.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild && {
    output: "export",
    trailingSlash: true,
  }),
};

export default nextConfig;
