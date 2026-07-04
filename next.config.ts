import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok for Next.js dev resources like webpack-hmr
  allowedDevOrigins: ["lily-headfirst-player.ngrok-free.dev"],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
      allowedOrigins: ["lily-headfirst-player.ngrok-free.dev"],
    },
  },
};

export default nextConfig;
