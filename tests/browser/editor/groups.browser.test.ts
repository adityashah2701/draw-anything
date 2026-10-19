import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasChrome, openEditor, type EditorSession } from "./open-editor";
import { board, byId, records, shapeIds, sorted, type El } from "./group-fixtures";

const suite = hasChrome() ? describe : describe.skip;
suite("editor groups", () => {
  let s: EditorSession;
  beforeEach(async () => {
    s = await openEditor({ elements: board() as never });
  });
  afterEach(async () => {
    expect(s.problems.filter((p) => !/favicon|404/i.test(p))).toEqual([]);
    await s?.close();
  });

  /** Marquee over A, B and the connector between them. */
  const selectAB = async () => {
    await s.drag({ x: 60, y: 60 }, { x: 460, y: 220 });
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
  };
  const groupAB = async () => {
    await selectAB();
    await s.press("Control+g");
    await s.waitForIdle();
    return records(await s.elements())[0];
  };

  it("Ctrl+G groups the selection into one record and keeps the shapes, ids and stacking order", async () => {
    const before = await s.elements();
    const group = await groupAB();
    expect(group).toBeTruthy();
    const after = await s.elements();
    expect(records(after)).toHaveLength(1);
    expect(shapeIds(after)).toEqual(shapeIds(before));
    for (const id of ["A", "B", "ab"]) expect(byId(after, id).groupId).toBe(group.id);
    expect(byId(after, "C").groupId).toBeUndefined();
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
  });

  it("clicking one member selects the whole group; clicking away clears it", async () => {
    await groupAB();
    await s.click({ x: 900, y: 600 });
    expect(await s.selected()).toEqual([]);
    await s.click({ x: 160, y: 140 }); // inside A
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
    await s.click({ x: 310, y: 360 }); // C, an ordinary shape
    expect(await s.selected()).toEqual(["C"]);
  });

  it("dragging a group moves every member together and the connector stays glued to both shapes", async () => {
    await groupAB();
    await s.click({ x: 900, y: 600 });
    await s.drag({ x: 160, y: 140 }, { x: 260, y: 190 });
    const els = await s.elements();
    const a = byId(els, "A");
    const b = byId(els, "B");
    expect(a.points[0]).toEqual({ x: 200, y: 150 });
    expect(b.points[0]).toEqual({ x: 500, y: 150 });
    expect(byId(els, "C").points[0]).toEqual({ x: 250, y: 320 }); // untouched
    const arrow = byId(els, "ab");
    expect(arrow.points[0]).toMatchObject({ x: 320, y: 190 }); // A's right-middle
    expect(arrow.points.at(-1)).toMatchObject({ x: 500, y: 190 }); // B's left-middle
    expect(arrow.startConnection.elementId).toBe("A");
    expect(arrow.endConnection.elementId).toBe("B");
  });

  it("a group move is one undo step, and undo/redo restore groups exactly", async () => {
    const original = await s.elements();
    await groupAB();
    const grouped = await s.elements();
    await s.click({ x: 900, y: 600 });
    await s.drag({ x: 160, y: 140 }, { x: 260, y: 190 });
    const moved = await s.elements();
    expect(moved).not.toEqual(grouped);

    await s.press("Control+z");
    expect(await s.elements()).toEqual(grouped); // the whole drag was one step
    await s.press("Control+z");
    expect(await s.elements()).toEqual(original); // grouping was one step
    expect(records(await s.elements())).toHaveLength(0);

    await s.press("Control+Shift+z");
    expect(await s.elements()).toEqual(grouped);
    await s.press("Control+Shift+z");
    expect(await s.elements()).toEqual(moved);
  });

  it("Ctrl+Shift+G ungroups: the record goes, the shapes keep ids, order and selection", async () => {
    const before = await s.elements();
    await groupAB();
    await s.press("Control+Shift+g");
    await s.waitForIdle();
    const after = await s.elements();
    expect(records(after)).toHaveLength(0);
    expect(shapeIds(after)).toEqual(shapeIds(before));
    for (const id of ["A", "B", "ab"]) expect(byId(after, id).groupId).toBeUndefined();
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
    // and they are independent again
    await s.click({ x: 900, y: 600 });
    await s.click({ x: 160, y: 140 });
    expect(await s.selected()).toEqual(["A"]);
  });

  it("double-click enters the group so one member can be edited; the connector follows it; Escape leaves", async () => {
    const group = await groupAB();
    await s.click({ x: 900, y: 600 });
    await s.dblclick({ x: 160, y: 140 });
    expect(await s.selected()).toEqual(["A"]);
    expect(await s.page.evaluate(() => window.__editor.controller!.enteredGroupId)).toBe(group.id);

    await s.drag({ x: 160, y: 140 }, { x: 160, y: 240 });
    const els = await s.elements();
    expect(byId(els, "A").points[0]).toEqual({ x: 100, y: 200 });
    expect(byId(els, "B").points[0]).toEqual({ x: 400, y: 100 }); // the sibling stayed
    const arrow = byId(els, "ab");
    expect(arrow.startConnection.elementId).toBe("A");
    // (the router stores anchors as points, so they carry an id and side as well)
    expect(arrow.points[0]).toMatchObject({ x: 220, y: 240 }); // glued to A's new right-middle
    expect(arrow.points.at(-1)).toMatchObject({ x: 400, y: 140 }); // and still to B's left-middle
    expect(byId(els, "A").groupId).toBe(group.id); // moving a child does not ungroup it

    await s.press("Escape");
    expect(await s.page.evaluate(() => window.__editor.controller!.enteredGroupId)).toBeNull();
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
  });

  it("survives a save and reload", async () => {
    const group = await groupAB();
    await s.waitForIdle();
    const saved = await s.saved();
    expect(saved?.elements.filter((e: El) => e.type === "group")).toHaveLength(1);
    await s.reload();
    const els = await s.elements();
    expect(records(els).map((r) => r.id)).toEqual([group.id]);
    await s.click({ x: 160, y: 140 });
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
  });

  it("deleting a whole group removes its record; deleting one member keeps the group", async () => {
    await groupAB();
    await s.press("Delete");
    let els = await s.elements();
    expect(records(els)).toHaveLength(0);
    expect(shapeIds(els)).toEqual(["C", "D"]);

    await s.press("Control+z");
    await s.click({ x: 900, y: 600 });
    await s.dblclick({ x: 160, y: 140 }); // enter, select A
    await s.press("Delete");
    els = await s.elements();
    expect(records(els)).toHaveLength(1);
    expect(shapeIds(els)).not.toContain("A");
    expect(shapeIds(els)).not.toContain("ab"); // the connector attached to A went with it
    expect(byId(els, "B").groupId).toBe(records(els)[0].id);
  });

  it("lock: a locked group can be selected but not moved or deleted; unlock restores editing", async () => {
    const group = await groupAB();
    await s.press("Control+Shift+l");
    expect(byId(await s.elements(), group.id).locked).toBe(true);

    await s.click({ x: 900, y: 600 });
    await s.drag({ x: 160, y: 140 }, { x: 260, y: 190 });
    expect(byId(await s.elements(), "A").points[0]).toEqual({ x: 100, y: 100 });
    expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);

    await s.press("Delete");
    expect(shapeIds(await s.elements())).toContain("A");
    await s.press("ArrowRight");
    expect(byId(await s.elements(), "A").points[0]).toEqual({ x: 100, y: 100 });

    await s.press("Control+Shift+l");
    expect(byId(await s.elements(), group.id).locked).toBeUndefined();
    await s.click({ x: 900, y: 600 });
    await s.drag({ x: 160, y: 140 }, { x: 260, y: 190 });
    expect(byId(await s.elements(), "A").points[0]).toEqual({ x: 200, y: 150 });
  });

  it("duplicate copies the group structure with fresh ids; the original is untouched", async () => {
    const group = await groupAB();
    await s.press("Control+d");
    const els = await s.elements();
    expect(records(els)).toHaveLength(2);
    const copy = records(els).find((r) => r.id !== group.id)!;
    const members = els.filter((e) => e.groupId === copy.id);
    expect(members).toHaveLength(3);
    expect(members.every((m) => !["A", "B", "ab"].includes(m.id))).toBe(true);
    expect(els.filter((e) => e.groupId === group.id)).toHaveLength(3);
    // the copied connector joins the copied shapes, not the originals
    const copiedArrow = members.find((m) => m.type === "arrow")! as El;
    const copiedShapes = new Set(members.filter((m) => m.type !== "arrow").map((m) => m.id));
    expect(copiedShapes.has(copiedArrow.startConnection.elementId)).toBe(true);
    expect(copiedShapes.has(copiedArrow.endConnection.elementId)).toBe(true);
    expect(sorted(await s.selected())).toEqual(sorted(members.map((m) => m.id)));
  });

  it("bring to front moves a group's shapes together, above the others", async () => {
    await groupAB();
    await s.press("Control+Shift+]");
    const order = shapeIds(await s.elements());
    expect(order.slice(-3)).toEqual(["A", "B", "ab"]);
  });

  it("draws the group's frame, name tag and handles on the canvas (and nothing per member)", async () => {
    await groupAB();
    await s.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    // Group content spans x 100..520, y 100..180; the frame sits 8px outside it.
    const topLeft = await s.toScreen({ x: 100, y: 100 });
    // One canvas read (a second one makes Chrome warn about willReadFrequently).
    const [leftEdge, corner] = await s.page.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector("canvas")!;
        const rect = canvas.getBoundingClientRect();
        const d = window.devicePixelRatio || 1;
        const x0 = Math.round((x - 14 - rect.left) * d);
        const y0 = Math.round((y - 14 - rect.top) * d);
        const w = Math.round(24 * d);
        const h = Math.round(70 * d);
        const data = canvas.getContext("2d")!.getImageData(x0, y0, w, h).data;
        const blueIn = (px: number, py: number) => {
          for (let dy = -3; dy <= 3; dy += 1)
            for (let dx = -3; dx <= 3; dx += 1) {
              const i = (Math.round((py - rect.top) * d) - y0 + dy) * w * 4 + (Math.round((px - rect.left) * d) - x0 + dx) * 4;
              if (data[i + 2] > 200 && data[i] < 60 && data[i + 3] > 200) return true;
            }
          return false;
        };
        return [blueIn(x - 8, y + 40), blueIn(x - 8, y - 8)];
      },
      { x: topLeft.x, y: topLeft.y },
    );
    expect(leftEdge).toBe(true); // the frame's left edge
    expect(corner).toBe(true); // a corner handle
    await s.screenshot("group-selected");
  });

  describe("resizing from the frame", () => {
    // Content spans (100,100)-(520,180); the south-east handle sits 8px outside it.
    const SE = { x: 528, y: 188 };

    it("scales every member together, keeping their relative positions and the connector glued", async () => {
      await groupAB();
      await s.drag(SE, { x: SE.x + 210, y: SE.y + 80 }); // content becomes (100,100)-(730,260): x1.5, y2
      const els = await s.elements();
      const a = byId(els, "A");
      const b = byId(els, "B");
      expect(a.points).toEqual([{ x: 100, y: 100 }, { x: 280, y: 260 }]);
      expect(b.points).toEqual([{ x: 550, y: 100 }, { x: 730, y: 260 }]);
      const arrow = byId(els, "ab");
      expect(arrow.points[0]).toMatchObject({ x: 280, y: 180 }); // A's right-middle, as scaled
      expect(arrow.points.at(-1)).toMatchObject({ x: 550, y: 180 });
      expect(arrow.startConnection.elementId).toBe("A");
      expect(arrow.endConnection.elementId).toBe("B");
      expect(byId(els, "C").points).toEqual([{ x: 250, y: 320 }, { x: 370, y: 400 }]); // outsiders untouched
      expect(sorted(await s.selected())).toEqual(["A", "B", "ab"]);
    });

    it("is one undo step", async () => {
      await groupAB();
      const before = await s.elements();
      await s.drag(SE, { x: SE.x + 100, y: SE.y + 50 });
      expect(await s.elements()).not.toEqual(before);
      await s.press("Control+z");
      expect(await s.elements()).toEqual(before);
    });

    it("Shift keeps the width-to-height ratio from a corner", async () => {
      await groupAB();
      await s.page.keyboard.down("Shift");
      await s.drag(SE, { x: SE.x + 210, y: SE.y + 5 });
      await s.page.keyboard.up("Shift");
      const a = byId(await s.elements(), "A").points;
      const b = byId(await s.elements(), "B").points;
      const width = b[1].x - a[0].x;
      const height = b[1].y - a[0].y;
      expect(width / height).toBeCloseTo(420 / 80, 1);
      expect(width).toBeCloseTo(630, 0);
    });

    it("never collapses the group, whichever way the handle is dragged", async () => {
      await groupAB();
      await s.drag(SE, { x: 0, y: 0 }, { steps: 12 });
      const els = await s.elements();
      for (const id of ["A", "B"]) {
        const [p, q] = byId(els, id).points;
        expect(q.x - p.x).toBeGreaterThanOrEqual(3.9);
        expect(q.y - p.y).toBeGreaterThanOrEqual(3.9);
      }
      expect(byId(els, "A").points[0]).toEqual({ x: 100, y: 100 }); // the opposite corner stayed
    });

    it("a locked group has no frame handles to grab", async () => {
      await groupAB();
      await s.press("Control+Shift+l");
      const before = await s.elements();
      await s.drag(SE, { x: SE.x + 100, y: SE.y + 50 });
      expect(await s.elements()).toEqual(before);
    });

    it("works the same at another zoom", async () => {
      await groupAB();
      await s.page.evaluate(() => window.__editor.controller!.canvasViewport.handleZoomIn());
      await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { zoom } = await s.view();
      expect(zoom).toBeGreaterThan(1);
      const handle = { x: 520 + 8 / zoom, y: 180 + 8 / zoom };
      await s.drag(handle, { x: handle.x + 100 / zoom, y: handle.y }, { space: "world" });
      const a = byId(await s.elements(), "A").points;
      const b = byId(await s.elements(), "B").points;
      expect(b[1].x - a[0].x).toBeCloseTo(420 + 100 / zoom, 0);
    });
  });
});
