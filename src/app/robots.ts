import type { MetadataRoute } from "next";

/**
 * Nothing here belongs in a search index: the app is private and every /view
 * link is confidential by construction. The root layout already sets a
 * noindex metadata directive, but middleware passes /robots.txt through on
 * custom domains, so crawlers hitting a client's own domain need an answer
 * here rather than a 404.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
