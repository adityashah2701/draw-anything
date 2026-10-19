import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const here = fileURLToPath(new URL("./", import.meta.url));

const FAKES: Array<[RegExp, string]> = [
  [/^@\/liveblocks\.config$/, "fakes/liveblocks.ts"],
  [/^convex\/react$/, "fakes/convex-react.ts"],
  [/^@\/convex\/_generated\/api$/, "fakes/convex-api.ts"],
  [/^next\/navigation$/, "fakes/next-navigation.ts"],
  [/^next\/link$/, "fakes/next-link.tsx"],
];
const CONTROLLER = "features/whiteboard/hooks/controller/use-whiteboard-page-controller.ts";
const PROBE = `${here}fakes/controller-probe.ts`;

/** Replaces the external services with the in-memory fakes, and wraps the controller hook to publish it. */
const fakesPlugin: Plugin = {
  name: "editor-fakes",
  setup(b) {
    for (const [filter, file] of FAKES) b.onResolve({ filter }, () => ({ path: `${here}${file}` }));
    b.onResolve({ filter: /use-whiteboard-page-controller$/ }, (args) =>
      args.importer === PROBE ? { path: `${root}${CONTROLLER}` } : { path: PROBE },
    );
  },
};

const bundles = new Map<boolean, Promise<string>>();
/** The editor bundle (IIFE), built once per flag setting per test file/worker. `unified` builds it with NEXT_PUBLIC_UNIFIED_AGENT=1. */
export const editorBundle = (unified = false) => {
  const cached = bundles.get(unified);
  if (cached) return cached;
  const built = build({
    entryPoints: [`${here}editor-entry.tsx`],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    alias: { "@": root.replace(/\/$/, "") },
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_UNIFIED_AGENT": unified ? '"1"' : '""' },
    plugins: [fakesPlugin],
    logLevel: "silent",
  }).then((r) => r.outputFiles[0].text);
  bundles.set(unified, built);
  return built;
};

let css: Promise<string> | null = null;
/** The app's real stylesheet (Tailwind compiled from app/globals.css), once per run. */
export const editorCss = () =>
  (css ??= postcss([tailwind()])
    .process(readFileSync(`${root}app/globals.css`, "utf8"), { from: `${root}app/globals.css` })
    .then((r) => r.css));

export const interFontFace = () =>
  `@font-face{font-family:Inter;font-weight:400 700;src:url(data:font/woff2;base64,${readFileSync(
    `${root}tests/browser/fixtures/inter-latin-var.woff2`,
  ).toString("base64")}) format("woff2")}:root{--font-geist-sans:Inter;--font-geist-mono:ui-monospace}`;
