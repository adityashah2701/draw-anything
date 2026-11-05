import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { legacyCorpus, summarize } from "./legacy-corpus";

initializeShapeRegistry();
const GOLDEN = join(process.cwd(), "core/layout/__fixtures__/legacy-corpus.golden.json");

describe("legacy corpus: drawings compile exactly as they did before the layout foundations", () => {
  const corpus = legacyCorpus();
  const actual = Object.fromEntries(corpus.map((item) => [item.name, summarize(item.elements)]));

  // WRITE_GOLDEN=1 regenerates the file; it was first written from the code as it was before this work began.
  if (process.env.WRITE_GOLDEN === "1" || !existsSync(GOLDEN)) writeFileSync(GOLDEN, `${JSON.stringify(actual)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, ReturnType<typeof summarize>>;

  it("covers the layout fixtures, the browser baselines and every documented example", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(golden)).toEqual(Object.keys(actual));
  });

  it.each(corpus.map((item) => item.name))("%s is unchanged", (name) => {
    expect(actual[name]).toEqual(golden[name]);
  });
});
