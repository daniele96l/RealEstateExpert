import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./data/listings/**/*", "./data/occupancy/**/*", "./data/market/**/*"],
    "/app/**": ["./data/listings/**/*", "./data/occupancy/**/*", "./data/market/**/*"],
  },
};

export default nextConfig;
