import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "patchright",
    "patchright-core",
    "fsevents",
  ],
  outputFileTracingIncludes: {
    "/api/**": ["./data/listings/**/*", "./data/occupancy/**/*", "./data/market/**/*"],
    "/app/**": ["./data/listings/**/*", "./data/occupancy/**/*", "./data/market/**/*"],
  },
};

export default nextConfig;
