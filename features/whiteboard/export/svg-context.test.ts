import { describe, expect, it } from "vitest";
import { SvgContext, escapeXml } from "./svg-context";

const measurer = {
  font: "",
  measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
};
const make = () => new SvgContext(measurer);

describe("SvgContext drawing", () => {
  it("records a stroked path with its style and measures the ink including half the line width", () => {
    const ctx = make();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(10, 20);
    ctx.lineTo(110, 20);
    ctx.stroke();
    const { body } = ctx.markup();
    expect(body).toContain('d="M10 20 L110 20"');
    expect(body).toContain('stroke="#ff0000"');
    expect(body).toContain('stroke-width="4"');
    expect(ctx.inkBounds()).toEqual({ minX: 8, minY: 18, maxX: 112, maxY: 22 });
  });

  it("applies the transform to bounds and emits it on the element", () => {
    const ctx = make();
    ctx.translate(100, 50);
    ctx.scale(2, 2);
    ctx.beginPath();
    ctx.rect(0, 0, 10, 10);
    ctx.fill();
    expect(ctx.markup().body).toContain('transform="matrix(2 0 0 2 100 50)"');
    expect(ctx.inkBounds()).toEqual({ minX: 100, minY: 50, maxX: 120, maxY: 70 });
  });

  it("draws arcs as SVG arcs and a full circle as two", () => {
    const ctx = make();
    ctx.beginPath();
    ctx.arc(50, 50, 10, 0, Math.PI * 2);
    ctx.fill();
    const d = /d="([^"]+)"/.exec(ctx.markup().body)![1];
    expect(d.match(/A/g)).toHaveLength(2);
    expect(ctx.inkBounds()).toEqual({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
  });

  it("wraps clipped drawing in a clipPath group and closes it on restore", () => {
    const ctx = make();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 50, 50);
    ctx.clip();
    ctx.fillText("hi", 5, 20);
    ctx.restore();
    ctx.fillText("out", 5, 40);
    const { defs, body } = ctx.markup();
    expect(defs).toMatch(/<clipPath id="clip1">/);
    expect(body).toMatch(/^<g clip-path="url\(#clip1\)"><text[^>]*>hi<\/text><\/g><text[^>]*>out<\/text>$/);
  });

  it("closes clip groups that are still open when the markup is read", () => {
    const ctx = make();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 5, 5);
    ctx.clip();
    expect(ctx.markup().body.match(/<g /g)).toHaveLength(1);
    expect(ctx.markup().body.match(/<\/g>/g)).toHaveLength(1);
  });

  it("anchors text by alignment and baseline and measures it", () => {
    const ctx = make();
    ctx.font = "italic 700 20px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("abcd", 100, 50);
    const { body } = ctx.markup();
    expect(body).toContain('text-anchor="middle"');
    // middle baseline is baked into y (no dominant-baseline): 50 + (0.8*20 - 0.2*20)/2 = 56
    expect(body).toContain('y="56"');
    expect(body).not.toContain("dominant-baseline");
    expect(body).toContain('font-weight="700"');
    expect(body).toContain('font-style="italic"');
    expect(body).toContain('font-size="20"');
    expect(ctx.inkBounds()).toEqual({ minX: 80, minY: 45, maxX: 120, maxY: 55 });
  });

  it("uses fill-opacity for globalAlpha and dashes for setLineDash", () => {
    const ctx = make();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1, 1);
    ctx.stroke();
    expect(ctx.markup().body).toContain('stroke-opacity="0.5"');
    expect(ctx.markup().body).toContain('stroke-dasharray="6 4"');
  });

  it("has no ink when nothing was drawn", () => {
    expect(make().inkBounds()).toBeNull();
  });

  it("refuses Path2D painting rather than dropping it silently", () => {
    const ctx = make();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    expect(() => ctx.stroke({} as never)).toThrow(/Path2D/);
  });

  it("takes icon glyph path data directly", () => {
    const ctx = make();
    ctx.translate(10, 10);
    ctx.strokePathData("M0 0 L24 24");
    ctx.strokePathData("m5 5 l2 2");
    // Separate elements: the second path's relative m starts at the origin, not at the first path's end.
    expect(ctx.markup().body.match(/<path /g)).toHaveLength(2);
    expect(ctx.markup().body).toContain('d="M0 0 L24 24"');
    expect(ctx.markup().body).toContain('d="m5 5 l2 2"');
    expect(ctx.inkBounds()).not.toBeNull();
  });
});

describe("SvgContext sanitising", () => {
  it("ignores colours that are not plain colours, like the canvas does", () => {
    const ctx = make();
    ctx.fillStyle = "#123456";
    for (const bad of ['red" onload="alert(1)', "url(https://evil.example/x.svg#a)", "javascript:alert(1)", "#12\"><script>", { evil: true }]) {
      ctx.fillStyle = bad;
    }
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    ctx.fill();
    expect(ctx.markup().body).toContain('fill="#123456"');
    expect(ctx.markup().body).not.toMatch(/onload|javascript|evil|script|url\(/);
  });

  it("escapes label text and drops characters XML cannot hold", () => {
    const ctx = make();
    ctx.fillText('<script>alert("x")</script> & ok\u0000\u0007 \uD800 😀 日本語', 0, 10);
    const { body } = ctx.markup();
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; ok  😀 日本語");
    expect(body).not.toMatch(/[\u0000-\u0008\uD800]/);
  });

  it("does not let a hostile font-family break out of its attribute", () => {
    const ctx = make();
    ctx.font = '12px x" onload="alert(1)';
    ctx.fillText("a", 0, 0);
    expect(ctx.markup().body).toContain('font-family="sans-serif"');
    expect(ctx.markup().body).not.toContain("onload");
  });

  it("rejects path data with anything but path commands and numbers", () => {
    expect(() => make().strokePathData('M0 0"/><script>')).toThrow(/unsafe/);
  });

  it("escapeXml covers the five XML specials", () => {
    expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;'");
  });

  it("never writes external references", () => {
    const ctx = make();
    ctx.beginPath();
    ctx.roundRect(0, 0, 40, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillText("x", 1, 1);
    expect(ctx.markup().body + ctx.markup().defs).not.toMatch(/href|<image|<script|<foreignObject|https?:/i);
  });
});
