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
  // Baseline security headers on every response. X-Frame-Options guards the
  // authenticated dashboard against clickjacking; nosniff/Referrer-Policy are
  // safe hardening; HSTS is honoured only over HTTPS (a no-op in local dev).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
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
