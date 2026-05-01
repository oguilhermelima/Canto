import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["192.168.0.210"],
  transpilePackages: [
    "@canto/api",
    "@canto/auth",
    "@canto/core",
    "@canto/db",
    "@canto/ui",
    "@canto/validators",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "artworks.thetvdb.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
    // TMDB / TVDB image URLs are immutable by path — once a poster path
    // resolves, the bytes never change. Cap optimized output at 1 year so
    // the browser + Next image cache hold them for the full TTL instead of
    // re-validating on the default 60s minimum.
    minimumCacheTTL: 31_536_000,
  },
};

export default config;
