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

const shots = process.env.TEAM_SHOTS;

suite("Team page in real Chrome (real components, fixture data; Clerk does not run here)", () => {
  let s: BrowserSession;
  let page: Page;
  let errors: string[];

  type Fixture = Parameters<typeof window.U.mountTeam>[0];
  const mount = async (fixture: Fixture = {}, width = 1280, height = 900) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((f) => {
      window.__events = [];
      window.U.mountTeam(f, (event) => window.__events.push(event));
    }, fixture);
    await page.waitForSelector("h1");
  };
  const events = () => page.evaluate(() => window.__events);
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  };
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

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

  it("leads with the workspace, a member summary and one primary Invite action", async () => {
    await mount();
    expect(await page.locator("h1").innerText()).toBe("Northwind Studio");
    expect(await page.getByText("3 members · 2 pending").isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Invite people" }).count()).toBe(1);
    expect(await page.getByText("You", { exact: true }).count()).toBe(1);
    await shot("desktop-light");
    expect(await noHorizontalScroll()).toBe(true);
    expect(errors).toEqual([]);
  });

  it("invites several people by email with a role, validating before it sends", async () => {
    await mount();
    await page.getByRole("button", { name: "Invite people" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite people" });
    await dialog.waitFor();
    // Focus lands in the email field.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
    await dialog.getByLabel("Email addresses").fill("new@example.com, nope");
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    expect(await dialog.getByRole("alert").innerText()).toContain("nope is not an email address");
    await dialog.getByLabel("Email addresses").fill("new@example.com, other@example.com, GRACE@navy.example");
    await dialog.getByRole("radio", { name: /Admin/ }).click();
    await shot("invite-dialog-light");
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    // Grace is already a member, so only two are sent.
    expect(await events()).toEqual(["invite:org:admin:new@example.com|other@example.com"]);
    expect(await page.getByText("4 members · 4 pending").count()).toBe(0);
    expect(await page.getByText("3 members · 4 pending").isVisible()).toBe(true);
    expect(await page.getByText("other@example.com").isVisible()).toBe(true);
  });

  it("shows the reason when Clerk refuses an invitation and keeps the dialog open", async () => {
    await mount({ failing: ["invite:org:member:a@example.com"] });
    await page.getByRole("button", { name: "Invite people" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite people" });
    await dialog.getByLabel("Email addresses").fill("a@example.com");
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await dialog.getByText("was refused by the fixture").waitFor();
    expect(await dialog.isVisible()).toBe(true);
  });

  it("opens the invite dialog on arrival when asked to", async () => {
    await mount({ startInviting: true });
    await page.getByRole("dialog", { name: "Invite people" }).waitFor();
  });

  it("changes a role from the row, not for yourself", async () => {
    await mount();
    expect(await page.getByRole("button", { name: /^Role for Aditya/ }).count()).toBe(0);
    await page.getByRole("button", { name: /^Role for Grace Hopper: Member/ }).click();
    await page.getByRole("menuitemradio", { name: "Admin" }).click();
    await expect.poll(() => events()).toEqual(["role:u2:org:admin"]);
    await page.getByRole("button", { name: /^Role for Grace Hopper: Admin/ }).waitFor();
  });

  it("removes a member only after confirming, and revokes an invitation in one step", async () => {
    await mount();
    await page.getByRole("button", { name: "More actions for Grace Hopper" }).click();
    await page.getByRole("menuitem", { name: /Remove from workspace/ }).click();
    const dialog = page.getByRole("dialog", { name: "Remove Grace Hopper?" });
    await dialog.waitFor();
    expect(await events()).toEqual([]);
    await shot("remove-dialog-light");
    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(await events()).toEqual(["remove:u2"]);
    expect(await page.getByText("Grace Hopper").count()).toBe(0);

    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect.poll(() => events()).toEqual(["remove:u2", "revoke:i1"]);
    await expect.poll(() => page.getByText("linus@example.com").count()).toBe(0);
  });

  it("offers no remove action on your own row", async () => {
    await mount();
    await page.getByRole("button", { name: "More actions for Aditya Shah" }).click();
    expect(await page.getByRole("menuitem", { name: /Remove/ }).count()).toBe(0);
    expect(await page.getByRole("menuitem", { name: /Copy email/ }).count()).toBe(1);
  });

  it("renames the workspace and replaces the logo", async () => {
    await mount();
    const save = page.getByRole("button", { name: "Save" });
    expect(await save.isDisabled()).toBe(true);
    await page.getByLabel("Name", { exact: true }).fill("Northwind Labs");
    await save.click();
    await expect.poll(() => events()).toEqual(["rename:Northwind Labs"]);
    await expect.poll(() => page.locator("h1").innerText()).toBe("Northwind Labs");
    await page.getByLabel("Workspace logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await expect.poll(() => events()).toContain("logo:logo.png");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect.poll(() => events()).toContain("logo:none");
  });

  it("leaves after confirming, and deletion needs the workspace name typed", async () => {
    await mount();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page.getByRole("dialog", { name: "Leave Northwind Studio?" }).getByRole("button", { name: "Leave workspace" }).click();
    await expect.poll(() => events()).toEqual(["leave"]);

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete Northwind Studio?" });
    const confirm = dialog.getByRole("button", { name: "Delete workspace" });
    expect(await confirm.isDisabled()).toBe(true);
    await dialog.getByLabel(/Type/).fill("Northwind Studio");
    expect(await confirm.isDisabled()).toBe(false);
    await shot("delete-dialog-light");
    await confirm.click();
    await expect.poll(() => events()).toEqual(["leave", "delete"]);
  });

  it("gives a plain member the list and Leave, with no management controls", async () => {
    await mount({ canManage: false });
    expect(await page.getByRole("button", { name: "Invite people" }).count()).toBe(0);
    expect(await page.getByRole("button", { name: /^Role for/ }).count()).toBe(0);
    expect(await page.getByText("Pending invitations").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Delete", exact: true }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Leave", exact: true }).count()).toBe(1);
    expect(await page.getByLabel("Name", { exact: true }).getAttribute("readonly")).not.toBeNull();
  });

  it("invites from an empty workspace", async () => {
    await mount({ members: [teamOne()], invites: [] });
    await page.getByText("Just you for now").waitFor();
    await shot("alone-light");
  });

  it("shows a skeleton while loading", async () => {
    await mount({ loading: true });
    expect(await page.locator('[aria-busy="true"]').count()).toBe(1);
  });

  it("holds up on a phone in light and dark with no horizontal scroll", async () => {
    await mount({}, 390, 800);
    expect(await noHorizontalScroll()).toBe(true);
    await shot("mobile-light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(250);
    await shot("mobile-dark");
    await page.getByRole("button", { name: "Invite people" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(250);
    await shot("mobile-invite-dark");
    const box = (await page.getByRole("dialog").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  it("renders in dark mode on desktop", async () => {
    await mount();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(250);
    await shot("desktop-dark");
    await page.getByRole("button", { name: "Invite people" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(250);
    await shot("invite-dialog-dark");
  });

  it("keeps long names inside their row", async () => {
    await mount();
    const row = page.locator("li", { hasText: "Ada Lovelace with a rather long" });
    const box = (await row.boundingBox())!;
    const email = (await row.getByText("analytical-engine.example").boundingBox())!;
    expect(email.x + email.width).toBeLessThanOrEqual(box.x + box.width);
  });
});

function teamOne() {
  return { id: "m1", userId: "u1", name: "Aditya Shah", email: "aditya@example.com", role: "org:admin", joinedAt: new Date(Date.now() - 86_400_000) };
}
