import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, openPage, type BrowserSession } from "./harness";
import { CALIBRATION_LABELS } from "./calibration-corpus";

const suite = findChrome() ? describe : describe.skip;

const FONTS: Record<string, string> = {
  inter: "Inter, sans-serif",
  "system (app stack minus Inter)": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  helvetica: "Helvetica, sans-serif",
  arial: "Arial, sans-serif",
};
const SIZES: Array<[number, string]> = [[17, "600"], [13, "500"], [16, "400"]];

interface Stats {
  mean: number;
  min: number;
  max: number;
  /** Labels whose estimated one-line box is narrower than the width real text needs. */
  undersized: string[];
  total: number;
}

suite("estimator vs real Chrome measurements", () => {
  let s: BrowserSession;
  let stats: Record<string, Stats>;
  beforeAll(async () => {
    s = await openPage({ font: "inter" });
    stats = await s.page.evaluate(
      ({ labels, fonts, sizes }) => {
        const T = window.T;
        const ctx = document.createElement("canvas").getContext("2d")!;
        const out: Record<string, Stats> = {};
        for (const [name, family] of Object.entries(fonts)) {
          const errs: number[] = [];
          const undersized: string[] = [];
          for (const [size, weight] of sizes) {
            for (const label of labels) {
              ctx.font = `normal ${weight} ${size}px ${family}`;
              const real = ctx.measureText(label).width;
              errs.push(T.estimateTextWidth(label, size, weight) / real - 1);
              // The compiler's node box: one line, no icon inset, wide limits so it never clamps.
              const box = T.estimateLabelBox({ label, fontSize: size, fontWeight: weight, maxLines: 1, minWidth: 40, maxWidth: 2000 });
              if (box.width < real + 24) undersized.push(`${label}@${size}/${weight}`);
            }
          }
          out[name] = {
            mean: errs.reduce((a, b) => a + b, 0) / errs.length,
            min: Math.min(...errs),
            max: Math.max(...errs),
            undersized,
            total: errs.length,
          };
        }
        return out;
      },
      { labels: CALIBRATION_LABELS, fonts: FONTS, sizes: SIZES },
    );
    if (process.env.DEBUG_CALIB) console.log("CALIB " + JSON.stringify(stats, null, 1));
  });
  afterAll(async () => {
    await s?.close();
  });

  it("is accurate for Inter, the font the stack asks for", () => {
    const inter = stats.inter;
    expect(Math.abs(inter.mean)).toBeLessThan(0.02);
    expect(inter.min).toBeGreaterThan(-0.05);
    expect(inter.max).toBeLessThan(0.05);
  });

  it("never sizes an Inter node too narrow for its text", () => {
    expect(stats.inter.undersized).toEqual([]);
  });

  for (const name of ["system (app stack minus Inter)", "helvetica", "arial"]) {
    it(`${name}: errs on the wide side, so nodes are not undersized by more than a sliver`, () => {
      // Real text rarely needs more than the estimate; the few misses are bounded to a few percent.
      expect(stats[name].min).toBeGreaterThan(-0.08);
      expect(stats[name].undersized.length / stats[name].total).toBeLessThan(0.1);
    });
  }
});
