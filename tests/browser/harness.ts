import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright-core";

const root = fileURLToPath(new URL("../../", import.meta.url));

export const findChrome = (): string | null => {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((path): path is string => !!path && existsSync(path)) ?? null;
};

let bundle: string | null = null;
const getBundle = async () => {
  bundle ??= (
    await build({
      entryPoints: [`${root}tests/browser/entry.ts`],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "T",
      platform: "browser",
      alias: { "@": root.replace(/\/$/, "") },
      jsx: "automatic",
      logLevel: "silent",
    })
  ).outputFiles[0].text;
  return bundle;
};

export interface BrowserSession {
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

/** A blank white page with the real text modules on `window.T`. */
export type FontMode = "system" | "inter";
export const FONT_MODES: FontMode[] = ["inter", "system"];

const interFace = () =>
  `@font-face{font-family:Inter;font-weight:400 700;src:url(data:font/woff2;base64,${readFileSync(
    new URL("./fixtures/inter-latin-var.woff2", import.meta.url),
  ).toString("base64")}) format("woff2")}`;

/**
 * "inter": real Inter, loaded before the page is used (stable metrics on every machine).
 * "system": no font loaded, so the app's stack resolves to whatever this OS provides; that is
 * what users without Inter installed get, because the app never loads it.
 */
export const openPage = async (
  options: { deviceScaleFactor?: number; extraCss?: string; font?: FontMode } = {},
): Promise<BrowserSession> => {
  const executablePath = findChrome();
  if (!executablePath) throw new Error("No Chrome found; set CHROME_PATH");
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await (
    await browser.newContext({
      viewport: { width: 900, height: 600 },
      deviceScaleFactor: options.deviceScaleFactor ?? 1,
    })
  ).newPage();
  await page.setContent(
    `<!doctype html><html><head><style>${options.font === "inter" ? interFace() : ""}html,body{margin:0;background:#fff}${options.extraCss ?? ""}</style></head><body></body></html>`,
  );
  await page.addScriptTag({ content: await getBundle() });
  if (options.font === "inter") {
    await page.evaluate(async () => {
      await Promise.all(["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 16px Inter`)));
      await document.fonts.ready;
    });
  }
  return { browser, page, close: () => browser.close() };
};
