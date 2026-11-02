// The cost-of-intelligence index (docs/plans/cost-of-intelligence.md): one stepped line per GPQA
// threshold, drawn on the server so crawlers read the numbers the chart shows. On the night ground of the
// menu pages: the headline figure, the chart with today's prices beside it, what a dollar buys, the steps
// of one threshold, then citing and method.
import { SITE } from "@aihot/site";
import { useMemo, useState, type ReactNode } from "react";
import { useLoaderData } from "react-router";
import type { CoiPoint, CoiTier, CostOfIntelligence } from "@aihot/indices/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { localeFromMatches, Text, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { CodeBlock, CopyButton } from "@aihot/web/features/agent/CodeBlock";
import { Badge } from "@aihot/web/components/ui/Badge";
import { IconDownload, IconExternal } from "@aihot/web/components/icons";

const PATH = "/index/cost-of-intelligence";
const CSV = "/api/site/indices/cost-of-intelligence.csv";
/** The chart as an image (backend/chart.ts): English unless ?lang=zh. */
const CHART = "/index/cost-of-intelligence.png";
const chartPath = (locale: string) => (locale === "zh" ? `${CHART}?lang=zh` : CHART);
/** The lines on the night ground, apart in lightness as well as hue: bone, brass, ember, red. The PNG keeps its own on paper. */
const LINE_COLORS = ["#efe3c8", "#d9a441", "#ef7d3c", "#f0524a"];
const color = (i: number) => LINE_COLORS[i % LINE_COLORS.length]!;
/** A step that cut at least this much is named on the chart. */
const BIG_CUT = 0.85;

export async function loader({ request }: { request: Request }) {
  return loadOr404<CostOfIntelligence>("/api/site/indices/cost-of-intelligence", { request, signal: request.signal });
}

