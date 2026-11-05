import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
const sources = ["core", "features", "lib", "app", "components"].flatMap((dir) => walk(join(ROOT, dir)));
const rel = (path: string) => relative(ROOT, path).replaceAll("\\", "/");
const importsOf = (text: string) => [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe("storage boundary: every write to the shared element list goes through one place", () => {
  it("creates Liveblocks element objects only in the stamping module, the seeding step and the room's own config", () => {
    const makers = sources.filter((file) => /new LiveObject\(/.test(readFileSync(file, "utf8"))).map(rel);
    expect(makers.sort()).toEqual(["features/whiteboard/hooks/controller/storage-writes.ts", "features/whiteboard/hooks/controller/use-whiteboard-page-controller.ts"]);
    // The controller's only remaining use is seeding an empty room from the stored snapshot, which writes what was saved and stamps nothing.
    const controller = readFileSync(join(ROOT, "features/whiteboard/hooks/controller/use-whiteboard-page-controller.ts"), "utf8");
    expect(controller.match(/new LiveObject\(/g)).toHaveLength(1);
    expect(controller).toMatch(/initial\.forEach\(\(el\) => list\.push\(new LiveObject\(el\)\)\)/);
  });

  it("updates a stored element only through writeElement", () => {
    const direct = sources.filter((file) => /\blive\.update\(|\bget\(index\)!?\.update\(|\.get\(i\)!\.update\(/.test(readFileSync(file, "utf8"))).map(rel);
    expect(direct).toEqual(["features/whiteboard/hooks/controller/storage-writes.ts"]);
  });

  it("writes the placement stamp from one module only", () => {
    const writers = sources.filter((file) => /placement\s*:\s*["'](?:auto|user)["']|placement:\s*stamp|\{ \.\.\.[a-z]+, placement/.test(readFileSync(file, "utf8"))).map(rel);
    // The stamping module, plus the layout planner that asks for a stamp through `placements` (added with it).
    expect(writers.filter((file) => !file.startsWith("core/layout/"))).toEqual([]);
  });
});

describe("engines are independent: they share the kit and nothing else", () => {
  const engines = sources.filter((file) => rel(file).startsWith("core/layout/engines/"));
  const ALLOWED = [/^@\/core\/layout\/kit/, /^@\/core\/layout\/types$/, /^@\/core\/routing/, /^@\/core\/geometry/, /^@\/core\/frames/, /^@\/core\/groups/, /^@\/core\/text/, /^@\/features\/whiteboard\/types/, /^\.\/?/, /^\.\.\/kit/, /^\.\.\/\.\.\/types$/, /^\.\.\/\.\.\/kit/];

  it("imports only the kit, core infrastructure and its own folder", () => {
    for (const file of engines) {
      const own = rel(file).split("/").slice(0, 4).join("/");
      for (const spec of importsOf(readFileSync(file, "utf8"))) {
        if (spec.startsWith("@/core/layout/engines/")) expect(spec.startsWith(`@/${own}`), `${rel(file)} imports another engine: ${spec}`).toBe(true);
        if (spec.startsWith("@/features/") && !spec.startsWith("@/features/whiteboard/types")) throw new Error(`${rel(file)} imports ${spec}: engines never import from features`);
        if (spec.startsWith("@/")) expect(ALLOWED.some((re) => re.test(spec)), `${rel(file)} imports ${spec}`).toBe(true);
      }
    }
  });

  it("keeps core free of runtime imports from features", () => {
    const offenders = sources
      .filter((file) => rel(file).startsWith("core/layout/"))
      .flatMap((file) => importsOf(readFileSync(file, "utf8")).filter((spec) => spec.startsWith("@/features/") && !spec.startsWith("@/features/whiteboard/types")).map((spec) => `${rel(file)} -> ${spec}`));
    // The legacy corpus is a test fixture that deliberately compiles features' drawings.
    expect(offenders.filter((line) => !line.startsWith("core/layout/legacy-corpus.ts"))).toEqual([]);
  });
});

describe("elkjs is loaded lazily", () => {
  it("is imported nowhere except the loader, and only through a dynamic import", () => {
    const users = sources.filter((file) => /["']elkjs/.test(readFileSync(file, "utf8")) && !rel(file).includes("benchmark"));
    expect(users.map(rel)).toEqual(["core/layout/elk/loader.ts"]);
    const text = readFileSync(users[0], "utf8");
    expect(text).toMatch(/import\("elkjs\//);
    expect(text).not.toMatch(/^import .* from "elkjs/m);
  });
});
