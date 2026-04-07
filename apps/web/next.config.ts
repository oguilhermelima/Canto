import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: [
    "@canto/api",
    "@canto/auth",
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
