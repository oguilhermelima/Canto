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
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "s4.anilist.co" },
    ],
  },
};

export default config;
