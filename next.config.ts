import type { NextConfig } from "next";

// Server Action origins are host-agnostic: production trusts only what ALLOWED_ORIGINS
// lists (comma-separated), plus the app's own origin. A local tunnel origin is used as a
// dev-only convenience and is never trusted in production.
const DEV_TUNNEL_ORIGIN = "lily-headfirst-player.ngrok-free.dev";
const isProd = process.env.NODE_ENV === "production";

const envOrigins = process.env.ALLOWED_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = envOrigins ?? (isProd ? [] : [DEV_TUNNEL_ORIGIN]);

const nextConfig: NextConfig = {
  // Keep the isolated security test server away from a developer's active build.
  distDir: process.env.TRIYA_TEST_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isProd ? "" : " ws: wss:"}`,
      "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
      ...(isProd ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
      ],
    }];
  },
  // Dev-only: silences Next's cross-origin dev-resource warning behind a tunnel.
  allowedDevOrigins: isProd ? [] : [DEV_TUNNEL_ORIGIN],
  // exceljs (the .xlsx reader behind the bulk importer) relies on Node built-ins and
  // ships its own browser build; let Node require it rather than bundling it.
  serverExternalPackages: ["exceljs"],
  experimental: {
    proxyClientMaxBodySize: "4mb",
    serverActions: {
      bodySizeLimit: "4mb",
      allowedOrigins,
    },
  },
};

export default nextConfig;