export function meta({ matches, data }: { matches?: Array<{ id: string; data?: unknown }>; data?: CostOfIntelligence } = {}) {
  const locale = localeFromMatches(matches ?? []);
  const tx = (message: string, ...values: unknown[]) => translate(locale, message, ...values);
  const title = tx("The cost of intelligence");
  // The document title names what people search for (2026-11: "The cost of intelligence" had no impressions
  // in 90 days); the dataset and the page keep the index's own name.
  const description = tx("LLM API price per million tokens over time: the cheapest price for GPT-4-level and o1-level AI, tracked since 2023 by GPQA Diamond score, with sources and a CSV.");
  return pageMeta({
    title: tx("AI Price per Token Over Time: The Cost of Intelligence Index"),
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

/** Tokens a dollar buys at a price per million: 27K and 7.6M, or 2.7 万 and 762 万. */
function tokensPerDollar(price: number, locale: string): string {
  const n = 1e6 / price;
  if (locale === "zh") return n >= 1e8 ? `${(n / 1e8).toPrecision(3)} 亿` : n >= 1e4 ? `${Number((n / 1e4).toPrecision(3))} 万` : String(Math.round(n));
  return n >= 1e6 ? `${Number((n / 1e6).toPrecision(2))}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mono text-[12px] tracking-[0.14em] text-[color:var(--brass)]">{children}</p>;
}

function Swatch({ i, hollow = false }: { i: number; hollow?: boolean }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full border-2" style={{ borderColor: color(i), background: hollow ? "var(--bg)" : color(i) }} aria-hidden="true" />;
}

/** The tier with the longest record and a fall to show, for the headline. */
function leadTier(tiers: CoiTier[]): CoiTier | undefined {
  return tiers.find((t) => t.ratio);
}

/** Whether every threshold with a fall lost nine tenths of its first price within a year of reaching it. */
function fallsFastEverywhere(tiers: CoiTier[]): boolean {
  const falling = tiers.filter((t) => t.points.length > 1);
  return falling.length > 1 && falling.every((t) => {
    const first = t.points[0]!;
    const yearOn = new Date(Date.parse(`${first.date}T00:00:00Z`) + 365 * 864e5).toISOString().slice(0, 10);
    return t.points.some((p) => p.date <= yearOn && p.price <= first.price / 10);
  });
}

/** A step's change from the one before it on the same line. */
function change(prev: CoiPoint | undefined, p: CoiPoint): string | null {
  if (!prev) return null;
  const delta = Math.round((p.price / prev.price - 1) * 100);
  return delta === 0 ? "0%" : delta < 0 ? `−${-delta}%` : `+${delta}%`;
}

const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
const round = (v: number) => Math.round(v * 1000) / 1000;
/** $0.1, $0.3, $1, $3: one significant figure. */
const tickUsd = (v: number) => `$${Number(v.toPrecision(1))}`;

/** Where a tier's line stands on a date: its last step on or before it. */
function stepAt(tier: CoiTier, date: string): CoiPoint | null {
  let found: CoiPoint | null = null;
  for (const p of tier.points) if (p.date <= date) found = p;
  return found;
}

/** Both axes in percent of the plot box, shared by the chart and the steps' bars. */
function useScales(data: CostOfIntelligence) {
  return useMemo(() => {
    const points = data.tiers.flatMap((t) => t.points);
    if (points.length === 0) return null;
    const dates = [...new Set(points.map((p) => p.date))].sort();
    const t0 = day(`${dates[0]!.slice(0, 4)}-01-01`);
    const t1 = day(data.asOf);
    // A sixth of a decade of air above and below the lines.
    const lo = Math.log10(Math.min(...points.map((p) => p.price))) - 0.18;
    const hi = Math.log10(Math.max(...points.map((p) => p.price))) + 0.18;
    // Rounded: the server's and the browser's Math.log10 can differ in the last digit, and the page must hydrate.
    const x = (date: string) => round(((day(date) - t0) / (t1 - t0)) * 100);
    const y = (price: number) => round(((hi - Math.log10(price)) / (hi - lo)) * 100);
    return { dates, x, y, lo, hi };
  }, [data]);
}

/**
 * Log-scale stepped lines with every label as page text, so the axes stay legible on a phone. The selected
 * threshold is drawn full; the biggest cuts are named where they happened. Pointing at the chart reads
 * every line on that date.
 */
function Chart({ data, selected }: { data: CostOfIntelligence; selected: number }) {
  const tx = useTranslate();
  const scales = useScales(data);
  const [active, setActive] = useState<number | null>(null);
  const geometry = useMemo(() => {
    if (!scales) return null;
    const { x, y, lo, hi } = scales;
    const ticks: Array<{ v: number; major: boolean }> = [];
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
      for (const m of [1, 3]) {
        const v = m * 10 ** e;
        if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push({ v, major: m === 1 });
      }
    }
    const years: string[] = [];
    for (let year = Number(data.asOf.slice(0, 4)); x(`${year}-01-01`) >= 0; year--) years.unshift(String(year));
    // Each line's corners: right to the next step's date, then down (or up) to its price.
    const lines = data.tiers.map((tier) => {
      const out: Array<[number, number]> = [];
      tier.points.forEach((p, j) => {
        if (j > 0) out.push([x(p.date), out.at(-1)![1]]);
        out.push([x(p.date), y(p.price)]);
      });
      if (out.length) out.push([100, out.at(-1)![1]]);
      return out;
    });
    // Each line's deepest single cut, when it took off most of the price.
    const cuts = data.tiers.flatMap((tier, i) => {
      let best: { p: CoiPoint; prev: CoiPoint } | null = null;
      tier.points.forEach((p, j) => {
        const prev = tier.points[j - 1];
        if (prev && (!best || p.price / prev.price < best.p.price / best.prev.price)) best = { p, prev };
      });
      const cut = best as { p: CoiPoint; prev: CoiPoint } | null;
      return cut && cut.p.price / cut.prev.price <= 1 - BIG_CUT
        ? [{ i, key: tier.key, left: x(cut.p.date), top: (y(cut.prev.price) + y(cut.p.price)) / 2, name: cut.p.model.name, change: change(cut.prev, cut.p)! }]
        : [];
    });
    return { ticks, years, lines, cuts };
  }, [data, scales]);
  if (!scales || !geometry) return <p className="rounded-tile bg-bg-sunk px-4 py-8 text-center text-[13px] text-ink-4"><Text value="No prices yet." /></p>;
  const { dates, x, y } = scales;
  const { ticks, years, lines, cuts } = geometry;
  const date = active !== null ? dates[active]! : null;
  const dim = (i: number) => (i === selected ? 1 : 0.32);
  const pick = (clientX: number, rect: DOMRect) => {
    const at = ((clientX - rect.left) / rect.width) * 100;
    let best = 0;
    dates.forEach((d, i) => {
      if (Math.abs(x(d) - at) < Math.abs(x(dates[best]!) - at)) best = i;
    });
    setActive(best);
  };
  const end = data.tiers[selected]?.points.at(-1);
  return (
    <div>
      <div className="relative h-[240px] pl-10 sm:h-[340px] lg:h-[420px]">
        {ticks.map(({ v }) => (
          <span key={v} className="num absolute left-0 w-8 -translate-y-1/2 text-right text-[11px] leading-none text-ink-4" style={{ top: `${y(v)}%` }} aria-hidden="true">
            {tickUsd(v)}
          </span>
        ))}
        <div
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
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={tx("Cheapest price per million tokens by GPQA threshold, log scale")}>
            {ticks.map(({ v, major }) => (
              <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke={major ? "var(--line)" : "var(--line-soft)"} strokeDasharray={major ? undefined : "2 5"} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2="100" y1="100" y2="100" stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            {/* The selected line last, on top. */}
            {data.tiers.map((tier, i) => ({ tier, i })).sort((a, b) => Number(a.i === selected) - Number(b.i === selected)).map(({ tier, i }) => lines[i]!.length > 0 && (
              <path
                key={tier.key}
                d={`M${lines[i]!.map(([cx, cy]) => `${cx},${cy}`).join("L")}`}
                fill="none"
                stroke={color(i)}
                strokeWidth={i === selected ? 3.5 : 2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: dim(i), transition: "opacity .25s" }}
              />
            ))}
          </svg>
          {/* Prices still awaiting a check: a hollow ring at their corner. */}
          {data.tiers.map((tier, i) => tier.points.filter((p) => !p.verified).map((p) => (
            <span
              key={`${tier.key}-${p.date}-${p.model.slug}`}
              className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity"
              style={{ left: `${x(p.date)}%`, top: `${y(p.price)}%`, opacity: dim(i), background: "var(--bg)", boxShadow: `0 0 0 2px ${color(i)}` }}
              aria-hidden="true"
            />
          )))}
          {/* Where each threshold was first reached, by what and at what price. */}
          {data.tiers.map((tier, i) => {
            const first = tier.points[0];
            return first && (
              <span key={tier.key} className="pointer-events-none absolute transition-opacity max-sm:hidden" style={{ left: `${x(first.date)}%`, top: `${y(first.price)}%`, opacity: dim(i) }} aria-hidden="true">
                <span className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: color(i) }} />
                <span className="absolute -translate-x-[6px] -translate-y-[calc(100%+8px)] whitespace-nowrap text-[12px] leading-none text-ink-2">
                  {first.model.name} · <b className="num font-medium">{usd(first.price)}</b>
                </span>
              </span>
            );
          })}
          {cuts.map((cut) => (
            <span
              key={cut.key}
              className={`pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-full border bg-[color:var(--bg)]/85 px-2.5 py-1 text-[12px] leading-none transition-opacity max-sm:hidden ${cut.left > 70 ? "-translate-x-[calc(100%+10px)]" : "translate-x-[10px]"}`}
              style={{ left: `${cut.left}%`, top: `${cut.top}%`, color: color(cut.i), borderColor: `${color(cut.i)}80`, opacity: cut.i === selected ? 1 : 0.55 }}
              aria-hidden="true"
            >
              {cut.name} <b className="num font-medium">{cut.change}</b>
            </span>
          ))}
          {/* Today's end of the selected line glows. */}
          {end && <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: "100%", top: `${y(end.price)}%`, background: "radial-gradient(circle, #fff3d6 0, var(--brass-hi) 35%, transparent 70%)", boxShadow: "0 0 18px 6px rgb(240 210 138 / .35)" }} aria-hidden="true" />}
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
      <div className="relative ml-10 mt-2.5 h-4" aria-hidden="true">
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
        <span className="absolute right-0 text-[11px] leading-none text-[color:var(--brass-hi)]"><Text value="Today" /></span>
      </div>
    </div>
  );
}

/** The thresholds as buttons: choosing one draws its line full and lists its steps below. */
function TierPicker({ tiers, selected, onSelect }: { tiers: CoiTier[]; selected: number; onSelect: (i: number) => void }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={tx("Highlight a threshold")}>
      {tiers.map((tier, i) => (
        <button
          key={tier.key}
          type="button"
          aria-pressed={i === selected}
          onClick={() => onSelect(i)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors ${i === selected ? "border-[color:var(--brass)]/60 bg-[color:var(--brass)]/15 text-ink" : "border-line text-ink-3 hover:border-line-strong hover:text-ink"}`}
        >
          <Swatch i={i} />
          {tx("GPQA ≥ {0}", pct(tier.threshold))}
          <span className="text-[12px] text-ink-4 max-sm:hidden">{tier.reference}</span>
        </button>
      ))}
    </div>
  );
}

