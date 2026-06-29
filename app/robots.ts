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
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
