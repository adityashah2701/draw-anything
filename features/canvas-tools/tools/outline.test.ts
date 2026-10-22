import { describe, expect, it } from "vitest";
import { describeOutlineVariants, outlineVariantIds } from "@/core/shapes/outline/variants";
import { buildSystemPrompt } from "../agent/prompt";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildTools, toolSpec } from "../registry";
import { find, rectangle, setup } from "../test-helpers";

type Outlined = DrawingElement & { variant?: string; label?: string; cornerRadius?: number; points: Array<{ x: number; y: number }> };

/** Outline variants reach the agent through the registry accessor only: nothing here names a variant the registry does not. */
describe("outline variants in the agent", () => {
  it("draws every registered variant with its default size, label and the variant stored", async () => {
    const s = setup();
    for (const { id, defaultSize } of describeOutlineVariants()) {
      await s.ok("create_shape", { id: `v-${id}`, shape: id, x: 0, y: 0, label: id, snap: false });
      const el = find<Outlined>(s.mem.stored, `v-${id}`);
      expect(el).toMatchObject({ type: "outline", variant: id, label: id });
      expect(el.points[1].x - el.points[0].x).toBe(defaultSize.width);
      expect(el.points[1].y - el.points[0].y).toBe(defaultSize.height);
    }
  });

  it("re-shapes a rectangle into a variant, between variants, and back, keeping id, place and label", async () => {
    const [first, second] = outlineVariantIds();
    const s = setup({ elements: [{ ...rectangle("a", 40, 40), label: "Store", cornerRadius: 8 } as never] });
    await s.ok("change_shape", { ids: ["a"], shape: first });
    expect(find<Outlined>(s.mem.stored, "a")).toMatchObject({ type: "outline", variant: first, label: "Store" });
    expect(find<Outlined>(s.mem.stored, "a").cornerRadius).toBeUndefined();
    await s.ok("change_shape", { ids: ["a"], shape: second });
    expect(find<Outlined>(s.mem.stored, "a")).toMatchObject({ type: "outline", variant: second });
    await s.ok("change_shape", { ids: ["a"], shape: "rectangle" });
    expect(find<Outlined>(s.mem.stored, "a")).toMatchObject({ type: "rectangle", label: "Store" });
    expect(find<Outlined>(s.mem.stored, "a").variant).toBeUndefined();
  });

  it("reports a no-op re-shape instead of writing", async () => {
    const [first] = outlineVariantIds();
    const s = setup();
    await s.ok("create_shape", { id: "o", shape: first, x: 0, y: 0 });
    const result = await s.run("change_shape", { ids: ["o"], shape: first });
    expect(result.ok).toBe(false);
  });

  it("round-trips through diagram code and shows the variant when read back", async () => {
    const [first] = outlineVariantIds();
    const s = setup();
    await s.ok("create_shape", { id: "o", shape: first, x: 0, y: 0, label: "Orders" });
    const text = await s.ok("serialize_diagram", { format: "diagram_code" });
    expect(JSON.stringify(text)).toContain(`shape: ${first}`);
    const [, other] = outlineVariantIds();
    const code = (text.data as { content: string }).content;
    expect(code).toContain(`shape: ${first}`);
    const checked = await s.ok("check_diagram_code", { code: code.replace(`shape: ${first}`, `shape: ${other}`) });
    expect((checked.data as { valid: boolean }).valid).toBe(true);
    await s.ok("apply_diagram_code", { code: code.replace(`shape: ${first}`, `shape: ${other}`) });
    expect(find<Outlined>(s.mem.stored, "o")).toMatchObject({ type: "outline", variant: other, label: "Orders" });
    await s.ok("change_shape", { ids: ["o"], shape: first });
    const found = await s.ok("get_element_details", { ids: ["o"] });
    expect(JSON.stringify(found)).toContain(`"variant":"${first}"`);
  });

  it("lists the variants in check_diagram_code's reference, the prompt and the tool schemas", () => {
    const ids = outlineVariantIds();
    const tools = buildTools(() => undefined);
    const shape = JSON.stringify(toolSpec(tools.find((t) => t.name === "create_shape")!));
    const change = JSON.stringify(toolSpec(tools.find((t) => t.name === "change_shape")!));
    const prompt = buildSystemPrompt({ groups: ["create"], specs: [], protocol: "native" });
    for (const id of ids) {
      expect(shape).toContain(id);
      expect(change).toContain(id);
      expect(prompt).toContain(id);
    }
  });
});
