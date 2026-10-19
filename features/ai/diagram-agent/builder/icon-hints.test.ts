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

describe("wantsPlainBoxes", () => {
  it.each(["no icons please", "draw it without icons", "plain boxes only", "just rectangles", "boxes only", "an icon-free diagram"])("is true for %s", async (p) => {
    const { wantsPlainBoxes } = await import("./icon-hints");
    expect(wantsPlainBoxes(p)).toBe(true);
  });
  it.each(["web app with a database", "icons for each service", "a flow with boxes for the steps and icons for the data stores"])("is false for %s", async (p) => {
    const { wantsPlainBoxes } = await import("./icon-hints");
    expect(wantsPlainBoxes(p)).toBe(false);
  });
});
