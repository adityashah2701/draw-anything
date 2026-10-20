import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/seo/site";

// Without a configured site URL there are no canonical URLs to list, so the sitemap is empty
// rather than pointing at a guessed domain.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.flatMap((route) => {
    const url = absoluteUrl(route.path);
    return url ? [{ url, changeFrequency: route.changeFrequency, priority: route.priority }] : [];
  });
}
