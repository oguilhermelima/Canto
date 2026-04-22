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
  },
};

export default config;
