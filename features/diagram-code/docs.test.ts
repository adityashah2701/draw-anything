import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planApply } from "./apply";
import { formatDiagramCode } from "./language/format";
import { compileDiagramCode } from "./language/compile";

const doc = readFileSync(join(process.cwd(), "docs/diagram-code/README.md"), "utf8");
const examples = [...doc.matchAll(/```diagram-code\n([\s\S]*?)```/g)].map((match) => match[1]);

describe("docs/diagram-code/README.md examples", () => {
  it("has the examples the guide promises", () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
    for (const type of ["flowchart", "entity-relationship", "architecture", "network"]) expect(examples.some((code) => code.includes(`type ${type}`))).toBe(true);
    expect(examples.some((code) => /^frame /m.test(code))).toBe(true);
  });

  examples.forEach((code, i) => {
    const title = code.match(/^title (.*)$/m)?.[1] ?? `example ${i + 1}`;
    describe(title, () => {
      it("compiles with no errors or warnings", () => {
        expect(compileDiagramCode(code).diagnostics).toEqual([]);
      });
      it("is already formatted, and formatting is stable", () => {
        const once = formatDiagramCode(code);
        expect(once.refused).toBeUndefined();
        expect(once.text).toBe(code);
      });
      it("draws on an empty board with no warnings", () => {
        const outcome = planApply({ code, canvas: [], generationId: "docs" });
        expect(outcome.status).toBe("ready");
        if (outcome.status === "ready") {
          expect(outcome.plan.issues).toEqual([]);
          expect(outcome.plan.patch.add.length).toBeGreaterThan(0);
        }
      });
    });
  });
});
