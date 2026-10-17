import { describe, expect, it } from "vitest";
import { iconHints } from "./icon-hints";

describe("iconHints", () => {
  it("resolves the technologies named in a request, including brands from the on-demand library", async () => {
    const hints = await iconHints("Users go through a CDN and a load balancer to the API gateway. Orders are saved in Postgres, cached in Redis, sent to Kafka. Payments use Stripe and emails go through SendGrid.");
    for (const term of ["cdn", "postgres", "redis", "kafka", "stripe", "sendgrid"]) expect(hints).toContain(`${term} = `);
  });

  it("prefers a two-word term over its words and returns nothing for plain prose", async () => {
    expect(await iconHints("a load balancer")).toMatch(/^load balancer = /);
    expect(await iconHints("please make it nice")).toBe("");
  });
});

describe("wantsBareIcons", () => {
  it.each(["using only bare icons with captions", "icons only please", "no boxes or rectangles", "without boxes", "just icons"])("is true for %s", async (p) => {
    const { wantsBareIcons } = await import("./icon-hints");
    expect(wantsBareIcons(p)).toBe(true);
  });
  it.each(["a flow with an icon per step", "web app with a database", "draw the icons of each service in boxes"])("is false for %s", async (p) => {
    const { wantsBareIcons } = await import("./icon-hints");
    expect(wantsBareIcons(p)).toBe(false);
  });
});
