// 1200×630 share images. satori lays out text with Noto Sans SC (assets/og-fonts) and emits glyphs
// as paths, so rasterising with sharp needs no system fonts. Output is cached on disk by content.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mediaCapacity } from "./capacity.ts";
import { config, REPO_ROOT } from "../config.ts";
import { SITE } from "@aihot/site";

import { ogEtag, type OgCard } from "./cards.ts";
export { ogEtag, OG_TEMPLATE_VERSION, type OgCard } from "./cards.ts";
const WIDTH = 1200;
const HEIGHT = 630;
const CACHE_DIR = path.join(config.dataDir, "ogcache");

let fontsPromise: Promise<Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }>> | null = null;

import { FALLBACK_FONTS, FONT_DIR } from "./fonts.ts";
export { fallbackFontFiles, FALLBACK_FONTS } from "./fonts.ts";


function fonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(FONT_DIR, "noto-sans-sc-400.ttf")),
    readFile(path.join(FONT_DIR, "noto-sans-sc-700.ttf")),
    ...FALLBACK_FONTS.map((f) => readFile(path.join(FONT_DIR, f))),
  ]).then(([regular, bold, ...more]) => [
    { name: "Noto Sans SC", data: regular!, weight: 400, style: "normal" },
    { name: "Noto Sans SC", data: bold!, weight: 700, style: "normal" },
    ...more.map((data, i) => ({ name: FALLBACK_FONTS[i]!.replace(/-(400|700)\.ttf$/, ""), data, weight: (FALLBACK_FONTS[i]!.endsWith("-700.ttf") ? 700 : 400) as 400 | 700, style: "normal" as const })),
  ]);
  return fontsPromise;
}

export type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
export const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...extra } });

/** The site's host as shown on cards. */
export const SITE_HOST = new URL(config.siteUrl).host;

/** Width over height of an SVG: its viewBox, else its width and height. */
function aspect(svg: string): number {
  const box = /<svg[^>]*\sviewBox="([^"]+)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return box[2]! / box[3]!;
  const width = Number.parseFloat(/<svg[^>]*\swidth="([^"]+)"/.exec(svg)?.[1] ?? "");
  const height = Number.parseFloat(/<svg[^>]*\sheight="([^"]+)"/.exec(svg)?.[1] ?? "");
  return width > 0 && height > 0 ? width / height : 1;
}

const wordmarks = new Map<string, Promise<{ src: string; aspect: number } | null>>();

/**
 * A wordmark of the site (site/brand/<file>, e.g. wordmark-dark.svg for the dark cards) as an
 * image of the given height; null when the pack has none, and the card sets the name in type instead.
 */
export async function brandMark(file: string, height: number): Promise<Node | null> {
  let mark = wordmarks.get(file);
  if (!mark) {
    mark = readFile(path.join(REPO_ROOT, "site/brand", file), "utf8").then(
      (svg) => ({ src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, aspect: aspect(svg) }),
      () => null,
    );
    wordmarks.set(file, mark);
  }
  const found = await mark;
  return found && h("img", { height }, undefined, { src: found.src, height, width: Math.round(height * found.aspect) });
}

/** The site name as a wordmark: bold, with the accent dot the cards use. */
export function nameMark(size: number, color: string, dot: string): Node {
  return h("div", { display: "flex", alignItems: "center" }, [
    h("div", { width: size * 0.36, height: size * 0.36, borderRadius: 999, backgroundColor: dot, marginRight: size * 0.28 }),
    h("div", { display: "flex", fontSize: size, fontWeight: 700, color, letterSpacing: 0.5 }, SITE.name),
  ]);
}

// "teal" is the accent key the cards are asked for by name; in this palette it is brass.
const ACCENTS = { teal: "#e0ab4a", hot: "#ff8a5f", amber: "#e8c070" } as const;

export function clamp(text: string, max: number) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

