// The cost-of-intelligence index (docs/plans/cost-of-intelligence.md): one stepped line per GPQA
// threshold, drawn on the server so crawlers read the numbers the chart shows. Laid out like the
// leaderboard's model pages: the deck's figure, a row of stats, then sections under an eyebrow.
import { SITE } from "@aihot/site";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLoaderData } from "react-router";
import type { CoiPoint, CoiTier, CostOfIntelligence } from "@aihot/indices/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { localeFromMatches, Text, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { useEntrance } from "@aihot/web/lib/hydration";
import { useMotionAllowed } from "@aihot/web/features/motion/preferences";
import { CodeBlock } from "@aihot/web/features/agent/CodeBlock";
import { Deck } from "@aihot/web/components/shell/Deck";
import { Badge } from "@aihot/web/components/ui/Badge";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { IconDownload, IconExternal } from "@aihot/web/components/icons";

const PATH = "/index/cost-of-intelligence";
const CSV = "/api/site/indices/cost-of-intelligence.csv";
/** The chart as an image (backend/chart.ts): English unless ?lang=zh. */
const CHART = "/index/cost-of-intelligence.png";
const chartPath = (locale: string) => (locale === "zh" ? `${CHART}?lang=zh` : CHART);
/** Hotter as the capability rises; the same as the image's (backend/chart.ts). */
const COLORS = ["#b08a4a", "#d9a441", "#ff8a3d", "#e0481a"];
const color = (i: number) => COLORS[i % COLORS.length]!;

export async function loader({ request }: { request: Request }) {
  return loadOr404<CostOfIntelligence>("/api/site/indices/cost-of-intelligence", { request, signal: request.signal });
}

