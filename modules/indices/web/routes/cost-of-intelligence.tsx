// The cost-of-intelligence index (docs/plans/cost-of-intelligence.md): one stepped line per GPQA
// threshold, drawn on the server so crawlers read the numbers the chart shows.
import { SITE } from "@aihot/site";
import { useLoaderData } from "react-router";
import type { CoiPoint, CoiTier, CostOfIntelligence } from "@aihot/indices/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { localeFromMatches, Text, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { AsideCard, ReadingLayout } from "@aihot/web/components/ui/Page";
import { Deck } from "@aihot/web/components/shell/Deck";

const PATH = "/index/cost-of-intelligence";
const CSV = "/api/site/indices/cost-of-intelligence.csv";
/** Hotter as the capability rises. */
const COLORS = ["#b08a4a", "#d9a441", "#ff8a3d", "#e0481a"];

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="mono text-[11px] font-semibold tracking-[0.14em] text-accent">{children}</span>;
}

function Headline({ tier, color }: { tier: CoiTier; color: string }) {
  const tx = useTranslate();
  const first = tier.points[0];
  const now = tier.points.at(-1);
  if (!first || !now) return null;
  return (
    <li className="card flex flex-col p-4 lg:p-5">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
        {tx("GPQA ≥ {0}", pct(tier.threshold))}
      </span>
      <span className="mt-1 text-[11.5px] text-ink-4">{tx("{0} level", tier.reference)}</span>
      <span className="mono mt-3 text-[28px] font-medium leading-none text-ink">{tier.ratio ? `${tier.ratio >= 10 ? tier.ratio.toFixed(0) : tier.ratio.toFixed(1)}×` : "—"}</span>
      <span className="mt-1 text-[12px] text-ink-3">{tier.ratio ? tx("cheaper than when first reached") : tx("one price so far")}</span>
      <span className="mt-3 text-[12px] leading-[1.7] text-ink-3">
        {tier.halvingMonths ? tx("Halves every {0} months", tier.halvingMonths.toFixed(1)) : tx("No halving trend yet")}
        <br />
        {tx("{0} on {1} → {2} now ({3})", usd(first.price), first.date, usd(now.price), now.model.name)}
      </span>
    </li>
  );
}

