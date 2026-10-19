// The index chart as a 1200×630 PNG (/index/cost-of-intelligence.png) for other sites to embed and for
// the page's share card. The source line is drawn into the image, so it keeps its attribution when copied.
// Lines are an SVG image; the labels are text laid out by the share-card renderer (its fonts, no system ones).
import { createHash } from "node:crypto";
import { h, renderPng, SITE_HOST, type Node } from "@aihot/backend/media/og";
import type { CostOfIntelligence } from "../contracts.ts";

export const CHART_PATH = "/index/cost-of-intelligence.png";
/** Bumped when the drawing changes, so cached PNGs of the same data are drawn again. */
const TEMPLATE = 1;
const WIDTH = 1200;
const HEIGHT = 630;
/** The page's colours: hotter as the capability rises. */
const COLORS = ["#b08a4a", "#d9a441", "#ff8a3d", "#e0481a"];
const INK = "#2a1f16";
const MUTED = "#6f5d48";
const GRID = "#e6dccb";
const BG = "#fffdf8";

const COPY = {
  en: {
    title: "The cost of intelligence",
    subtitle: "Cheapest first-party API price at each GPQA Diamond score · USD per million tokens, 3:1 input to output, log scale",
    source: (asOf: string) => `Updated ${asOf} · CC BY 4.0 · GPQA Diamond scores: Epoch AI (CC BY 4.0)`,
  },
  zh: {
    title: "智能成本指数",
    subtitle: "各 GPQA Diamond 分数档最便宜的官方 API 价格 · 每百万 token 美元价，输入输出按 3:1 混合，对数刻度",
    source: (asOf: string) => `更新于 ${asOf} · CC BY 4.0 · GPQA Diamond 分数：Epoch AI（CC BY 4.0）`,
  },
} as const;

export type ChartLanguage = keyof typeof COPY;

function usd(price: number): string {
  if (price >= 100) return `$${price.toFixed(0)}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toPrecision(2)}`;
}

const pct = (threshold: number) => `${Math.round(threshold * 100)}%`;

function tree(data: CostOfIntelligence, lang: ChartLanguage): Node {
  const copy = COPY[lang];
  // The plot inside the image: room on the left for prices, on the right for the end labels.
  const L = 120, R = WIDTH - 170, T = 168, B = HEIGHT - 96;
  const points = data.tiers.flatMap((t) => t.points);
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const x0 = day(`${points.map((p) => p.date).sort()[0]!.slice(0, 4)}-01-01`);
  const x1 = day(data.asOf);
  const lo = Math.log10(Math.min(...points.map((p) => p.price))) - 0.2;
  const hi = Math.log10(Math.max(...points.map((p) => p.price))) + 0.2;
  const x = (date: string) => L + ((day(date) - x0) / (x1 - x0)) * (R - L);
  const y = (price: number) => T + ((hi - Math.log10(price)) / (hi - lo)) * (B - T);
  const decades = Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => 10 ** (Math.ceil(lo) + i));
  const years: string[] = [];
  for (let year = Number(data.asOf.slice(0, 4)); day(`${year}-01-01`) >= x0; year--) years.unshift(String(year));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`;
  for (const v of decades) svg += `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}" stroke-width="1.5"/>`;
  data.tiers.forEach((tier, i) => {
    if (!tier.points.length) return;
    const color = COLORS[i % COLORS.length]!;
    let d = "";
    tier.points.forEach((p, j) => (d += j === 0 ? `M${x(p.date)},${y(p.price)}` : `H${x(p.date)}V${y(p.price)}`));
    svg += `<path d="${d}H${R}" fill="none" stroke="${color}" stroke-width="4"/>`;
    for (const p of tier.points) svg += `<circle cx="${x(p.date)}" cy="${y(p.price)}" r="6" fill="${p.verified ? color : BG}" stroke="${color}" stroke-width="3"/>`;
  });
  svg += "</svg>";

  // End labels at their line's last price, pushed apart so none overlap.
  const labels = data.tiers.flatMap((tier, i) => (tier.points.length ? [{ tier, color: COLORS[i % COLORS.length]!, top: y(tier.points.at(-1)!.price) - 14 }] : [])).sort((a, b) => a.top - b.top);
  for (let j = 1; j < labels.length; j++) labels[j]!.top = Math.max(labels[j]!.top, labels[j - 1]!.top + 30);
  const overflow = labels.length ? labels.at(-1)!.top - (B - 10) : 0;
  if (overflow > 0) for (const label of labels) label.top -= overflow;
  const text = (style: Record<string, unknown>, children: string) => h("div", { display: "flex", position: "absolute", ...style }, children);

  return h("div", { width: WIDTH, height: HEIGHT, display: "flex", position: "relative", fontFamily: "Noto Sans SC", color: INK, backgroundColor: BG }, [
    h("img", { position: "absolute", left: 0, top: 0 }, undefined, { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, width: WIDTH, height: HEIGHT }),
    text({ left: 56, top: 40, fontSize: 40, fontWeight: 700 }, copy.title),
    text({ left: 56, top: 100, width: WIDTH - 112, fontSize: 19, color: MUTED }, copy.subtitle),
    ...decades.map((v) => text({ left: 0, top: y(v) - 13, width: L - 14, justifyContent: "flex-end", fontSize: 19, color: MUTED }, usd(v))),
    ...years.map((year) => text({ left: x(`${year}-01-01`) - 40, top: B + 12, width: 80, justifyContent: "center", fontSize: 19, color: MUTED }, year)),
    ...labels.map(({ tier, color, top }) => text({ left: R + 12, top, fontSize: 20, fontWeight: 700, color }, `≥${pct(tier.threshold)} ${usd(tier.points.at(-1)!.price)}`)),
    text({ left: 56, top: HEIGHT - 44, fontSize: 19, fontWeight: 700, color: INK }, `${SITE_HOST}/index/cost-of-intelligence`),
    text({ right: 56, top: HEIGHT - 44, fontSize: 17, color: MUTED }, copy.source(data.asOf)),
  ]);
}

/** The chart's PNG, drawn once per data, language and template (the renderer's disk cache). */
export async function chartPng(data: CostOfIntelligence, lang: ChartLanguage): Promise<{ png: Buffer; etag: string }> {
  if (!data.tiers.some((t) => t.points.length)) throw new Error("cost of intelligence: no prices to draw");
  const hash = createHash("sha256").update(JSON.stringify([TEMPLATE, lang, data.asOf, data.tiers])).digest("hex").slice(0, 20);
  return { png: await renderPng(`coi-chart-${hash}`, { width: WIDTH, height: HEIGHT }, async () => tree(data, lang)), etag: `"coi-chart-${hash}"` };
}