async function tree(card: OgCard): Promise<Node> {
  const accent = ACCENTS[card.accent ?? "teal"];
  const title = clamp(card.title, 64);
  const titleSize = [...title].length > 40 ? 50 : [...title].length > 24 ? 58 : 66;
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      padding: "64px 72px",
      fontFamily: "Noto Sans SC",
      color: "#f1e6d0",
      backgroundColor: "#120d09",
      backgroundImage: "radial-gradient(circle at 88% 8%, rgba(224,171,74,0.28), rgba(18,13,9,0) 46%), radial-gradient(circle at 0% 100%, rgba(149,84,24,0.38), rgba(18,13,9,0) 50%)",
    },
    [
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
        (await brandMark("wordmark-dark.svg", 40)) ?? nameMark(34, "#f1e6d0", "#e0ab4a"),
        h("div", { display: "flex", fontSize: 24, color: "#a8977b" }, SITE_HOST),
      ]),
      h("div", { display: "flex", marginTop: 56, alignItems: "center" }, [
        h("div", { width: 10, height: 10, borderRadius: 999, backgroundColor: accent, marginRight: 14 }),
        h("div", { display: "flex", fontSize: 28, fontWeight: 700, color: accent, letterSpacing: 1 }, clamp(card.kicker, 30)),
      ]),
      h("div", { display: "flex", flex: 1, marginTop: 22, gap: 40 }, [
        h("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          h("div", { display: "flex", fontSize: titleSize, fontWeight: 700, lineHeight: 1.25, color: "#ffffff" }, title),
          // Long titles take three lines; the summary then gets one line so nothing reaches the footer.
          card.subtitle ? h("div", { display: "flex", marginTop: 22, fontSize: 28, lineHeight: 1.5, color: "#cbbd9f" }, clamp(card.subtitle, [...title].length > 40 ? 26 : [...title].length > 24 ? 50 : 78)) : null,
        ].filter(Boolean)),
        card.badge
          ? h("div", { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 170, height: 170, borderRadius: 999, border: `6px solid ${accent}` }, [
              h("div", { display: "flex", fontSize: 58, fontWeight: 700, color: "#ffffff" }, card.badge.value),
              h("div", { display: "flex", fontSize: 22, color: "#a8977b" }, card.badge.label),
            ])
          : null,
      ].filter(Boolean)),
      card.meta ? h("div", { display: "flex", fontSize: 24, color: "#a8977b", borderTop: "1px solid rgba(241,230,208,0.12)", paddingTop: 22 }, clamp(card.meta, 70)) : null,
    ].filter(Boolean),
  );
}

/**
 * Palette PNG at full quality with dithering: the flat card and its soft glow look the same as a
 * truecolour PNG at about half the bytes (117 → 62 KB for a typical article card). Share crawlers
 * keep getting PNG.
 */
const OG_PNG = { compressionLevel: 9, palette: true, quality: 100, dither: 1, effort: 10 } as const;

const inflight = new Map<string, Promise<Buffer>>();

/**
 * PNG bytes of a share image, from the disk cache (`name`.png) when it was rendered before. Concurrent
 * requests share one render; the file is written aside and moved into place, never read half-written.
 */
export function renderPng(name: string, size: { width: number; height: number }, tree: () => Promise<Node>): Promise<Buffer> {
  let job = inflight.get(name);
  if (!job) {
    job = render(path.join(CACHE_DIR, `${name}.png`), size, tree).finally(() => inflight.delete(name));
    inflight.set(name, job);
  }
  return job;
}

async function render(file: string, size: { width: number; height: number }, tree: () => Promise<Node>): Promise<Buffer> {
  try {
    return await readFile(file);
  } catch {
    // not cached yet
  }
  return mediaCapacity.run(async () => {
    const [{ default: satori }, { default: sharp }] = await Promise.all([import("satori"), import("sharp")]);
    const svg = await satori(await tree() as never, { ...size, fonts: await fonts() });
    const png = await sharp(Buffer.from(svg)).png(OG_PNG).toBuffer();
    await mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, png);
    await rename(tmp, file);
    return png;
  });
}

/** PNG bytes for a card, from the disk cache when this exact card was rendered before. */
export async function renderOg(card: OgCard): Promise<{ png: Buffer; etag: string }> {
  const etag = ogEtag(card);
  return { png: await renderPng(etag, { width: WIDTH, height: HEIGHT }, () => tree(card)), etag };
}
