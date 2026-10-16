/**
 * Content-Security-Policy builder (DA-004). Pure, so it can be unit tested and
 * imported by next.config.ts. Shipped as Report-Only: browsers log violations
 * in the console but block nothing. Each directive is explained in
 * docs/audits/draw-anything-security-audit.md.
 */

export interface CspEnv {
  NODE_ENV?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
}

const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

/**
 * Clerk's frontend API host is the base64 of "<host>$" inside the publishable
 * key (pk_test_... / pk_live_...). It is the only host clerk-js loads from.
 */
export const clerkFrontendHost = (publishableKey: string | undefined): string | undefined => {
  const encoded = /^pk_(?:test|live)_(.+)$/.exec(publishableKey ?? "")?.[1];
  if (!encoded) return undefined;
  try {
    const decoded = atob(encoded);
    const host = decoded.endsWith("$") ? decoded.slice(0, -1) : "";
    return HOST.test(host) ? host.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

/** `https://x.convex.cloud` -> its https and wss origins (http/ws for a local backend). */
export const convexOrigins = (convexUrl: string | undefined): string[] => {
  try {
    const url = new URL(convexUrl ?? "");
    if (url.protocol === "https:") return [url.origin, `wss://${url.host}`];
    if (url.protocol === "http:") return [url.origin, `ws://${url.host}`];
  } catch {
    // Missing or malformed: fall through to no Convex origins.
  }
  return [];
};

export const buildContentSecurityPolicy = (env: CspEnv): string => {
  const isDev = env.NODE_ENV === "development";
  const clerk = clerkFrontendHost(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const clerkOrigin = clerk ? [`https://${clerk}`] : ["https://*.clerk.accounts.dev"];
  const turnstile = "https://challenges.cloudflare.com";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js emits inline bootstrap/hydration scripts, so 'unsafe-inline' is
    // needed until a nonce is wired through middleware. React dev mode uses eval.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...clerkOrigin, turnstile],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...convexOrigins(env.NEXT_PUBLIC_CONVEX_URL),
      ...clerkOrigin,
      "https://clerk-telemetry.com",
      "https://api.liveblocks.io",
      "wss://api.liveblocks.io",
      ...(isDev ? ["ws:", "http://localhost:*"] : []),
    ],
    "frame-src": [turnstile],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${[...new Set(sources)].join(" ")}`)
    .join("; ");
};
