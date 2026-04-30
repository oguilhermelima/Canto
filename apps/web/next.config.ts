import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["192.168.0.210"],
  // Phase 11d (lint hardening) tightened the rule set ahead of the F4 sweep
  // that fixes the remaining ~36 violations. Until that sweep lands, do not
  // block the production build on lint — the rules still run during `pnpm
  // lint`, in CI, and inside the editor, so violations stay visible.
  eslint: { ignoreDuringBuilds: true },
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
