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

const shots = process.env.SIDEBAR_SHOTS;

suite("dashboard sidebar in real Chrome (real component, fixture data)", () => {
  let s: BrowserSession;
  let page: Page;
  let errors: string[];

  const mount = async (width = 1280, height = 800) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.__events = [];
      window.U.mountSidebar((event) => window.__events.push(event));
    });
    await page.waitForSelector('[data-slot="sidebar-wrapper"]');
  };
  // "~refresh" (a look-for-invitations request when the workspace menu opens) is covered in invitations.browser.test.ts.
  const events = () => page.evaluate(() => window.__events.filter((e) => e !== "~refresh"));
  const sidebar = () => page.locator('[data-slot="sidebar-container"]');
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
  };

  beforeAll(async () => {
    s = await openPage({ font: "system", ui: true, extraCss: await appCss() });
    page = s.page;
    page.on("pageerror", (e) => errors.push(e.message));
  });
  afterAll(async () => {
    await s?.close();
  });
  beforeEach(() => {
    errors = [];
  });

  it("marks the current page and moves the mark when another page is chosen", async () => {
    await mount();
    const dashboard = page.getByRole("button", { name: "Dashboard" });
    expect(await dashboard.getAttribute("aria-current")).toBe("page");
    await page.getByRole("button", { name: "Billing" }).click();
    expect(await events()).toEqual(["nav:Billing"]);
    expect(await page.getByRole("button", { name: "Billing" }).getAttribute("aria-current")).toBe("page");
    expect(await dashboard.getAttribute("aria-current")).toBeNull();
    await shot("desktop-light");
    expect(errors).toEqual([]);
  });

  it("shows the member count and recent whiteboards as links that route without a page load", async () => {
    await mount();
    expect(await page.getByRole("button", { name: "Members" }).locator("xpath=..").innerText()).toContain("4");
    const link = page.getByRole("link", { name: "Checkout service architecture" });
    expect(await link.getAttribute("href")).toBe("/whiteboard/b1");
    await link.click();
    expect(await events()).toEqual(["board:b1"]);
    expect(page.url()).not.toContain("/whiteboard/");
  });

  it("anchors workspace and account to the bottom edge with no clipping, and the rule lines up with the top bar", async () => {
    await mount(1280, 700);
    const box = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!;
    const account = await box(page.getByRole("button", { name: /^Account:/ }));
    const container = await box(sidebar());
    expect(Math.round(account.y + account.height + 8)).toBe(Math.round(container.y + container.height));
    const brand = await box(page.locator('[data-slot="sidebar-header"]'));
    const top = await box(page.locator("main header"));
    expect(Math.round(brand.height)).toBe(Math.round(top.height));
    for (const b of [account, await box(page.getByRole("button", { name: /^Workspace:/ }))]) {
      expect(b.x).toBeGreaterThanOrEqual(container.x);
      expect(b.x + b.width).toBeLessThanOrEqual(container.x + container.width);
    }
  });

  it("switches workspace from the menu, by keyboard", async () => {
    await mount();
    const trigger = page.getByRole("button", { name: /^Workspace:/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await menu.waitFor();
    await shot("workspace-menu");
    for (const name of ["Northwind Studio", "Side projects", "Manage workspace", "Create workspace"]) {
      expect(await menu.getByRole("menuitem", { name: new RegExp(`^${name}`) }).count()).toBe(1);
    }
    // Opening with the keyboard lands on the first item (the current workspace); one step down is the other.
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toContain("Side projects");
    await page.keyboard.press("Enter");
    expect(await events()).toEqual(["switch:org_2"]);
    expect(await page.getByRole("button", { name: /^Workspace:/ }).innerText()).toContain("Side projects");
    // Focus returns to the trigger once the menu closes.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toMatch(/^Workspace:/);
  });

  it("opens the account menu and reports account and sign-out choices; Escape closes it", async () => {
    await mount();
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Manage account" }).click();
    await page.getByRole("button", { name: /^Account:/ }).click();
    await shot("account-menu");
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    expect(await events()).toEqual(["account", "signout"]);
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("menu").count()).toBe(0);
  });

  it("collapses to an icon rail with tooltips and menus that open beside it, and expands again with Ctrl+B", async () => {
    await mount();
    const expandedWidth = (await sidebar().boundingBox())!.width;
    await page.keyboard.press("Control+b");
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === "collapsed");
    await page.waitForTimeout(300);
    const collapsed = (await sidebar().boundingBox())!;
    expect(collapsed.width).toBeLessThan(expandedWidth / 3);
    expect(await page.getByText("Draw Anything").isVisible()).toBe(false);
    // No label is clipped halfway: the rail shows icons only, and each still has an accessible name.
    for (const name of ["Dashboard", "Whiteboards", "Members", "Billing"]) expect(await page.getByRole("button", { name }).isVisible()).toBe(true);
    await page.getByRole("button", { name: "Whiteboards" }).hover();
    await page.getByRole("tooltip").waitFor();
    expect(await page.getByRole("tooltip").innerText()).toContain("Whiteboards");
    await page.mouse.move(700, 400);
    await page.waitForTimeout(300);
    await shot("collapsed-light");
    await page.getByRole("button", { name: "Whiteboards" }).hover();
    await page.getByRole("tooltip").waitFor();
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.waitForTimeout(300);
    const menu = await page.getByRole("menu").boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(collapsed.x + collapsed.width);
    await shot("collapsed-menu");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+b");
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === "expanded");
  });

  it("gives every control a visible focus ring", async () => {
    await mount();
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { label: el.textContent, shadow: style.boxShadow };
    });
    expect(ring.shadow).not.toBe("none");
  });

  it("on a phone the navigation is a sheet that opens from the trigger and closes on Escape", async () => {
    await mount(390, 760);
    expect(await sidebar().count()).toBe(0);
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await dialog.waitFor();
    await page.waitForTimeout(350);
    await shot("mobile-light");
    expect(await dialog.getByRole("button", { name: "Whiteboards" }).isVisible()).toBe(true);
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("dialog").count(), { timeout: 3000 }).toBe(0);
  });

  it("renders in dark mode", async () => {
    await mount();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await shot("desktop-dark");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  });

  it("holds up with a long name and removes motion when the user prefers none", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mount();
    const longLink = page.getByRole("link", { name: /A board with a name long/ });
    const linkBox = (await longLink.boundingBox())!;
    const container = (await sidebar().boundingBox())!;
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(container.x + container.width);
    const duration = await page.getByRole("button", { name: "Dashboard" }).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
});
