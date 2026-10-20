// Writes every brand asset from the geometry in lib/brand.ts: SVGs into public/brand, and the favicon,
// apple-touch icon and manifest icons (PNG, ICO) via sharp. Run: node scripts/generate-brand-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import {
  BRAND_COLORS as C,
  LOCKUP_VIEWBOX,
  MARK_BOUNDS,
  MARK_PATH,
  MARK_VIEWBOX,
  WORDMARK_PATH,
} from "../lib/brand.ts";

mkdirSync("public/brand", { recursive: true });
const svg = (viewBox, body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"${extra}>${body}</svg>\n`;
const write = (path, data) => writeFileSync(path, data);

// Mark and lockup SVGs, for a light ground and a dark ground.
const grounds = { light: { ink: C.ink, text: C.text }, dark: { ink: C.inkOnGraphite, text: C.textOnGraphite } };
for (const [name, { ink, text }] of Object.entries(grounds)) {
  write(`public/brand/mark-${name}.svg`, svg(MARK_VIEWBOX, `<path fill="${ink}" d="${MARK_PATH}"/>`, ` role="img" aria-label="Draw Anything"`));
  write(
    `public/brand/logo-${name}.svg`,
    svg(LOCKUP_VIEWBOX, `<path fill="${ink}" d="${MARK_PATH}"/><path fill="${text}" d="${WORDMARK_PATH}"/>`, ` role="img" aria-label="Draw Anything"`),
  );
}

// Browser tab icon: transparent, follows the system colour scheme.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"><style>path{fill:${C.ink}}@media(prefers-color-scheme:dark){path{fill:${C.inkOnGraphite}}}</style><path d="${MARK_PATH}"/></svg>\n`;
write("public/brand/favicon.svg", favicon);
write("app/icon.svg", favicon);

// Tile icons: paper mark on an ink tile, centred on the mark's own bounds. `frac` is the mark's height as a share of the tile.
const { x, y, width, height } = MARK_BOUNDS;
function tile(size, { frac, radius = 0 }) {
  const s = (frac * size) / height;
  const tx = size / 2 - (x + width / 2) * s;
  const ty = size / 2 - (y + height / 2) * s;
  const r = radius * size;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${C.ink}"/><path fill="${C.paper}" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})" d="${MARK_PATH}"/></svg>`,
  );
}
const png = (size, opts) => sharp(tile(size, opts), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

write("public/brand/icon-192.png", await png(192, { frac: 0.6, radius: 0.22 }));
write("public/brand/icon-512.png", await png(512, { frac: 0.6, radius: 0.22 }));
// Maskable: full bleed, mark inside the 80% safe zone.
write("public/brand/icon-maskable-512.png", await png(512, { frac: 0.5 }));
// iOS rounds the corners itself, so the tile is square.
write("app/apple-icon.png", await png(180, { frac: 0.6 }));

// favicon.ico: PNG-compressed 16, 32 and 48 px entries. Small sizes fill more of the tile so the handles stay visible.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(s, { frac: s === 16 ? 0.78 : 0.72, radius: 0.2 })));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const o = 6 + i * 16;
  head[o] = s;
  head[o + 1] = s;
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(images[i].length, o + 8);
  head.writeUInt32LE(offset, o + 12);
  offset += images[i].length;
});
write("app/favicon.ico", Buffer.concat([head, ...images]));
console.log("brand assets written");
