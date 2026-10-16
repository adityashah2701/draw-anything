import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { findChrome, openPage, type BrowserSession } from "./harness";

const suite = findChrome() ? describe : describe.skip;

declare global {
  interface Window {
    U: { mountExport(elements: DrawingElement[], selectedIds: string[]): void };
    fixtureElements: DrawingElement[];
  }
}

suite("export dialog in real Chrome (real component + hook + exporter)", () => {
  let s: BrowserSession;
  let page: Page;
  let pageErrors: string[];

  beforeAll(async () => {
    s = await openPage({ font: "inter", secure: true, ui: true });
    page = s.page;
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await s.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  });
  afterAll(async () => {
    await s?.close();
  });

  const mount = async (opts: { empty?: boolean; select?: "none" | "two" } = {}) => {
    await page.evaluate(
      ({ empty, select }) => {
        const elements = empty ? [] : window.T.compileAIDiagramToCanvas(window.T.LAYOUT_FIXTURES.flowchart, "frame");
        const nodes = elements.filter((e) => e.ai?.role === "node");
        window.fixtureElements = elements;
        window.U.mountExport(elements, select === "two" ? [nodes[0].id, nodes[1].id] : []);
      },
      { empty: opts.empty ?? false, select: opts.select ?? "none" },
    );
    await page.getByRole("dialog").waitFor();
  };
  const radio = (name: string) => page.getByRole("radio", { name, exact: true });
  const toggle = (name: string) => page.getByRole("switch", { name });
  const exportButton = (format: string) => page.getByRole("button", { name: `Export ${format}`, exact: true });
  const download = async (format: string) => {
    const [file] = await Promise.all([page.waitForEvent("download"), exportButton(format).click()]);
    return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
  };

  beforeEach(() => {
    pageErrors = [];
  });

  it("opens with PNG, 2x, opaque, and selection-only unavailable when nothing is selected", async () => {
    await mount();
    expect(await radio("PNG").getAttribute("aria-checked")).toBe("true");
    expect(await radio("2×").getAttribute("aria-checked")).toBe("true");
    expect(await toggle("Transparent background").isChecked()).toBe(false);
    expect(await toggle("Selected shapes only").isDisabled()).toBe(true);
    await expect(page.getByText("Select shapes on the canvas first.").isVisible()).resolves.toBe(true);
  });

  it("switching format disables what does not apply: quality for SVG, transparency for PDF", async () => {
    await mount();
    await radio("SVG").click();
    expect(await radio("2×").isDisabled()).toBe(true);
    expect(await toggle("Transparent background").isDisabled()).toBe(false);
    await radio("PDF").click();
    expect(await toggle("Transparent background").isDisabled()).toBe(true);
    expect(await radio("2×").isDisabled()).toBe(false);
    await expect(page.getByText("PDF pages are always white.").isVisible()).resolves.toBe(true);
    await radio("PNG").click();
    expect(await toggle("Transparent background").isDisabled()).toBe(false);
  });

  it("downloads a real PNG named after the board, then closes", async () => {
    await mount();
    const { name, bytes } = await download("PNG");
    expect(name).toBe("Test-Board.png");
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await page.getByRole("dialog").waitFor({ state: "detached" });
    expect(pageErrors).toEqual([]);
  });

  it("downloads an SVG with a background by default and without one when transparent", async () => {
    await mount();
    await radio("SVG").click();
    const opaque = await download("SVG");
    expect(opaque.name).toBe("Test-Board.svg");
    expect(opaque.bytes.toString()).toMatch(/<rect [^>]*fill="#ffffff"\/>/);
    await mount();
    await radio("SVG").click();
    await toggle("Transparent background").click();
    const transparent = await download("SVG");
    expect(transparent.bytes.toString()).not.toMatch(/<rect [^>]*fill="#ffffff"\/>/);
    expect(transparent.bytes.toString().startsWith("<?xml")).toBe(true);
  });

  it("downloads a PDF", async () => {
    await mount();
    await radio("PDF").click();
    const { name, bytes } = await download("PDF");
    expect(name).toBe("Test-Board.pdf");
    expect(bytes.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(bytes.subarray(-6).toString()).toContain("%%EOF");
  });

  it("with shapes selected, selection-only is on by default and exports less than the whole board", async () => {
    await mount({ select: "two" });
    expect(await toggle("Selected shapes only").isChecked()).toBe(true);
    await radio("SVG").click();
    const picked = (await download("SVG")).bytes.toString();
    await mount({ select: "two" });
    await radio("SVG").click();
    await toggle("Selected shapes only").click();
    const all = (await download("SVG")).bytes.toString();
    const texts = (svg: string) => (svg.match(/<text /g) ?? []).length;
    expect(texts(picked)).toBeGreaterThanOrEqual(2);
    expect(texts(picked)).toBeLessThan(texts(all));
  });

  it("an empty board shows the reason in the dialog and keeps it open, without an unhandled error", async () => {
    await mount({ empty: true });
    await exportButton("PNG").click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect(await alert.textContent()).toContain("The board is empty");
    expect(await page.getByRole("dialog").isVisible()).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  it("Cancel closes it, and reopening starts from the defaults again", async () => {
    await mount();
    await radio("PDF").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Open export" }).click();
    await page.getByRole("dialog").waitFor();
    expect(await radio("PNG").getAttribute("aria-checked")).toBe("true");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  });

  it("Copy as image puts a PNG on the clipboard and keeps the dialog open", async () => {
    await mount();
    await page.getByRole("button", { name: "Copy as image" }).click();
    await page.waitForFunction(async () => {
      try {
        const items = await navigator.clipboard.read();
        return items.some((i) => i.types.includes("image/png"));
      } catch {
        return false;
      }
    });
    expect(await page.getByRole("alert").count()).toBe(0);
    expect(await page.getByRole("dialog").isVisible()).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  it("a failed copy shows its reason in the dialog", async () => {
    await mount();
    await page.evaluate(() => {
      navigator.clipboard.write = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    });
    await page.getByRole("button", { name: "Copy as image" }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    expect(await alert.textContent()).toMatch(/blocked copying/i);
    expect(pageErrors).toEqual([]);
  });
});
