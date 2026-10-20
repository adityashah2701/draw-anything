import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appCss } from "./css";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

declare global {
  interface Window {
    U: typeof import("./ui-entry");
    __events: string[];
  }
}

const shots = process.env.INVITE_SHOTS;

suite("pending invitations in real Chrome (real components, fixture data; Clerk does not run here)", () => {
  let s: BrowserSession;
  let page: Page;
  let errors: string[];

  // "~refresh" marks a look-again request; it is kept out of `events` so tests of other actions stay exact.
  const events = () => page.evaluate(() => window.__events.filter((e) => e !== "~refresh"));
  const refreshes = () => page.evaluate(() => window.__events.filter((e) => e === "~refresh").length);
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
  };
  const mountSidebar = async (width = 1280) => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => {
      window.__events = [];
      window.U.mountSidebar((event) => window.__events.push(event), true);
    });
    await page.waitForSelector('[data-slot="sidebar-wrapper"]');
  };
  const mountNotice = async (width = 1280, failing = false) => {
    await page.setViewportSize({ width, height: 700 });
    await page.evaluate((f) => {
      window.__events = [];
      window.U.mountNotice((event) => window.__events.push(event), f);
    }, failing);
    await page.waitForSelector("h2");
  };

  beforeAll(async () => {
    s = await openPage({ font: "system", ui: true, extraCss: await appCss() });
    page = s.page;
    page.on("pageerror", (e) => errors.push(e.message));
  });
  afterAll(async () => {
    await s?.close();
  });
  beforeEach(async () => {
    errors = [];
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  });

  it("flags waiting invitations on the workspace switcher and lists them in its menu", async () => {
    await mountSidebar();
    const trigger = page.getByRole("button", { name: /^Workspace:/ });
    expect(await trigger.getAttribute("aria-label")).toContain("2 waiting for you");
    expect(await trigger.locator('[data-slot="pending-dot"]').count()).toBe(1);
    expect((await trigger.innerText()).toLowerCase()).toContain("1 invitation");
    await trigger.click();
    const menu = page.getByRole("menu");
    await menu.waitFor();
    await shot("switcher-light");
    expect((await menu.getByRole("menuitem", { name: /^Name Change/ }).innerText()).toLowerCase()).toContain("accept");
    expect((await menu.getByRole("menuitem", { name: /^Acme Design/ }).innerText()).toLowerCase()).toContain("request");
    await menu.getByRole("menuitem", { name: /^Name Change/ }).click();
    expect(await events()).toEqual(["accept:invitation:inv_1"]);
    expect(await trigger.getAttribute("aria-label")).toContain("1 waiting for you");
    await expect.poll(() => page.getByRole("menu").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  it("shows no flag when nothing is pending", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.U.mountSidebar(() => {}, false));
    await page.waitForSelector('[data-slot="sidebar-wrapper"]');
    expect(await page.locator('[data-slot="pending-dot"]').count()).toBe(0);
    expect(await page.getByRole("button", { name: /^Workspace:/ }).getAttribute("aria-label")).not.toContain("waiting");
  });

  it("says what it checked when nothing is pending, refreshes when the menu opens, and offers Check again", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      window.__events = [];
      window.U.mountSidebar((event) => window.__events.push(event), false);
    });
    await page.waitForSelector('[data-slot="sidebar-wrapper"]');
    const trigger = page.getByRole("button", { name: /^Workspace:/ });
    await trigger.click();
    const menu = page.getByRole("menu");
    await menu.waitFor();
    expect(await refreshes()).toBe(1);
    expect(await menu.getByRole("status").innerText()).toContain("No pending invitations for aditya@example.com.");
    expect(await menu.getByRole("status").innerText()).toContain("unverified: old@example.com");
    await shot("switcher-empty-light");
    await menu.getByRole("menuitem", { name: "Check again" }).click();
    expect(await refreshes()).toBe(2);
    // The menu stays open so the answer is visible.
    expect(await menu.isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("menu").count()).toBe(0);
  });

  it("explains an empty inbox on the no-workspace screen", async () => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.evaluate(() => {
      window.__events = [];
      window.U.mountNotice((event) => window.__events.push(event), false, true);
    });
    await page.getByText("No pending invitations for aditya.work@example.com.").waitFor();
    await shot("notice-empty-light");
    await page.getByRole("button", { name: "Check again" }).click();
    await page.getByText("Checking for invitations…").waitFor();
    expect(await refreshes()).toBe(1);
    await page.getByText("No pending invitations for aditya.work@example.com.").waitFor();
  });

  it("answers an invitation from the dashboard notice", async () => {
    await mountNotice();
    expect(await page.getByRole("heading", { name: "Invitations" }).count()).toBe(1);
    expect(await page.getByText("Invited as Member · 2h ago").isVisible()).toBe(true);
    expect(await page.getByText("Your email domain").isVisible()).toBe(true);
    await shot("notice-light");
    await page.getByRole("button", { name: "Accept invitation to Name Change" }).click();
    await expect.poll(() => events()).toEqual(["accept:invitation:inv_1"]);
    await expect.poll(() => page.locator('[aria-labelledby="invitations-heading"] li', { hasText: "Name Change" }).count()).toBe(0);
    expect(await page.getByText("You joined Name Change").isVisible()).toBe(true);
    // A suggestion asks to join rather than joining.
    await page.getByRole("button", { name: "Request to join Acme Design" }).click();
    await expect.poll(() => events()).toEqual(["accept:invitation:inv_1", "accept:suggestion:sug_1"]);
  });

  it("shows Clerk's reason when accepting fails and keeps the invitation", async () => {
    await mountNotice(1280, true);
    await page.getByRole("button", { name: "Accept invitation to Name Change" }).click();
    await page.getByText("This invitation has expired.").waitFor();
    expect(await page.getByRole("button", { name: "Accept invitation to Name Change" }).isEnabled()).toBe(true);
  });

  it("fits a phone in light and dark", async () => {
    await mountNotice(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot("notice-mobile-light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(250);
    await shot("notice-mobile-dark");
  });
});
