import { afterEach, describe, expect, it } from "vitest";
import { outlineVariantIds } from "@/core/shapes/outline/variants";
import { hasChrome, openEditor, type EditorSession, type Point } from "./open-editor";
import type { El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;

suite("editor outline shapes", () => {
  let s: EditorSession | undefined;
  const expected = (extra: RegExp[] = []) => [/favicon|404|willReadFrequently/i, ...extra];
  afterEach(async () => {
    await s?.close();
    s = undefined;
  });

  const problems = (session: EditorSession, allow: RegExp[] = []) => session.problems.filter((p) => !expected(allow).some((re) => re.test(p)));

  const pixel = async (session: EditorSession, world: Point) => {
    const at = await session.toScreen(world);
    return session.page.evaluate(({ x, y }) => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      const data = canvas.getContext("2d")!.getImageData(Math.round((x - rect.left) * dpr), Math.round((y - rect.top) * dpr), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    }, at);
  };

  const pick = async (session: EditorSession, label: string) => {
    await session.pickTool(label);
  };

  it("draws every variant from the picker, picks it by its outline and styles it from the bar", async () => {
    s = await openEditor({ dark: false });
    const labels = await s.page.evaluate((ids) => ids, outlineVariantIds());
    expect(labels).toHaveLength(5);
    const names: Record<string, string> = { cylinder: "Cylinder", cloud: "Cloud", document: "Document", hexagon: "Hexagon", parallelogram: "Parallelogram" };
    let y = 80;
    for (const id of outlineVariantIds()) {
      await pick(s, names[id]);
      expect(await s.tool()).toBe(`outline:${id}`);
      await s.drag({ x: 300, y }, { x: 500, y: y + 100 });
      await s.waitForIdle();
      y += 130;
    }
    const outlines = (await s.elements()).filter((e) => e.type === "outline");
    expect(outlines.map((e) => (e as El).variant)).toEqual(outlineVariantIds());
    for (const el of outlines) {
      const [a, b] = el.points;
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // the stroke is drawn: the middle of the left edge for the box-like shapes
      expect(await pixel(s, { x: centre.x, y: Math.min(a.y, b.y) })).not.toEqual(await pixel(s, { x: 900, y: 700 }));
    }
    await s.screenshot("outline-variants");

    // picking by outline: a click inside the hexagon selects it, a click in the corner of its box does not
    await s.pickTool("v");
    const hexagon = outlines.find((e) => (e as El).variant === "hexagon")!;
    await s.click({ x: 302, y: Math.min(hexagon.points[0].y, hexagon.points[1].y) + 2 });
    await s.waitForIdle();
    expect(await s.selected()).toEqual([]);
    await s.click({ x: 400, y: Math.min(hexagon.points[0].y, hexagon.points[1].y) + 50 });
    await s.waitForIdle();
    expect(await s.selected()).toEqual([hexagon.id]);

    // the bar names the shape and switches the variant in one undo step
    const bar = s.page.getByRole("toolbar", { name: "Style properties" });
    await bar.getByRole("button", { name: /^Shape/ }).click();
    await s.page.getByRole("dialog", { name: "Shape", exact: true }).getByRole("button", { name: "Cloud" }).click();
    await s.waitForIdle();
    expect(((await s.elements()).find((e) => e.id === hexagon.id) as El).variant).toBe("cloud");
    await s.press("Control+z");
    await s.waitForIdle();
    expect(((await s.elements()).find((e) => e.id === hexagon.id) as El).variant).toBe("hexagon");
    expect(problems(s)).toEqual([]);
  });

  it("loads a board with an unknown variant as a plain rectangle outline, with a warning and no crash", async () => {
    const stored: El[] = [
      { id: "u", type: "outline", variant: "teapot", color: "#1f2937", strokeWidth: 2, fill: "#fde68a", points: [{ x: 200, y: 200 }, { x: 400, y: 320 }] },
      { id: "c", type: "outline", variant: "cylinder", color: "#1f2937", strokeWidth: 2, points: [{ x: 600, y: 200 }, { x: 720, y: 350 }] },
    ];
    s = await openEditor({ elements: stored as never, dark: false });
    // the fill reaches the corner of the box: it is a rectangle
    expect(await pixel(s, { x: 203, y: 203 })).toEqual([0xfd, 0xe6, 0x8a, 255]);
    expect((await s.elements()).map((e) => e.id)).toEqual(["u", "c"]);
    await s.click({ x: 203, y: 203 });
    await s.waitForIdle();
    expect(await s.selected()).toEqual(["u"]);
    expect(problems(s, [/teapot/])).toEqual([]);
    expect(s.problems.some((p) => /teapot/.test(p))).toBe(true);
    // and it saves back with its variant untouched
    await s.drag({ x: 300, y: 260 }, { x: 320, y: 280 });
    await s.waitForIdle();
    expect(((await s.saved())!.elements.find((e) => e.id === "u") as El).variant).toBe("teapot");
  });
});