export function meta({ matches, data }: { matches?: Array<{ id: string; data?: unknown }>; data?: CostOfIntelligence } = {}) {
  const locale = localeFromMatches(matches ?? []);
  const tx = (message: string, ...values: unknown[]) => translate(locale, message, ...values);
  const title = tx("The cost of intelligence");
  const description = tx("How fast the price of a fixed level of AI capability falls: the cheapest first-party API price for models at each GPQA Diamond score, since GPT-4.");
  return pageMeta({
    title,
    description,
    path: PATH,
    image: chartPath(locale),
    jsonLd: [
      breadcrumbLd([{ name: title, path: PATH }]),
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: title,
        description,
        url: `${siteUrl()}${PATH}`,
        creator: { "@type": "Organization", name: SITE.name, url: siteUrl() },
        license: "https://creativecommons.org/licenses/by/4.0/",
        ...(data ? { dateModified: data.asOf, temporalCoverage: `${data.tiers.flatMap((t) => t.points)[0]?.date ?? data.asOf}/${data.asOf}` } : {}),
        variableMeasured: ["Blended USD per million tokens (3:1 input:output)", "GPQA Diamond accuracy"],
        // Google checks a nested Dataset like a top-level one: it needs its own description, creator and license.
        isBasedOn: {
          "@type": "Dataset",
          name: "Epoch AI GPQA Diamond benchmark",
          description: "Epoch AI's results for AI models on GPQA Diamond, 198 graduate-level multiple-choice questions in biology, chemistry and physics.",
          url: "https://epoch.ai/benchmarks/gpqa-diamond",
          creator: { "@type": "Organization", name: "Epoch AI", url: "https://epoch.ai" },
          license: "https://creativecommons.org/licenses/by/4.0/",
        },
        distribution: { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${siteUrl()}${CSV}` },
      },
    ],
  }, locale);
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" };
}

function usd(price: number): string {
  if (price >= 100) return `$${price.toFixed(0)}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toPrecision(2)}`;
}

const pct = (threshold: number) => `${Math.round(threshold * 100)}%`;
const ratioText = (ratio: number) => (ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1));

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="mono text-[11px] font-semibold tracking-[0.14em] text-accent">{children}</span>;
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: ReactNode }) {
  return (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-[20px] font-bold leading-[1.5] text-ink">{title}</h2>
      {sub && <p className="mt-1 text-[13px] text-ink-3">{sub}</p>}
    </>
  );
}

function Swatch({ i, hollow = false }: { i: number; hollow?: boolean }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full border-2" style={{ borderColor: color(i), background: hollow ? "var(--bg)" : color(i) }} aria-hidden="true" />;
}

/** The tier with the longest record and a fall to show, for the deck's figure. */
function leadTier(tiers: CoiTier[]): CoiTier | undefined {
  return tiers.find((t) => t.ratio);
}

function TierStat({ tier, i }: { tier: CoiTier; i: number }) {
  const tx = useTranslate();
  const first = tier.points[0];
  const now = tier.points.at(-1);
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-ink-2">
        <Swatch i={i} />
        {tx("GPQA ≥ {0}", pct(tier.threshold))}
      </span>
      <span className="mt-0.5 truncate text-[11px] text-ink-4">{tx("{0} level", tier.reference)}</span>
      <span className="mono mt-2 text-[28px] font-medium leading-none tracking-[-0.03em] text-ink">{tier.ratio ? `${ratioText(tier.ratio)}×` : "—"}</span>
      <span className="mt-1 text-[12px] text-ink-3">{tier.ratio ? tx("cheaper than when first reached") : tx("one price so far")}</span>
      {first && now && (
        <span className="mt-2.5 space-y-0.5 text-[12px] text-ink-4">
          <span className="block text-ink-3">{tier.halvingMonths ? tx("Halves every {0} months", tier.halvingMonths.toFixed(1)) : tx("No halving trend yet")}</span>
          <span className="num block">{`${usd(first.price)} → ${usd(now.price)}`}</span>
          <span className="block truncate">{tx("Now {0}", now.model.name)}</span>
        </span>
      )}
    </div>
  );
}

const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
/** $0.1, $0.3, $1, $3: one significant figure. */
const tickUsd = (v: number) => `$${Number(v.toPrecision(1))}`;

/** Where a tier's line stands on a date: its last step on or before it. */
function stepAt(tier: CoiTier, date: string): CoiPoint | null {
  let found: CoiPoint | null = null;
  for (const p of tier.points) if (p.date <= date) found = p;
  return found;
}

/** A matchstick's length, the gap between two laid end to end, and the shortest broken stub worth drawing. */
const MATCH = 52;
const GAP = 2.5;
const STUB = 8;
const WOOD = "#dcb87e";
const WOOD_EDGE = "#a47c43";

/** A straight run of a stepped line, in pixels: from (x, y), `len` long, at `angle` degrees (0 right, 90 down, −90 up). */
type Run = { x: number; y: number; len: number; angle: number };

function runsThrough(vertices: Array<[number, number]>): Run[] {
  const out: Run[] = [];
  for (let j = 1; j < vertices.length; j++) {
    const [ax, ay] = vertices[j - 1]!;
    const [bx, by] = vertices[j]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len >= 1) out.push({ x: ax, y: ay, len, angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI });
  }
  return out;
}

/**
 * Matches laid end to end along a run, heads forward. Whole matches stretch by a few pixels to close a
 * small remainder; a larger one becomes a headless broken stub at the start; a run too short for a
 * match gets one short match (or a stub).
 */
function sticksAlong(len: number): Array<{ at: number; len: number; head: boolean }> {
  const n = Math.floor((len + GAP) / (MATCH + GAP));
  if (n === 0) return len >= 20 ? [{ at: 0, len, head: true }] : len >= STUB / 2 ? [{ at: 0, len, head: false }] : [];
  const rest = len - (n * MATCH + (n - 1) * GAP);
  const out: Array<{ at: number; len: number; head: boolean }> = [];
  let at = 0;
  let size = MATCH;
  if (rest >= STUB + GAP) {
    out.push({ at: 0, len: rest - GAP, head: false });
    at = rest;
  } else size = MATCH + rest / n;
  for (let k = 0; k < n; k++, at += size + GAP) out.push({ at, len: size, head: true });
  return out;
}

function Match({ at, len, head, tint }: { at: number; len: number; head: boolean; tint: string }) {
  return (
    <>
      <rect x={at} y={-2.4} width={Math.max(1, len - (head ? 5 : 0))} height={4.8} rx={1.4} fill={WOOD} stroke={WOOD_EDGE} strokeWidth={0.7} />
      <rect x={at + 1} y={-1.6} width={Math.max(0, len - (head ? 8 : 2))} height={1} rx={0.5} fill="#fff" opacity={0.3} />
      {head && (
        <>
          <ellipse cx={at + len - 5.6} cy={0} rx={6.2} ry={4.5} fill={tint} stroke="rgb(0 0 0 / .22)" strokeWidth={0.7} />
          <ellipse cx={at + len - 7.2} cy={-1.5} rx={2.3} ry={1.2} fill="#fff" opacity={0.45} />
        </>
      )}
    </>
  );
}

/** A flame on a match head, rising from (0, 0); it flickers unless the reader asked for less motion. */
function Flame({ id, flicker }: { id: string; flicker: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-glow`}><stop offset="0" stopColor="#ff9a3c" stopOpacity="0.55" /><stop offset="1" stopColor="#ff9a3c" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-fire`} x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="#ff4d12" />
          <stop offset="0.45" stopColor="#ff9a2e" />
          <stop offset="1" stopColor="#ffe28a" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <circle cx={0} cy={-12} r={22} fill={`url(#${id}-glow)`} />
      <g>
        {flicker && <animateTransform attributeName="transform" type="scale" values="1 1;0.9 1.08;1.05 0.94;0.96 1.04;1 1" dur="1.1s" repeatCount="indefinite" />}
        <path d="M0,-2 C-7.5,-8 -6.5,-17 0,-29 C6.5,-17 7.5,-8 0,-2Z" fill={`url(#${id}-fire)`} />
        <path d="M0,-4 C-3.4,-8 -3.1,-13 0,-18 C3.1,-13 3.4,-8 0,-4Z" fill="#fff6cf" opacity={0.85} />
      </g>
    </g>
  );
}

/**
 * Log-scale stepped lines laid in matchsticks, at the plot's real size in pixels (so a match keeps its
 * shape); every label is page text every label is page text (as in the story heat chart),
 * so the axes stay legible on a phone. Pointing at the chart reads every line on that date.
 */
function Chart({ data, focus, onFocus }: { data: CostOfIntelligence; focus: string | null; onFocus: (key: string | null) => void }) {
  const tx = useTranslate();
  const entrance = useEntrance();
  const wash = `coi${useId().replace(/[^\w-]/g, "")}`;
  const flicker = useMotionAllowed();
  const [active, setActive] = useState<number | null>(null);
  // The plot's size in pixels: a guess for the server's HTML (the SVG stretches to it), then measured.
  const plot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 960, h: 380 });
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    const points = data.tiers.flatMap((t) => t.points);
    if (points.length === 0) return null;
    const dates = [...new Set(points.map((p) => p.date))].sort();
    const t0 = day(`${dates[0]!.slice(0, 4)}-01-01`);
    const t1 = day(data.asOf);
    // A sixth of a decade of air above and below the lines.
    const lo = Math.log10(Math.min(...points.map((p) => p.price))) - 0.18;
    const hi = Math.log10(Math.max(...points.map((p) => p.price))) + 0.18;
    // Both axes in percent of the plot box: the SVG stretches to it, the labels and dots sit on it.
    const x = (date: string) => ((day(date) - t0) / (t1 - t0)) * 100;
    const y = (price: number) => ((hi - Math.log10(price)) / (hi - lo)) * 100;
    const ticks: Array<{ v: number; major: boolean }> = [];
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
      for (const m of [1, 3]) {
        const v = m * 10 ** e;
        if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push({ v, major: m === 1 });
      }
    }
    const years: string[] = [];
    for (let year = Number(data.asOf.slice(0, 4)); day(`${year}-01-01`) >= t0; year--) years.unshift(String(year));
    // Each line's corners in percent of the plot: right to the next step's date, then down (or up) to its price.
    const vertices = data.tiers.map((tier) => {
      const out: Array<[number, number]> = [];
      tier.points.forEach((p, j) => {
        if (j > 0) out.push([x(p.date), out.at(-1)![1]]);
        out.push([x(p.date), y(p.price)]);
      });
      if (out.length) out.push([100, out.at(-1)![1]]);
      return out;
    });
    // End labels at their line's last price, pushed apart (in percent of the plot's height) so none overlap.
    const ends = data.tiers.flatMap((tier, i) => (tier.points.length ? [{ tier, i, top: y(tier.points.at(-1)!.price) }] : [])).sort((a, b) => a.top - b.top);
    for (let j = 1; j < ends.length; j++) ends[j]!.top = Math.max(ends[j]!.top, ends[j - 1]!.top + 8);
    const overflow = ends.length ? ends.at(-1)!.top - 100 : 0;
    if (overflow > 0) for (const end of ends) end.top -= overflow;
    return { dates, x, y, ticks, years, vertices, ends };
  }, [data]);
  if (!geometry) return <p className="rounded-tile bg-bg-sunk px-4 py-8 text-center text-[13px] text-ink-4"><Text value="No prices yet." /></p>;
  const { dates, x, y, ticks, years, vertices, ends } = geometry;
  const { w, h } = size;
  const px = (corners: Array<[number, number]>) => corners.map(([cx, cy]) => [(cx * w) / 100, (cy * h) / 100] as [number, number]);
  const date = active !== null ? dates[active]! : null;
  const dim = (key: string) => (focus && focus !== key ? 0.22 : 1);
  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * 100;
    let best = 0;
    dates.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(dates[best]!) - px)) best = i;
    });
    setActive(best);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={tx("Highlight a threshold")}>
        {data.tiers.map((tier, i) => (
          <button
            key={tier.key}
            type="button"
            aria-pressed={focus === tier.key}
            onClick={() => onFocus(focus === tier.key ? null : tier.key)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${focus === tier.key ? "border-accent/45 text-ink" : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink"}`}
          >
            <Swatch i={i} />
            {tx("GPQA ≥ {0}", pct(tier.threshold))}
            <span className="text-[11.5px] text-ink-4 max-sm:hidden">{tier.reference}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-8 h-[260px] pl-10 pr-[58px] sm:h-[340px] sm:pr-[102px] lg:h-[400px]">
        {ticks.map(({ v }) => (
          <span key={v} className="num absolute left-0 w-8 -translate-y-1/2 text-right text-[11px] leading-none text-ink-4" style={{ top: `${y(v)}%` }} aria-hidden="true">
            {tickUsd(v)}
          </span>
        ))}
        <div
          ref={plot}
          className="relative size-full touch-pan-y select-none rounded-mark outline-offset-4"
          role="group"
          aria-label={tx("Point at the chart, or use the left and right arrow keys, to read every line on a date.")}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(dates.length - 1, a === null ? dates.length - 1 : a + 1));
            else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a === null ? dates.length - 1 : a - 1));
            else if (e.key === "Escape") setActive(null);
            else return;
            e.preventDefault();
          }}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onBlur={() => setActive(null)}
        >
          {/* The plot's floor: decades firm, the 3s faint, a baseline under the years. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={tx("Cheapest price per million tokens by GPQA threshold, log scale")}>
            {ticks.map(({ v, major }) => (
              <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke={major ? "var(--line)" : "var(--line-soft)"} strokeDasharray={major ? undefined : "2 5"} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2="100" y1="100" y2="100" stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Under the highlighted line a wash of its colour, fading to the floor. */}
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`absolute inset-0 size-full ${entrance ? "anim-fade-in" : ""}`} aria-hidden="true">
            <defs>
              {data.tiers.map((tier, i) => (
                <linearGradient key={tier.key} id={`${wash}-${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={color(i)} stopOpacity="0.28" />
                  <stop offset="1" stopColor={color(i)} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {data.tiers.map((tier, i) => {
              const corners = px(vertices[i]!);
              return corners.length > 0 && (
                <path key={tier.key} d={`M${corners.map(([cx, cy]) => `${cx},${cy}`).join("L")}V${h}H${corners[0]![0]}Z`} fill={`url(#${wash}-${i})`} style={{ opacity: focus === tier.key ? 1 : 0, transition: "opacity .25s" }} />
              );
            })}
          </svg>
          {/* One SVG per line, laid in matches; each casts a small shadow on the page. */}
          {data.tiers.map((tier, i) => {
            const corners = px(vertices[i]!);
            if (corners.length === 0) return null;
            const runs = runsThrough(corners);
            const [ex, ey] = corners.at(-1)!;
            return (
              <svg key={tier.key} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`absolute inset-0 size-full overflow-visible ${entrance ? "anim-reveal" : ""}`} style={{ opacity: dim(tier.key), filter: "drop-shadow(0 1px 1.2px rgb(40 20 0 / .35))", transition: "opacity .25s" }} aria-hidden="true">
                {runs.map((run, r) => (
                  <g key={r} transform={`translate(${run.x} ${run.y}) rotate(${run.angle})`}>
                    {sticksAlong(run.len).map((stick) => <Match key={stick.at} {...stick} tint={color(i)} />)}
                  </g>
                ))}
                {/* Today's end: the last match is lit. */}
                <g transform={`translate(${ex - 5.6} ${ey - 2.5})`}><Flame id={`${wash}-flame-${i}`} flicker={flicker} /></g>
              </svg>
            );
          })}
          {/* Prices still awaiting a check: a hollow ring at their corner. */}
          {data.tiers.map((tier, i) => tier.points.filter((p) => !p.verified).map((p) => (
            <span
              key={`${tier.key}-${p.date}-${p.model.slug}`}
              className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity"
              style={{ left: `${x(p.date)}%`, top: `${y(p.price)}%`, opacity: dim(tier.key), background: "var(--bg)", boxShadow: `0 0 0 2px ${color(i)}` }}
              aria-hidden="true"
            />
          )))}
          {/* Where each threshold was first reached, and by what. */}
          {data.tiers.map((tier, i) => {
            const first = tier.points[0];
            return first && (
              <span
                key={tier.key}
                className="pointer-events-none absolute flex -translate-x-[6px] -translate-y-[calc(100%+9px)] items-center gap-1 whitespace-nowrap rounded-full bg-bg/85 px-1.5 py-0.5 text-[11px] leading-none text-ink-3 backdrop-blur-[2px] transition-opacity max-sm:hidden"
                style={{ left: `${x(first.date)}%`, top: `${y(first.price)}%`, opacity: focus && focus !== tier.key ? 0 : 1 }}
                aria-hidden="true"
              >
                <span className="size-1.5 rounded-full" style={{ background: color(i) }} />
                {first.model.name}
              </span>
            );
          })}
          {ends.map(({ tier, i, top }) => (
            <span key={tier.key} className="pointer-events-none absolute left-[calc(100%+16px)] flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap text-[11.5px] leading-none transition-opacity" style={{ top: `${top}%`, opacity: dim(tier.key) }} aria-hidden="true">
              <Swatch i={i} />
              <span className="font-semibold text-ink-2">{`≥${pct(tier.threshold)}`}</span>
              <span className="num text-ink-4 max-sm:hidden">{usd(tier.points.at(-1)!.price)}</span>
            </span>
          ))}
          {date && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-line-strong" style={{ left: `${x(date)}%` }} />
              {data.tiers.map((tier, i) => {
                const p = stepAt(tier, date);
                return p && <span key={tier.key} className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface" style={{ left: `${x(date)}%`, top: `${y(p.price)}%`, background: color(i) }} />;
              })}
              <div
                className="pointer-events-none absolute top-0 z-10 min-w-[220px] rounded-control border border-line bg-raised px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]"
                style={x(date) > 55 ? { right: `calc(${100 - x(date)}% + 10px)` } : { left: `calc(${x(date)}% + 10px)` }}
              >
                <div className="num text-ink-4">{date}</div>
                <ul className="mt-1 space-y-1">
                  {data.tiers.map((tier, i) => {
                    const p = stepAt(tier, date);
                    if (!p) return null;
                    const fresh = p.date === date;
                    return (
                      <li key={tier.key} className="flex items-center gap-2 whitespace-nowrap">
                        <Swatch i={i} hollow={!p.verified} />
                        <span className="num w-9 text-ink-4">{`≥${pct(tier.threshold)}`}</span>
                        <span className={`min-w-0 flex-1 truncate ${fresh ? "font-semibold text-ink" : "text-ink-3"}`}>{p.model.name}</span>
                        <b className="num font-semibold text-ink">{usd(p.price)}</b>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="relative ml-10 mr-[58px] mt-2.5 h-4 sm:mr-[102px]" aria-hidden="true">
        {years.map((year) => {
          const left = x(`${year}-01-01`);
          return (
            <span key={year}>
              <span className="absolute -top-2.5 h-[5px] w-px bg-line-strong" style={{ left: `${left}%` }} />
              <span className={`num absolute whitespace-nowrap text-[11px] leading-none text-ink-4 ${left < 4 ? "" : "-translate-x-1/2"}`} style={{ left: `${left}%` }}>
                {year}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A step's change from the one before it on the same line. */
function change(prev: CoiPoint | undefined, p: CoiPoint): string {
  if (!prev) return "—";
  const delta = Math.round((p.price / prev.price - 1) * 100);
  return delta === 0 ? "0%" : delta < 0 ? `−${-delta}%` : `+${delta}%`;
}

function StepsTable({ tier }: { tier: CoiTier }) {
  const tx = useTranslate();
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-[13px]">
        <thead className="text-[12px] text-ink-4">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium"><Text value="From" /></th>
            <th className="py-2 pl-3 text-left font-medium"><Text value="Model" /></th>
            <th className="py-2 pl-3 text-right font-medium">GPQA</th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="Blended / M tokens" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="Change" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="List price" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="Source" /></th>
          </tr>
        </thead>
        <tbody>
          {tier.points.map((p, j) => (
            <tr key={`${p.date}-${p.model.slug}`} className="border-b border-line-soft last:border-0">
              <td className="num py-2.5 align-top text-ink-3">{p.date}</td>
              <td className="py-2.5 pl-3 align-top">
                <span className="font-medium text-ink">{p.model.name}</span>
                {p.model.provider && <span className="block text-[12px] text-ink-4">{p.model.provider}</span>}
              </td>
              <td className="num py-2.5 pl-3 text-right align-top text-ink-3">{pct(p.score)}</td>
              <td className="num py-2.5 pl-3 text-right align-top font-semibold text-ink">{usd(p.price)}</td>
              <td className="num py-2.5 pl-3 text-right align-top text-ink-3">{change(tier.points[j - 1], p)}</td>
              <td className="num py-2.5 pl-3 text-right align-top text-ink-3">
                {`${p.currency} ${p.input} / ${p.output}`}
                {!p.verified && <span className="ml-1.5"><Badge tone="amber">{tx("unverified")}</Badge></span>}
              </td>
              <td className="py-2.5 pl-3 text-right align-top">
                {p.source ? (
                  <a href={p.source} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 text-ink-3 hover:text-accent"><Text value="Source" /><IconExternal size={12} /></a>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One quotable sentence per tier, with its numbers and dates. */
function findings(tx: (message: string, ...values: unknown[]) => string, tiers: CoiTier[]): string[] {
  return tiers.flatMap((tier) => {
    const first = tier.points[0];
    const now = tier.points.at(-1);
    if (!first || !now || !tier.ratio) return [];
    const args = [tier.reference, pct(tier.threshold), usd(first.price), first.date, usd(now.price), now.model.name, ratioText(tier.ratio)];
    return [tier.halvingMonths
      ? tx("Capability at GPQA Diamond ≥ {1} ({0} level) cost {2} per million tokens on {3} and costs {4} now ({5}): {6}× cheaper, halving about every {7} months.", ...args, tier.halvingMonths.toFixed(1))
      : tx("Capability at GPQA Diamond ≥ {1} ({0} level) cost {2} per million tokens on {3} and costs {4} now ({5}): {6}× cheaper.", ...args)];
  });
}

/** What another site needs to quote or embed the index, with the attribution CC BY asks for. */
function CiteAndEmbed({ data, url }: { data: CostOfIntelligence; url: string }) {
  const tx = useTranslate();
  const locale = useLocale();
  const image = `${siteUrl()}${chartPath(locale)}`;
  const title = tx("The cost of intelligence");
  const embed = `<a href="${url}"><img src="${image}" alt="${title}: ${tx("Cheapest price per million tokens by GPQA threshold, log scale")}" width="1200" height="630"></a>\n<p>${tx("Source")}: <a href="${url}">${SITE.name}, ${title}</a> (CC BY 4.0)</p>`;
  const citation = `${SITE.name}. (${data.asOf.slice(0, 4)}). ${title}. ${tx("Retrieved {0}, from {1}", data.asOf, url)}`;
  return (
    <section id="cite" className="mt-12 scroll-mt-6">
      <SectionHead eyebrow="CITE AND EMBED" title={tx("Use these numbers")} sub={tx("The index is free to quote, chart and republish under CC BY 4.0: credit it with a link to this page. The GPQA Diamond scores it rests on are Epoch AI's, also CC BY 4.0.")} />
      <div className="mt-5 grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink"><Text value="Key figures" /></h3>
          <CodeBlock code={findings(tx, data.tiers).join("\n\n")} title={tx("Updated {0}", data.asOf)} wrap className="mt-2.5" />
          <h3 className="mt-6 text-[14px] font-semibold text-ink"><Text value="Citation" /></h3>
          <CodeBlock code={citation} wrap className="mt-2.5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink"><Text value="Embed the chart" /></h3>
          <a href={chartPath(locale)} className="mt-2.5 block overflow-hidden rounded-card border border-line">
            <img src={chartPath(locale)} alt={tx("Cheapest price per million tokens by GPQA threshold, log scale")} width={1200} height={630} loading="lazy" className="h-auto w-full" />
          </a>
          <CodeBlock code={embed} lang="HTML" wrap className="mt-3" />
        </div>
      </div>
    </section>
  );
}

const LIMITS = [
  "Prices are per token, not per task: reasoning models spend far more tokens on the same job.",
  "Each model takes the score of its best configuration, which may also be the one that spends the most tokens.",
  "Retired models stay in: the line answers what could be bought at the time.",
  "Only first-party list prices count; open models served by third parties (Llama, for example) are left out.",
  "GPQA is saturating: above 90% it separates models less well, and a harder benchmark will take over the top tier.",
];

export default function CostOfIntelligencePage() {
  const data = useLoaderData<typeof loader>() as CostOfIntelligence;
  const tx = useTranslate();
  const locale = useLocale();
  const url = `${siteUrl()}${localePath(PATH, locale)}`;
  const [focus, setFocus] = useState<string | null>(null);
  const [tab, setTab] = useState(data.tiers[0]?.key ?? "");
  const lead = leadTier(data.tiers);
  const shown = data.tiers.find((t) => t.key === tab) ?? data.tiers[0];
  const unverified = data.tiers.some((t) => t.points.some((p) => !p.verified));
  return (
    <div className="pb-12">
      <Deck
        compact
        art="cat-models"
        label={tx("The cost of intelligence")}
        kicker={tx("Index · updated {0}", data.asOf)}
        title={tx("The cost of intelligence")}
        description={tx("The same capability keeps getting cheaper. Each line is the cheapest first-party API price for a model at or above a GPQA Diamond score.")}
        aside={lead?.ratio && lead.points[0] ? (
          <span className="flex flex-col items-end">
            <span className="font-mono text-[12px] text-[var(--deck-dim)]">{tx("{0}-level capability, cheaper than in {1}", lead.reference, lead.points[0].date.slice(0, 7))}</span>
            <span className="deck-figure text-[96px] lg:text-[120px]">{`${ratioText(lead.ratio)}×`}</span>
          </span>
        ) : undefined}
      />

      <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 border-y border-line py-6 lg:grid-cols-4" aria-label={tx("Price falls by threshold")}>
        {data.tiers.map((tier, i) => <TierStat key={tier.key} tier={tier} i={i} />)}
      </section>

      <section className="mt-12">
        <SectionHead eyebrow="CHEAPEST PRICE · LOG SCALE" title={tx("USD per million tokens, blended 3:1 input to output")} sub={tx("Each step is a launch or a price cut that made the threshold cheaper. Point at the chart to read every line on that date.")} />
        <div className="mt-5"><Chart data={data} focus={focus} onFocus={(key) => { setFocus(key); if (key) setTab(key); }} /></div>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] leading-relaxed text-ink-4">
          {unverified && <span className="inline-flex items-center gap-1.5"><Swatch i={0} hollow /><Text value="Hollow dots are launch prices still awaiting a check against an archived vendor page." /></span>}
          <a href="#cite" className="text-accent hover:text-accent-ink"><Text value="Embed or cite this chart" /></a>
        </p>
      </section>

      {shown && (
        <section className="mt-12">
          <SectionHead eyebrow="EVERY STEP" title={tx("Which model brought each step")} sub={tx("The cheapest model at or above the threshold from each date on, with its official list price and where it was checked.")} />
          <PillTabs
            size="sm"
            layoutId="coi-tier"
            label={tx("Threshold")}
            active={shown.key}
            onSelect={setTab}
            items={data.tiers.map((t) => ({ key: t.key, label: tx("GPQA ≥ {0}", pct(t.threshold)) }))}
            className="mt-5"
          />
          <StepsTable tier={shown} />
        </section>
      )}

      <section className="mt-12">
        <SectionHead eyebrow="METHOD" title={tx("How it is computed")} />
        <div className="mt-3 max-w-[720px] space-y-2 text-[13.5px] leading-relaxed text-ink-3">
          <p><Text value="Capability is GPQA Diamond accuracy as measured by Epoch AI, taking each model's best configuration. Price is the first-party API list price per million tokens: standard tier, cache-miss input, shortest context, no launch promotions or batch discounts. Input and output are blended 3:1." /></p>
          <p><Text value="On every date a model launched or a price changed, each line takes the cheapest model at or above its threshold. The halving time is a least-squares fit of log price against months, with the line read on the first of every month." /></p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-4">
          <a href={CSV} className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-ink"><IconDownload size={13} /><Text value="Download CSV" /></a>
          <span>{tx("{0} models with a GPQA score and a first-party price", data.modelCount)}</span>
          {data.fx && <span className="num">{tx("CNY prices at {0} per USD ({1})", data.fx.rate.toFixed(4), data.fx.asOf)}</span>}
        </div>
      </section>

      <CiteAndEmbed data={data} url={url} />

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="text-[15px] font-semibold text-ink"><Text value="What it does not say" /></h2>
        <ul className="mt-2 max-w-[720px] list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-3">
          {LIMITS.map((line) => <li key={line}><Text value={line} /></li>)}
        </ul>
      </section>
    </div>
  );
}
