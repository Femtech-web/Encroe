import type { NextConfig } from "next";

/** Static security headers; the Content-Security-Policy carries a fresh nonce per request (proxy.ts). */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // web/ is the app's root (the repository's root holds the Rust workspace and the contracts).
  turbopack: { root: process.cwd() },
  // The API runs the sealed core from public/core; ship it with the functions.
  outputFileTracingIncludes: { "/api/**": ["./public/core/**"] },
  async headers() {
    // The game cores and the wallet connector change only with a deploy: browsers and the CDN keep them for an hour
    // and serve the old copy for a day while fetching a new one. Every core is checked by its hash anyway.
    const cached = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/core/:file*", headers: cached },
      { source: "/wallet-connectors/:file*", headers: cached },
    ];
  },
};

export default nextConfig;
