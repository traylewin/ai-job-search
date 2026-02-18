import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["cheerio"],
  outputFileTracingIncludes: {
    "/api/ingest": ["./data/**/*"],
  },
};

export default nextConfig;
