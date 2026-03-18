// Base URL for API routes. Empty in web/Vercel deployments (same origin).
// Set NEXT_PUBLIC_API_BASE in .env.local to your Vercel URL when building for Capacitor:
//   CAPACITOR_BUILD=true next build
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
