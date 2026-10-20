import type { MetadataRoute } from "next";
import { absoluteUrl, PRIVATE_PATH_PREFIXES } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl("/sitemap.xml");
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATH_PREFIXES] },
    ...(sitemap ? { sitemap } : {}),
  };
}
