import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/account/",
          "/api/",
          "/api/debug/",
          "/api/v2/docs",
          "/api/v2/openapi.json",
          "/cart",
          "/checkout",
          "/search",
          "/wishlist",
        ],
      },
      {
        // Advisory policy only. Enforcement belongs to verified-identity WAF
        // rules; general Google/Bing and social-preview crawlers remain allowed.
        userAgent: [
          "Meta-ExternalAgent",
          "GPTBot",
          "ClaudeBot",
          "anthropic-ai",
          "CCBot",
          "Bytespider",
          "Google-Extended",
        ],
        disallow: "/",
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
