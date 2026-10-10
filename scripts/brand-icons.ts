// Renders the raster site icons (site/brand/icon.png, icon-192.png, apple-icon.png, favicon.ico) from
// site/brand/logo.svg, so the five files always show the same mark:  node scripts/brand-icons.ts
// favicon.ico holds 16, 32 and 48 px pictures drawn from a heavier cut of the mark, because the thin
// accretion disc of the full one is under a pixel wide at 16 px.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.join(import.meta.dirname, "..", "site", "brand");
const logo = readFileSync(path.join(dir, "logo.svg"), "utf8");
const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: (72 * size) / 512 * 2 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Same colours as logo.svg: a thicker ring and disc, and the mark filling more of the square.
const heavy = logo
  .replace('r="128" fill="#050403" stroke="url(#ring)" stroke-width="54"', 'r="148" fill="#050403" stroke="url(#ring)" stroke-width="64"')
  .replaceAll('d="M112 400 L400 112"', 'd="M86 426 L426 86"')
  .replace('stroke="#15110d" stroke-width="52"', 'stroke="#15110d" stroke-width="72"')
  .replace('stroke="url(#disc)" stroke-width="26"', 'stroke="url(#disc)" stroke-width="40"');
if (heavy === logo) throw new Error("logo.svg no longer matches the heavy cut's patterns");

for (const [name, size] of [["icon.png", 512], ["icon-192.png", 192], ["apple-icon.png", 180]] as const) {
  writeFileSync(path.join(dir, name), await png(logo, size));
}

// A Windows icon is a small directory followed by the pictures; PNG pictures are allowed.
const sizes = [16, 32, 48];
const pictures = await Promise.all(sizes.map((s) => png(heavy, s)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const at = 6 + 16 * i;
  head.writeUInt8(s, at);
  head.writeUInt8(s, at + 1);
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(pictures[i]!.length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += pictures[i]!.length;
});
writeFileSync(path.join(dir, "favicon.ico"), Buffer.concat([head, ...pictures]));
console.log("icon.png, icon-192.png, apple-icon.png, favicon.ico written from logo.svg");
