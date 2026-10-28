import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` is required for scripts and styles because Next.js inlines its
 * hydration bootstrap, and a nonce-based policy would force every route to be dynamic
 * (the marketing pages are static today). Everything else is locked down: no third-party
 * script/style origins, no framing, no plugins, no form posts off-origin. When a nonce is
 * introduced, remove `'unsafe-inline'` from `script-src` and set the header in middleware.
 *
 * Dev needs `'unsafe-eval'` and websockets for React Fast Refresh.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The post composer captures photos through getUserMedia, so the app's own
  // origin may use the camera. Microphone and location stay disabled.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Only meaningful over HTTPS. Sent in production only, so a local http:// dev server is
  // never pinned to HTTPS by a cached header.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // The browser suite runs its own server and must not clobber the developer's
  // `.next` cache (switching build → dev there leaves stale route manifests).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // better-sqlite3 is a native module: keep it out of the bundler.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Server Actions receive uploads as multipart form data.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
