/**
 * Single source of truth for the public site's identity and URL.
 *
 * The production domain is not hard-coded anywhere. It comes from NEXT_PUBLIC_SITE_URL, or from
 * VERCEL_PROJECT_PRODUCTION_URL (the production domain Vercel itself configures). When neither is
 * set, `getSiteUrl` returns undefined and every caller omits absolute URLs instead of inventing
 * one: metadata never points at localhost or a preview deployment.
 */

export const SITE_NAME = "Draw Anything";

export const HOME_TITLE = "Draw Anything: describe a diagram, an AI agent draws it";

export const SITE_DESCRIPTION =
  "Describe a diagram and an AI agent draws it on a shared whiteboard, as ordinary shapes and connectors your team can edit live.";

/** Square raster logo for structured data (Organization.logo). Generated from lib/brand.ts. */
export const LOGO_ASSET_PATH = "/brand/icon-512.png";

/** Absolute path of the generated social preview (1200x630 PNG). */
export const OG_IMAGE_PATH = "/og.png";
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT = "Draw Anything: describe it, watch it get drawn.";

/**
 * Everything behind sign-in, plus the API. Kept out of the sitemap and robots.txt, and served with
 * `X-Robots-Tag: noindex` (see next.config.ts), so a leaked link never makes one searchable.
 */
export const PRIVATE_PATH_PREFIXES = ["/whiteboard", "/billing", "/create-org", "/api"] as const;

export interface PublicRoute {
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}

/** The unauthenticated pages worth indexing. Add a page here and it appears in the sitemap. */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [{ path: "/", changeFrequency: "monthly", priority: 1 }];

/** Reads NEXT_PUBLIC_SITE_URL and VERCEL_PROJECT_PRODUCTION_URL. Server-side only. */
type SiteEnv = Record<string, string | undefined>;

const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local$|.*\.localhost$)/i;

const toOrigin = (raw: string | undefined): string | undefined => {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (LOCAL_HOST.test(url.hostname)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

/** The site's origin without a trailing slash (`https://example.com`), or undefined when not configured. */
export const getSiteUrl = (env: SiteEnv = process.env): string | undefined =>
  toOrigin(env.NEXT_PUBLIC_SITE_URL) ?? toOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);

/** `absoluteUrl("/og.png")` -> `https://example.com/og.png`; undefined when no site URL is configured. */
export const absoluteUrl = (path: string, env: SiteEnv = process.env): string | undefined => {
  const origin = getSiteUrl(env);
  if (!origin) return undefined;
  // The root has no trailing slash, matching the canonical URL Next emits for it.
  return path === "/" ? origin : `${origin}${path.startsWith("/") ? path : `/${path}`}`;
};

export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
