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
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "artworks.thetvdb.com" },
    ],
  },
};

export default config;
