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
  // Dev-only: silences Next's cross-origin dev-resource warning behind a tunnel.
  allowedDevOrigins: isProd ? [] : [DEV_TUNNEL_ORIGIN],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
      allowedOrigins,
    },
  },
};

export default nextConfig;
