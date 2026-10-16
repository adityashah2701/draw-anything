import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  clerkFrontendHost,
  convexOrigins,
} from "./csp";

const key = (host: string, kind = "test") => `pk_${kind}_${btoa(`${host}$`)}`;

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("clerkFrontendHost", () => {
  it("decodes the host from test and live keys", () => {
    expect(clerkFrontendHost(key("ultimate-feline-31.clerk.accounts.dev"))).toBe(
      "ultimate-feline-31.clerk.accounts.dev",
    );
    expect(clerkFrontendHost(key("clerk.example.com", "live"))).toBe("clerk.example.com");
  });

  it("returns undefined for missing, malformed or hostile keys", () => {
    expect(clerkFrontendHost(undefined)).toBeUndefined();
    expect(clerkFrontendHost("")).toBeUndefined();
    expect(clerkFrontendHost("sk_test_abc")).toBeUndefined();
    expect(clerkFrontendHost("pk_test_!!!not-base64")).toBeUndefined();
    // Decodes to a value that would inject a directive or a wildcard.
    expect(clerkFrontendHost(key("evil.com; script-src *"))).toBeUndefined();
    expect(clerkFrontendHost(key("*.evil.com"))).toBeUndefined();
    expect(clerkFrontendHost(`pk_test_${btoa("no-dollar-sign.com")}`)).toBeUndefined();
  });
});

describe("convexOrigins", () => {
  it("maps https to https+wss and http to http+ws", () => {
    expect(convexOrigins("https://happy-animal-123.convex.cloud")).toEqual([
      "https://happy-animal-123.convex.cloud",
      "wss://happy-animal-123.convex.cloud",
    ]);
    expect(convexOrigins("http://127.0.0.1:3210")).toEqual([
      "http://127.0.0.1:3210",
      "ws://127.0.0.1:3210",
    ]);
  });

  it("ignores missing, malformed or non-http urls", () => {
    expect(convexOrigins(undefined)).toEqual([]);
    expect(convexOrigins("not a url")).toEqual([]);
    expect(convexOrigins("javascript:alert(1)")).toEqual([]);
  });
});

describe("buildContentSecurityPolicy", () => {
  const env = {
    NODE_ENV: "production",
    NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key("ultimate-feline-31.clerk.accounts.dev"),
  };

  it("allows exactly the services the app talks to", () => {
    const csp = buildContentSecurityPolicy(env);
    const connect = directive(csp, "connect-src");
    expect(connect).toContain("https://happy-animal-123.convex.cloud");
    expect(connect).toContain("wss://happy-animal-123.convex.cloud");
    expect(connect).toContain("https://ultimate-feline-31.clerk.accounts.dev");
    expect(connect).toContain("wss://api.liveblocks.io");
    expect(directive(csp, "script-src")).toContain("https://ultimate-feline-31.clerk.accounts.dev");
  });

  it("locks down objects, base uri, forms and framing", () => {
    const csp = buildContentSecurityPolicy(env);
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
  });

  it("allows unsafe-eval only in development", () => {
    expect(directive(buildContentSecurityPolicy(env), "script-src")).not.toContain("unsafe-eval");
    expect(
      directive(buildContentSecurityPolicy({ ...env, NODE_ENV: "development" }), "script-src"),
    ).toContain("'unsafe-eval'");
  });

  it("falls back to the Clerk dev wildcard and no Convex origin when env is missing", () => {
    const csp = buildContentSecurityPolicy({ NODE_ENV: "production" });
    expect(directive(csp, "script-src")).toContain("https://*.clerk.accounts.dev");
    expect(directive(csp, "connect-src")).not.toContain("convex");
  });

  it("is a single header value with no duplicate directives", () => {
    const csp = buildContentSecurityPolicy(env);
    expect(csp).not.toMatch(/[\r\n]/);
    const names = csp.split("; ").map((d) => d.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
  });
});
