import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./lib/security/csp";
import { getSiteUrl, PRIVATE_PATH_PREFIXES } from "./lib/seo/site";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers ignore HSTS on plain http, so localhost development is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Report-Only: violations show in the browser console, nothing is blocked (DA-004).
  {
    key: "Content-Security-Policy-Report-Only",
    value: buildContentSecurityPolicy(process.env),
  },
];

if (process.env.NODE_ENV === "production" && !getSiteUrl()) {
  console.warn(
    "[seo] NEXT_PUBLIC_SITE_URL is not set: canonical URLs, social images and the sitemap are omitted until it is.",
  );
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private surfaces are never indexed, even if a link to one leaks.
      ...PRIVATE_PATH_PREFIXES.map((prefix) => ({
        source: `${prefix}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
    ];
  },
};

export default nextConfig;
