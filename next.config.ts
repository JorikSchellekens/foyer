import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["archiver", "@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // The viewer middleware makes Next buffer every proxied request body,
    // capped here. Uploads bypass middleware (see matcher) so they are not
    // buffered, but keep headroom for any other proxied route.
    proxyClientMaxBodySize: "50mb",
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
