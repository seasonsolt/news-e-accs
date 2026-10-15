import { useState, type ReactNode } from "react";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { Text, useLocale, useTranslate } from "../../lib/i18n";

type Fact = NonNullable<SiteItemDetail["fact"]>;

/**
 * The fact analysis structured for this report: who, what they did, when, and one sentence of the
 * report's own words. The fact's words are not translated, so "what they did" shows only in the edition
 * of their own language; names, the date and the quotation read the same in either.
 */
export function FactCard({ fact }: { fact: Fact }) {
  const tx = useTranslate();
  const locale = useLocale();
  const did = fact.language === locale ? [fact.action, fact.object].filter(Boolean).join(fact.language === "zh" ? "" : " ") : "";
  const date = fact.occurredAt?.slice(0, 10);
  const rows: Array<{ label: string; value: ReactNode }> = [];
  if (fact.subject) rows.push({ label: "谁", value: fact.subject });
  if (did) rows.push({ label: "做了什么", value: did });
  if (date) rows.push({ label: "时间", value: <time dateTime={date}>{tx(`${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`)}</time> });
  if (fact.quote) rows.push({ label: "引文", value: <q className="italic text-ink-2">{fact.quote}</q> });
  // A subject alone repeats the source line; the card needs something more to say.
  if (rows.length < 2) return null;
  return (
    <section aria-label={tx("事实")} className="mt-7 rounded-tile border border-line px-4 py-3 lg:px-5">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px] leading-[1.65]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[12.5px] leading-[1.9] text-ink-4"><Text value={r.label} /></dt>
            <dd className="text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** "当事人" for an author who is the news's own source, "转述" for one passing it on (not "一手", the first-party channel). */
export function AuthorRoleMark({ role }: { role: SiteItemDetail["authorRole"] }) {
  if (!role) return null;
  return (
    <span className={`rounded-[5px] px-1.5 py-px text-[11.5px] font-medium ${role === "principal" ? "bg-accent-soft text-accent" : "bg-bg-sunk text-ink-3"}`}>
      <Text value={role === "principal" ? "当事人" : "转述"} />
    </span>
  );
}

/** An X post's views and likes as they were when it was collected. */
export function XCountsLine({ counts }: { counts: NonNullable<SiteItemDetail["xCounts"]> }) {
  const tx = useTranslate();
  const locale = useLocale();
  const format = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en", { notation: "compact", maximumFractionDigits: 1 });
  const parts = [
    counts.views !== null ? tx("{0} 次浏览", format.format(counts.views)) : null,
    counts.favorite !== null ? tx("{0} 赞", format.format(counts.favorite)) : null,
    counts.retweet !== null ? tx("{0} 转发", format.format(counts.retweet)) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="num mt-1.5 text-[12.5px] text-ink-4">
      {parts.join(" · ")} <Text value="（收录时）" />
    </p>
  );
}

/** "这件事到目前为止": the event's digest, four lines until the reader opens it. */
export function StoryDigest({ digest, lang }: { digest: string; lang: string }) {
  const [open, setOpen] = useState(false);
  // Roughly what four lines hold on a phone; a shorter digest needs no toggle.
  const long = digest.length > 120;
  return (
    <section className="mt-9">
      <h2 className="text-[12.5px] font-semibold text-ink-3"><Text value="这件事到目前为止" /></h2>
      <p lang={lang} className={`mt-2 text-[15px] leading-[1.8] text-ink-2 ${open || !long ? "" : "line-clamp-4"}`}>{digest}</p>
      {long && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 text-[13px] text-ink-3 transition-colors hover:text-accent">
        <Text value={open ? "收起" : "展开"} />
      </button>}
    </section>
  );
}
