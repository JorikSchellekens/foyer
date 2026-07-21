import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["archiver", "@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // pdf.js worker + canvas shims
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./src/lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
