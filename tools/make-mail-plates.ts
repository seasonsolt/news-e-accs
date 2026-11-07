// The letters' mastheads (newsletter/mail.ts): a plate cut to 2:1 at twice the letter's width, the logo and
// wordmark set into it (mail clients drop web fonts), and its foot faded into the letter's black.
// Usage: node tools/make-mail-plates.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const ART = path.join(ROOT, "apps/web/public/media/art");
const BRAND = path.join(ROOT, "site/brand");
const WIDTH = 1200;
const HEIGHT = 560;
/** The letter's page colour (--deck). */
const DECK = "#120e0a";

const PLATES = [
  // The field and the slab, from the front page.
  { out: "mail-daily.jpg", source: "home-wheat-monolith-3840.webp", crop: { left: 1166, top: 1040, width: 2674, height: 1248 } },
  // The slab at the horizon, from the manifesto.
  { out: "mail-confirm.jpg", source: "manifesto-monolith-1600.webp", crop: { left: 0, top: 270, width: 1600, height: 747 } },
];

const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset=".76" stop-color="${DECK}" stop-opacity="0"/><stop offset="1" stop-color="${DECK}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`);
const logo = await sharp(readFileSync(path.join(BRAND, "logo.svg")), { density: 300 }).resize(60, 60).png().toBuffer();
const wordmark = await sharp(readFileSync(path.join(BRAND, "wordmark.svg")), { density: 300 }).resize({ height: 92 }).png().toBuffer();

for (const plate of PLATES) {
  await sharp(path.join(ART, plate.source))
    .extract(plate.crop)
    .resize(WIDTH, HEIGHT)
    .composite([{ input: fade }, { input: logo, left: 64, top: 48 }, { input: wordmark, left: 134, top: 32 }])
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(path.join(ART, plate.out));
}
