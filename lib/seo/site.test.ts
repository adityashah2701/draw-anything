import { describe, expect, it } from "vitest";
import { absoluteUrl, getSiteUrl, isPrivatePath, PRIVATE_PATH_PREFIXES, PUBLIC_ROUTES } from "./site";
import { buildHomeStructuredData, serializeJsonLd } from "./structured-data";

describe("getSiteUrl", () => {
  it("returns undefined when nothing is configured", () => {
    expect(getSiteUrl({})).toBeUndefined();
  });

  it("uses NEXT_PUBLIC_SITE_URL and strips path and trailing slash", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://draw.example.com/" })).toBe("https://draw.example.com");
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://draw.example.com/some/path?x=1" })).toBe("https://draw.example.com");
  });

  it("accepts a bare host, as Vercel provides", () => {
    expect(getSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "draw.example.com" })).toBe("https://draw.example.com");
  });

  it("prefers the explicit variable over the Vercel one", () => {
    expect(
      getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://a.example.com", VERCEL_PROJECT_PRODUCTION_URL: "b.example.com" }),
    ).toBe("https://a.example.com");
  });

  it("never returns a local or malformed origin", () => {
    for (const value of ["http://localhost:3000", "127.0.0.1:3000", "http://0.0.0.0", "app.local", "javascript:alert(1)", "not a url", " "]) {
      expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: value })).toBeUndefined();
    }
  });

  it("falls through a local value to the Vercel domain", () => {
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "draw.example.com" })).toBe(
      "https://draw.example.com",
    );
  });
});

describe("absoluteUrl", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "https://draw.example.com" };
  it("joins paths onto the origin", () => {
    expect(absoluteUrl("/", env)).toBe("https://draw.example.com");
    expect(absoluteUrl("/og.png", env)).toBe("https://draw.example.com/og.png");
  });
  it("is undefined without a site URL", () => {
    expect(absoluteUrl("/", {})).toBeUndefined();
  });
});

describe("private paths", () => {
  it("matches the prefix and everything under it, nothing else", () => {
    expect(isPrivatePath("/whiteboard/abc")).toBe(true);
    expect(isPrivatePath("/billing")).toBe(true);
    expect(isPrivatePath("/api/ai/canvas-agent")).toBe(true);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/billing-guide")).toBe(false);
  });

  it("never overlaps a public route", () => {
    for (const route of PUBLIC_ROUTES) expect(isPrivatePath(route.path)).toBe(false);
    expect(PRIVATE_PATH_PREFIXES.length).toBeGreaterThan(0);
  });
});

describe("structured data", () => {
  it("makes no claims that need evidence: no ratings, reviews or prices", () => {
    const json = JSON.stringify(buildHomeStructuredData());
    expect(json).not.toMatch(/aggregateRating|review|offers|price/i);
  });

  it("escapes angle brackets so data cannot close the script tag", () => {
    expect(serializeJsonLd({ name: "</script><b>" })).not.toContain("<");
  });
});
