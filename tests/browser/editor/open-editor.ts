import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright-core";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { findChrome } from "../harness";
import { editorBundle, editorCss, interFontFace } from "./bundle";
import type { EditorInit } from "./types";

export interface Point {
  x: number;
  y: number;
}
export interface OpenEditorOptions {
  /** Board content for the first load. Goes through the real seed-from-snapshot path (read-only boards seed the room directly). */
  elements?: DrawingElement[];
  readOnly?: boolean;
  dark?: boolean;
  viewport?: { width: number; height: number };
  boardId?: string;
}
export interface Gesture {
  /** Mouse moves between the two ends (default 8). */
  steps?: number;
  /** "world" (default) are board coordinates; "screen" are page pixels. */
  space?: "world" | "screen";
}

/** Console errors and warnings, page errors and failed requests seen so far. */
export type Problems = string[];

export interface EditorSession {
  page: Page;
  canvas: Locator;
  problems: Problems;
  close(): Promise<void>;
  /** Reload the page: the board comes back through the fake Convex's saved content. */
  reload(): Promise<void>;
  /** Board point -> page pixel, from the real viewport state. */
  toScreen(world: Point): Promise<Point>;
  toWorld(screen: Point): Promise<Point>;
  view(): Promise<{ zoom: number; pan: Point }>;
  /** Live board as the editor sees it. */
  elements(): Promise<DrawingElement[]>;
  /** What the fake Convex has stored (parsed `content`), or null. */
  saved(): Promise<{ elements: DrawingElement[]; canvasSettings?: { zoom: number; panOffset: Point } } | null>;
  selected(): Promise<string[]>;
  tool(): Promise<string>;
  /** A one-letter shortcut ("r") or a toolbar button name ("Rectangle"). */
  pickTool(nameOrShortcut: string): Promise<void>;
  drag(from: Point, to: Point, options?: Gesture): Promise<void>;
  click(at: Point, options?: Pick<Gesture, "space">): Promise<void>;
  dblclick(at: Point, options?: Pick<Gesture, "space">): Promise<void>;
  type(text: string): Promise<void>;
  press(key: string): Promise<void>;
  /** Two animation frames, then until autosave has nothing pending. */
  waitForIdle(): Promise<void>;
  /** PNG of the page; also written to $SAVE_EXPORT_DIR/editor-<name>.png when that is set. */
  screenshot(name: string): Promise<Buffer>;
}

export const hasChrome = () => findChrome() !== null;

const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export const openEditor = async (options: OpenEditorOptions = {}): Promise<EditorSession> => {
  const executablePath = findChrome();
  if (!executablePath) throw new Error("No Chrome found; set CHROME_PATH");
  const boardId = options.boardId ?? "board0test0000000001";
  const readOnly = options.readOnly ?? false;
  const elements = options.elements ?? [];
  const init: EditorInit = {
    boardId,
    readOnly,
    dark: options.dark ?? true,
    content: readOnly || elements.length === 0 ? null : JSON.stringify({ elements, canvasSettings: { zoom: 1, panOffset: { x: 0, y: 0 }, showGrid: false } }),
    roomElements: readOnly ? elements : [],
  };

  const [bundle, css] = await Promise.all([editorBundle(), editorCss()]);
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 800 }, acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost" });
  const page = await context.newPage();

  const problems: Problems = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${interFontFace()}${css}</style></head><body class="antialiased bg-background text-foreground"><div id="root"></div><script>window.__fakeInit=${safeJson(init)}</script><script src="/bundle.js"></script></body></html>`;
  await page.route("http://localhost/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path === "/bundle.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    return route.fulfill({ status: 204 });
  });

  const load = async () => {
    await page.goto("http://localhost/");
    await page.locator("canvas").first().waitFor();
    await page.waitForFunction(() => window.__editor?.controller?.isBoardReady === true);
  };
  await load();

  const evalView = () =>
    page.evaluate(() => {
      const c = window.__editor.controller!;
      const rect = c.canvasRef.current!.getBoundingClientRect();
      return { zoom: c.canvasViewport.zoom, pan: c.canvasViewport.panOffset, origin: { x: rect.left, y: rect.top } };
    });
  const toScreen = async (w: Point): Promise<Point> => {
    const v = await evalView();
    return { x: v.origin.x + w.x * v.zoom + v.pan.x, y: v.origin.y + w.y * v.zoom + v.pan.y };
  };
  const toWorld = async (s: Point): Promise<Point> => {
    const v = await evalView();
    return { x: (s.x - v.origin.x - v.pan.x) / v.zoom, y: (s.y - v.origin.y - v.pan.y) / v.zoom };
  };
  const place = async (p: Point, space: Gesture["space"]) => (space === "screen" ? p : toScreen(p));

  const idle = async () => {
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.waitForFunction(
      () => {
        const save = window.__editor.controller?.whiteboardAutoSave;
        return !!save && !save.hasPendingChanges && !save.isSaving;
      },
      undefined,
      { timeout: 20_000 },
    );
  };

  return {
    page,
    canvas: page.locator("canvas").first(),
    problems,
    async close() {
      await browser.close();
    },
    async reload() {
      await page.reload();
      await page.locator("canvas").first().waitFor();
      await page.waitForFunction(() => window.__editor?.controller?.isBoardReady === true);
    },
    toScreen,
    toWorld,
    async view() {
      const v = await evalView();
      return { zoom: v.zoom, pan: v.pan };
    },
    elements: () => page.evaluate(() => window.__editor.room.elements()),
    async saved() {
      const content = await page.evaluate(() => window.__editor.backend.savedContent());
      return content ? JSON.parse(content) : null;
    },
    selected: () => page.evaluate(() => [...window.__editor.controller!.selectedElements]),
    tool: () => page.evaluate(() => String(window.__editor.controller!.currentTool)),
    async pickTool(nameOrShortcut) {
      if (nameOrShortcut.length === 1) await page.keyboard.press(nameOrShortcut);
      else await page.getByRole("button", { name: nameOrShortcut, exact: true }).click();
    },
    async drag(from, to, { steps = 8, space = "world" } = {}) {
      const a = await place(from, space);
      const b = await place(to, space);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps });
      await page.mouse.up();
    },
    async click(at, { space = "world" } = {}) {
      const p = await place(at, space);
      await page.mouse.click(p.x, p.y);
    },
    async dblclick(at, { space = "world" } = {}) {
      const p = await place(at, space);
      await page.mouse.dblclick(p.x, p.y);
    },
    type: (text) => page.keyboard.type(text),
    press: (key) => page.keyboard.press(key),
    waitForIdle: idle,
    async screenshot(name) {
      const png = await page.screenshot();
      const dir = process.env.SAVE_EXPORT_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/editor-${name}.png`, png);
      }
      return png;
    },
  };
};