/** Log-scale stepped lines; hollow dots are prices still awaiting verification. */
function Chart({ data }: { data: CostOfIntelligence }) {
  const tx = useTranslate();
  const W = 760, H = 420, L = 78, R = 66, T = 16, B = 44;
  const points = data.tiers.flatMap((t) => t.points);
  if (points.length === 0) return <p className="text-[13px] text-ink-3"><Text value="No prices yet." /></p>;
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const x0 = day(`${points.map((p) => p.date).sort()[0]!.slice(0, 4)}-01-01`);
  const x1 = day(data.asOf);
  // A fifth of a decade of air above and below the lines; gridlines on the decades inside.
  const lo = Math.log10(Math.min(...points.map((p) => p.price))) - 0.2;
  const hi = Math.log10(Math.max(...points.map((p) => p.price))) + 0.2;
  const x = (date: string) => L + ((day(date) - x0) / (x1 - x0)) * (W - L - R);
  const y = (price: number) => T + ((hi - Math.log10(price)) / (hi - lo)) * (H - T - B);
  const years: string[] = [];
  for (let year = Number(data.asOf.slice(0, 4)); day(`${year}-01-01`) >= x0; year--) years.unshift(String(year));
  const decades = Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => 10 ** (Math.ceil(lo) + i));
  // End labels at their line's last price, pushed apart so none overlap.
  const labels = data.tiers.flatMap((tier, i) => (tier.points.length ? [{ key: tier.key, i, y: y(tier.points.at(-1)!.price) + 6 }] : [])).sort((a, b) => a.y - b.y);
  for (let j = 1; j < labels.length; j++) labels[j]!.y = Math.max(labels[j]!.y, labels[j - 1]!.y + 19);
  const overflow = labels.length ? labels.at(-1)!.y - (H - B + 4) : 0;
  if (overflow > 0) for (const label of labels) label.y -= overflow;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tx("Cheapest price per million tokens by GPQA threshold, log scale")}>
      {decades.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-line" strokeWidth={1} />
          <text x={L - 10} y={y(v) + 6} textAnchor="end" className="fill-ink-4 text-[17px]">{usd(v)}</text>
        </g>
      ))}
      {years.map((year) => (
        <text key={year} x={x(`${year}-01-01`)} y={H - 12} textAnchor="middle" className="fill-ink-4 text-[17px]">{year}</text>
      ))}
      {data.tiers.map((tier, i) => {
        if (tier.points.length === 0) return null;
        let d = "";
        tier.points.forEach((p, j) => {
          d += j === 0 ? `M${x(p.date)},${y(p.price)}` : `H${x(p.date)}V${y(p.price)}`;
        });
        d += `H${x(data.asOf)}`;
        const color = COLORS[i % COLORS.length]!;
        return (
          <g key={tier.key}>
            <path d={d} fill="none" stroke={color} strokeWidth={2.5} />
            {tier.points.map((p) => (
              <circle key={`${p.date}-${p.model.slug}`} cx={x(p.date)} cy={y(p.price)} r={5} fill={p.verified ? color : "var(--bg, white)"} stroke={color} strokeWidth={2}>
                <title>{`GPQA ≥ ${pct(tier.threshold)} · ${p.date} · ${p.model.name} · ${usd(p.price)}${p.verified ? "" : ` · ${tx("unverified")}`}`}</title>
              </circle>
            ))}
            <text x={W - R + 4} y={labels.find((l) => l.key === tier.key)!.y} fill={color} className="text-[17px] font-semibold">{`≥${pct(tier.threshold)}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Steps({ tier }: { tier: CoiTier }) {
  const tx = useTranslate();
  return (
    <details className="disclosure group border-b border-line">
      <summary className="flex items-center justify-between gap-3 py-4 text-[14px] font-semibold text-ink transition-colors hover:text-accent">
        {tx("GPQA ≥ {0}: {1} steps", pct(tier.threshold), tier.points.length)}
      </summary>
      <div className="overflow-x-auto pb-4">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead className="text-ink-4">
            <tr><th className="py-1.5 pr-3 font-medium"><Text value="From" /></th><th className="pr-3 font-medium"><Text value="Model" /></th><th className="pr-3 font-medium">GPQA</th><th className="pr-3 font-medium"><Text value="Blended / M tokens" /></th><th className="font-medium"><Text value="List price" /></th></tr>
          </thead>
          <tbody className="text-ink-2">
            {tier.points.map((p: CoiPoint) => (
              <tr key={`${p.date}-${p.model.slug}`} className="border-t border-line-soft">
                <td className="mono py-1.5 pr-3">{p.date}</td>
                <td className="pr-3">{p.model.name}{p.model.provider ? <span className="text-ink-4"> · {p.model.provider}</span> : null}</td>
                <td className="mono pr-3">{pct(p.score)}</td>
                <td className="mono pr-3">{usd(p.price)}</td>
                <td className="mono">
                  {p.source ? <a href={p.source} rel="noopener nofollow" target="_blank" className="text-accent hover:text-accent-ink">{`${p.currency} ${p.input} / ${p.output}`}</a> : `${p.currency} ${p.input} / ${p.output}`}
                  {p.verified ? null : <span className="ml-1.5 text-ink-4">({tx("unverified")})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
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
  const aside = (
    <>
      <AsideCard title={tx("Data")}>
        <ul className="space-y-2 text-[12.5px] leading-[1.7] text-ink-3">
          <li><a href={CSV} className="text-accent hover:text-accent-ink"><Text value="Download CSV" /></a></li>
          <li>{tx("{0} models with a GPQA score and a first-party price", data.modelCount)}</li>
          <li>{tx("Updated {0}", data.asOf)}</li>
          {data.fx ? <li>{tx("CNY prices at {0} per USD ({1})", data.fx.rate.toFixed(4), data.fx.asOf)}</li> : null}
        </ul>
      </AsideCard>
      <AsideCard title={tx("Cite")}>
        <p className="text-[12px] leading-[1.7] text-ink-3">{`${SITE.name}, “${tx("The cost of intelligence")}”, ${url}, ${data.asOf}. ${tx("GPQA Diamond scores: Epoch AI, CC BY 4.0.")}`}</p>
      </AsideCard>
    </>
  );
  return (
    <ReadingLayout aside={aside}>
      <Deck compact art="cat-models" label={tx("The cost of intelligence")} title={tx("The cost of intelligence")}
        description={tx("The same capability keeps getting cheaper. Each line is the cheapest first-party API price for a model at or above a GPQA Diamond score.")} />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={tx("Price falls by threshold")}>
        {data.tiers.map((tier, i) => <Headline key={tier.key} tier={tier} color={COLORS[i % COLORS.length]!} />)}
      </ul>

      <section className="mt-8">
        <Eyebrow>CHEAPEST PRICE · LOG SCALE</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink"><Text value="USD per million tokens, blended 3:1 input to output" /></h2>
        <div className="mt-4"><Chart data={data} /></div>
        <p className="mt-2 text-[12px] leading-[1.7] text-ink-4"><Text value="Hollow dots are launch prices still awaiting a check against an archived vendor page." /></p>
      </section>

      <section className="mt-10">
        <Eyebrow>EVERY STEP</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink"><Text value="Which model brought each step" /></h2>
        <div className="mt-3 border-t border-line">{data.tiers.map((tier) => <Steps key={tier.key} tier={tier} />)}</div>
      </section>

      <section className="mt-10">
        <Eyebrow>METHOD</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink"><Text value="How it is computed" /></h2>
        <div className="mt-2 max-w-[64em] space-y-3 text-[13px] leading-[1.8] text-ink-3">
          <p><Text value="Capability is GPQA Diamond accuracy as measured by Epoch AI, taking each model's best configuration. Price is the first-party API list price per million tokens: standard tier, cache-miss input, shortest context, no launch promotions or batch discounts. Input and output are blended 3:1." /></p>
          <p><Text value="On every date a model launched or a price changed, each line takes the cheapest model at or above its threshold. The halving time is a least-squares fit of log price against months, with the line read on the first of every month." /></p>
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>LIMITS</Eyebrow>
        <h2 className="mt-2 text-[20px] font-bold text-ink"><Text value="What it does not say" /></h2>
        <ul className="mt-2 max-w-[64em] list-disc space-y-1.5 pl-5 text-[13px] leading-[1.8] text-ink-3">
          {LIMITS.map((line) => <li key={line}><Text value={line} /></li>)}
        </ul>
      </section>
    </ReadingLayout>
  );
}
