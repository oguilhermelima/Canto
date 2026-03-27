import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
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
    ],
  },
};

export default config;