/** Each threshold's price today, how much cheaper it is and how fast it halves. */
function Today({ tiers, selected, onSelect }: { tiers: CoiTier[]; selected: number; onSelect: (i: number) => void }) {
  const tx = useTranslate();
  return (
    <aside className="flex flex-col gap-2.5" aria-label={tx("Price falls by threshold")}>
      <p className="mono text-[11px] tracking-[0.12em] text-[color:var(--brass)]"><Text value="Today · per million tokens" /></p>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
        {tiers.map((tier, i) => {
          const now = tier.points.at(-1);
          return (
            <button
              key={tier.key}
              type="button"
              aria-pressed={i === selected}
              onClick={() => onSelect(i)}
              className={`rounded-tile border px-3 py-2.5 text-left transition-colors ${i === selected ? "border-[color:var(--brass)]/45 bg-[color:var(--brass)]/[.08]" : "border-line-soft hover:border-line"}`}
            >
              <span className="flex items-center gap-2 text-[12px] text-ink-3"><Swatch i={i} />{tx("GPQA ≥ {0}", pct(tier.threshold))}</span>
              <span className="mt-1 flex items-baseline justify-between gap-2">
                <span className="num text-[22px] leading-tight text-ink">{now ? usd(now.price) : "—"}</span>
                {tier.ratio && <span className="font-display text-[24px] italic leading-none text-[color:var(--brass-hi)]">{`${ratioText(tier.ratio)}×`}</span>}
              </span>
              {now && (
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">
                  {now.model.name}{tier.halvingMonths ? ` · ${tx("Halves every {0} months", tier.halvingMonths.toFixed(1))}` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/** What a dollar bought when each threshold was first reached, and what it buys today. */
function DollarBuys({ tiers }: { tiers: CoiTier[] }) {
  const tx = useTranslate();
  const locale = useLocale();
  return (
    <section aria-labelledby="coi-dollar" className="mt-20">
      <Eyebrow><Text value="WHAT A DOLLAR BUYS" /></Eyebrow>
      <h2 id="coi-dollar" className="mt-2.5 font-display text-[26px] font-bold leading-snug text-ink sm:text-[34px] [&:lang(en)]:font-normal"><Text value="How much thinking one dollar buys" /></h2>
      <p className="mt-2 text-[13.5px] text-ink-3"><Text value="Tokens per US dollar at the cheapest price, when each threshold was first reached and today." /></p>
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiers.map((tier, i) => {
          const first = tier.points[0];
          const now = tier.points.at(-1);
          return first && now && (
            <article key={tier.key} className="rounded-card border border-line bg-surface p-4 lg:p-5">
              <p className="flex items-center gap-2 text-[13px] text-ink-2"><Swatch i={i} />{tx("GPQA ≥ {0}", pct(tier.threshold))}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-4">{tx("{0} level", tier.reference)}</p>
              <p className="mt-4 text-[12px] text-ink-4">{tx("First reached {0}", first.date.slice(0, 7))}</p>
              <p className="num text-[18px] text-ink-3">{tokensPerDollar(first.price, locale)}</p>
              <p className="mt-3 text-[12px] text-ink-4"><Text value="Today" /></p>
              <p className="font-display text-[40px] leading-none text-ink lg:text-[52px]">{tokensPerDollar(now.price, locale)}</p>
              <p className="mt-1.5 text-[12px] text-ink-4"><Text value="tokens per dollar" /></p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Every step of one threshold: its date, model, a bar as long as its price on the chart's scale, and the cut. */
function Steps({ data, selected, onSelect }: { data: CostOfIntelligence; selected: number; onSelect: (i: number) => void }) {
  const tx = useTranslate();
  const scales = useScales(data);
  const tier = data.tiers[selected];
  if (!tier || !scales) return null;
  return (
    <section aria-labelledby="coi-steps" className="mt-20">
      <Eyebrow><Text value="EVERY STEP" /></Eyebrow>
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-4">
        <h2 id="coi-steps" className="font-display text-[26px] font-bold leading-snug text-ink sm:text-[34px] [&:lang(en)]:font-normal">{tx("Who brought down the price of {0}-level capability", tier.reference)}</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tx("Threshold")}>
          {data.tiers.map((t, i) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={i === selected}
              onClick={() => onSelect(i)}
              className={`num min-h-10 min-w-16 rounded-full border px-3.5 text-[13px] transition-colors ${i === selected ? "text-[#2a1f16]" : "border-line text-ink-3 hover:border-line-strong hover:text-ink"}`}
              style={i === selected ? { background: color(i), borderColor: color(i) } : undefined}
            >
              {`≥ ${pct(t.threshold)}`}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-6 border-t border-line">
        {tier.points.map((p, j) => {
          const cut = change(tier.points[j - 1], p);
          return (
            <li key={`${p.date}-${p.model.slug}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line-soft py-3 sm:grid-cols-[100px_minmax(0,1.3fr)_minmax(0,1.6fr)_88px_64px]">
              <span className="num text-[12.5px] text-ink-4 max-sm:col-span-2">{p.date}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{p.model.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-4">
                  {p.model.provider && <span>{p.model.provider}</span>}
                  <span className="num">{`GPQA ${pct(p.score)}`}</span>
                  <span className="num">{`${p.currency} ${p.input} / ${p.output}`}</span>
                  {!p.verified && <Badge tone="amber">{tx("unverified")}</Badge>}
                  {p.source && <a href={p.source} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 text-ink-3 hover:text-[color:var(--brass-hi)]"><Text value="Source" /><IconExternal size={12} /></a>}
                </span>
              </span>
              <span className="relative h-2 rounded-full bg-ink/[.06] max-sm:hidden" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, 100 - scales.y(p.price))}%`, background: color(selected) }} />
              </span>
              <span className="num text-right text-[15px] text-ink">{usd(p.price)}</span>
              <span className={`num text-right text-[13px] max-sm:col-start-2 ${cut ? "text-[color:var(--ok)]" : "text-ink-4"}`}>{cut ?? tx("First")}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3.5 text-[12.5px] text-ink-4">
        <Text value="Each row is a launch or a price cut, with where its official price was checked." />{" "}
        <a href={CSV} className="text-[color:var(--brass-hi)] hover:underline"><Text value="Download CSV" /></a>
      </p>
    </section>
  );
}

/** One quotable sentence per tier, with its numbers and dates. */
function findings(tx: (message: string, ...values: unknown[]) => string, tiers: CoiTier[]): Array<{ i: number; text: string }> {
  return tiers.flatMap((tier, i) => {
    const first = tier.points[0];
    const now = tier.points.at(-1);
    if (!first || !now || !tier.ratio) return [];
    const args = [tier.reference, pct(tier.threshold), usd(first.price), first.date, usd(now.price), now.model.name, ratioText(tier.ratio)];
    return [{ i, text: tier.halvingMonths
      ? tx("Capability at GPQA Diamond ≥ {1} ({0} level) cost {2} per million tokens on {3} and costs {4} now ({5}): {6}× cheaper, halving about every {7} months.", ...args, tier.halvingMonths.toFixed(1))
      : tx("Capability at GPQA Diamond ≥ {1} ({0} level) cost {2} per million tokens on {3} and costs {4} now ({5}): {6}× cheaper.", ...args) }];
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
  const lines = findings(tx, data.tiers);
  return (
    <section id="cite" aria-labelledby="coi-cite" className="min-w-0 scroll-mt-20">
      <Eyebrow><Text value="CITE AND EMBED" /></Eyebrow>
      <h2 id="coi-cite" className="mt-2.5 font-display text-[24px] font-bold leading-snug text-ink sm:text-[28px] [&:lang(en)]:font-normal"><Text value="Use these numbers" /></h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><Text value="The index is free to quote, chart and republish under CC BY 4.0: credit it with a link to this page. The GPQA Diamond scores it rests on are Epoch AI's, also CC BY 4.0." /></p>
      <div className="mt-5 rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h3 className="text-[13.5px] font-semibold text-ink"><Text value="Key figures" /><span className="num ml-2 text-[12px] font-normal text-ink-4">{tx("Updated {0}", data.asOf)}</span></h3>
          <CopyButton text={lines.map((l) => l.text).join("\n\n")} />
        </div>
        <ul className="divide-y divide-line-soft">
          {lines.map(({ i, text }) => (
            <li key={i} className="flex gap-3 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
              <span className="mt-[7px]"><Swatch i={i} /></span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <a href={CSV} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[linear-gradient(var(--brass-hi),var(--brass))] px-4 text-[14px] font-semibold text-[#2a1f16]"><IconDownload size={14} /><Text value="Download CSV" /></a>
        <a href={chartPath(locale)} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[14px] text-ink hover:border-[color:var(--brass)]"><IconExternal size={14} />{tx("Chart image · PNG 1200 × 630")}</a>
      </div>
      <details className="group mt-4 rounded-card border border-line">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13.5px] text-ink-2 marker:text-ink-4"><Text value="Embed code and citation" /></summary>
        <div className="space-y-4 border-t border-line-soft p-4">
          <CodeBlock code={embed} title={tx("Embed the chart (HTML)")} wrap className="" />
          <CodeBlock code={citation} title={tx("Citation (APA)")} wrap className="" />
        </div>
      </details>
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

function Method({ data }: { data: CostOfIntelligence }) {
  const tx = useTranslate();
  return (
    <div className="flex min-w-0 flex-col gap-7">
      <section>
        <h2 className="text-[15px] font-semibold text-ink"><Text value="How it is computed" /></h2>
        <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-ink-3">
          <p><Text value="Capability is GPQA Diamond accuracy as measured by Epoch AI, taking each model's best configuration. Price is the first-party API list price per million tokens: standard tier, cache-miss input, shortest context, no launch promotions or batch discounts. Input and output are blended 3:1." /></p>
          <p><Text value="On every date a model launched or a price changed, each line takes the cheapest model at or above its threshold. The halving time is a least-squares fit of log price against months, with the line read on the first of every month." /></p>
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
          <span>{tx("{0} models with a GPQA score and a first-party price", data.modelCount)}</span>
          {data.fx && <span className="num">{tx("CNY prices at {0} per USD ({1})", data.fx.rate.toFixed(4), data.fx.asOf)}</span>}
        </p>
        {data.tiers.some((t) => t.points.some((p) => !p.verified)) && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-4"><Swatch i={0} hollow /><Text value="Hollow dots are launch prices still awaiting a check against an archived vendor page." /></p>
        )}
      </section>
      <section>
        <h2 className="text-[15px] font-semibold text-ink"><Text value="What it does not say" /></h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-3">
          {LIMITS.map((line) => <li key={line}><Text value={line} /></li>)}
        </ul>
      </section>
    </div>
  );
}

/** The headline: how much cheaper the longest-running threshold has become, the figure set large. */
function Headline({ lead }: { lead: CoiTier | undefined }) {
  const tx = useTranslate();
  const first = lead?.points[0];
  const now = lead?.points.at(-1);
  if (!lead?.ratio || !first || !now) return <h1 id="coi-title" className="font-display text-[40px] font-bold leading-tight text-ink sm:text-[64px]"><Text value="The cost of intelligence" /></h1>;
  // The figure sits inside a translated sentence: split the sentence where it goes.
  const [before, after] = tx("{0}× cheaper.", "\u0000").split("\u0000") as [string, string];
  return (
    <>
      <h1 id="coi-title" className="font-display text-[36px] font-bold leading-[1.15] text-[#fff7e8] [text-wrap:balance] sm:text-[52px] lg:text-[64px] [&:lang(en)]:font-normal [&:lang(en)]:italic">
        <Text value="The same intelligence," /><br />
        {before}<span className="font-display text-[1.3em] font-normal italic text-[color:var(--brass-hi)]">{ratioText(lead.ratio)}</span>{after}
      </h1>
      <p className="mt-4 text-[15px] leading-[1.85] text-ink-2 sm:text-[16px] lg:mt-0">
        {tx("In {0}, {1}-level capability cost {2} per million tokens. Today {3} does as well for {4}.", first.date.slice(0, 7), lead.reference, usd(first.price), now.model.name, usd(now.price))}
      </p>
    </>
  );
}

export default function CostOfIntelligencePage() {
  const data = useLoaderData<typeof loader>() as CostOfIntelligence;
  const tx = useTranslate();
  const locale = useLocale();
  const url = `${siteUrl()}${localePath(PATH, locale)}`;
  const [selected, setSelected] = useState(0);
  const lead = leadTier(data.tiers);
  return (
    <div className="pb-16">
      <section aria-labelledby="coi-title" className="pb-7 pt-10 lg:pt-14">
        <p className="mono text-[12px] tracking-[0.14em] text-[color:var(--brass)]">{`${tx("The cost of intelligence")} · ${tx("Updated {0}", data.asOf)}`}</p>
        <div className="mt-4 grid items-end gap-x-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] [&>p]:lg:pb-2">
          <Headline lead={lead} />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-4"><Text value="Capability is GPQA Diamond accuracy; price is the first-party API list price, input and output blended 3:1." /></p>
      </section>

      <section className="rounded-panel border border-line bg-surface px-4 pb-5 pt-5 sm:px-7 sm:pt-6" aria-label={tx("Cheapest price per million tokens by GPQA threshold, log scale")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TierPicker tiers={data.tiers} selected={selected} onSelect={setSelected} />
          <p className="mono text-[11.5px] tracking-[0.08em] text-ink-4"><Text value="Cheapest price per million tokens · log scale" /></p>
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0"><Chart data={data} selected={selected} /></div>
          <Today tiers={data.tiers} selected={selected} onSelect={setSelected} />
        </div>
      </section>

      {fallsFastEverywhere(data.tiers) && (
        <p className="mt-7 rounded-card border border-[color:var(--brass)]/25 bg-[color:var(--brass)]/[.08] px-5 py-4 font-display text-[17px] leading-relaxed text-[#fff3d6] sm:text-[19px]">
          <Text value="The pattern: each new level of capability arrives at a high price and loses more than nine tenths of it within a year." />
        </p>
      )}

      <DollarBuys tiers={data.tiers} />
      <Steps data={data} selected={selected} onSelect={setSelected} />

      <div className="mt-20 grid gap-10 lg:grid-cols-2">
        <CiteAndEmbed data={data} url={url} />
        <Method data={data} />
      </div>
    </div>
  );
}
