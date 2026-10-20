import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./lib/security/csp";

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
