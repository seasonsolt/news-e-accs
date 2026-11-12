import { useRef, useState } from "react";
import type { ReportDetail } from "@aihot/contracts/site";
import type { SubscribeSource } from "@aihot/contracts/subscribe";
import { EDITION_TIMES, SITE } from "@aihot/site";
import { Link } from "../../lib/navigation";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
import { localePath } from "../../lib/locale";
import { EmailForm, Sent, type Phase } from "./SubscribeCta";
import { useSubscribeView } from "./useSubscribeView";

/** How many of the issue's events the letter preview lists before saying how many more follow. */
const PREVIEW_ROWS = 6;

/**
 * The sign-up beside the latest issue as it arrives: the letter's plate, its headline and the numbered
 * list it opens with (newsletter/mail.ts), so the promise is the real thing.
 */
export function SubscribePage({ report, source }: { report: ReportDetail | null; source: SubscribeSource }) {
  const tx = useTranslate();
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  useSubscribeView(formRef, source);
  const seen = new Set<string>();
  const entries = report ? report.sections.flatMap((s) => s.items).filter((item) => {
    const key = item.itemId ?? item.sourceUrl;
    if (!item.available || seen.has(key)) return false;
    seen.add(key);
    return true;
  }) : [];
  const facts: Array<[string, string]> = [
    [tx("时间"), tx("每天 {0}（北京时间）", EDITION_TIMES.daily)],
    [tx("内容"), tx("十件左右的事，每条附原文")],
    [tx("退订"), tx("每封信底部，一键退订")],
  ];
  return (
    <div className="mx-auto max-w-6xl py-8 sm:py-12 lg:py-16">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <section className="lg:sticky lg:top-28">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">e/acc · <Text value="每日 AI 简报" /></p>
          <h1 className="mt-5 font-display text-[38px] leading-[1.15] tracking-tight text-ink sm:text-[48px]"><Text value="每天几分钟，看懂 AI 的重要变化" /></h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-3"><Text value="模型发布、价格变化、算力进展。把值得关注的几件事和原始来源，整理成一封邮件。" /></p>
          <div className="mt-8 rounded-card border border-line bg-surface p-5 sm:p-6" data-subscribe-page-form>
            {phase.kind === "sent" ? <Sent email={phase.email} /> : <>
              <p className="text-[13px] font-medium text-ink"><Text value={locale === "en" ? "你将收到英文日报" : "你将收到中文日报"} /></p>
              <a href={`${localePath("/subscribe", locale === "en" ? "zh" : "en")}?from=${source}`} className="mt-1 inline-block text-[12px] text-accent underline underline-offset-4">{locale === "en" ? "Read in Chinese" : "改为英文日报"}</a>
              <EmailForm id="subscribe-page-email" source={source} email={email} setEmail={setEmail} phase={phase} formRef={formRef} onPhase={setPhase} buttonLabel="免费订阅日报" className="mt-4" />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-4"><Text value="每天一封，所选语言的日报就绪后发送。点击确认邮件后才会开始，每封都能一键退订。" /></p>
            </>}
          </div>
          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-y border-line py-4">
            {facts.map(([term, value]) => <div key={term}>
              <dt className="text-[11.5px] font-semibold tracking-[0.1em] text-accent">{term}</dt>
              <dd className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{value}</dd>
            </div>)}
          </dl>
        </section>
        <section aria-labelledby="sample-title">
          <h2 id="sample-title" className="mb-3 text-[13px] font-semibold text-ink-3">
            <Text value="你会收到的这封信" />{report && <span className="num"> · {report.key}</span>}
          </h2>
          {report ? (
            // The letter is dark in every theme (newsletter/mail.ts), so its preview is too.
            <div className="overflow-hidden rounded-panel border border-[rgb(244_236_220/.1)] bg-[var(--deck)] text-[var(--deck-ink)] shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-3 border-b border-[rgb(244_236_220/.1)] bg-[var(--deck-2)] px-4 py-3 text-[12.5px]">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[rgb(244_236_220/.08)] font-display text-[15px] italic text-[var(--brass-hi)]">e/</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--deck-ink)]">{SITE.name} <Text value="日报" /></span>
                  <span className="block truncate text-[var(--deck-dim)]">{report.lead?.title ?? report.title}</span>
                </span>
              </div>
              <img src="/media/art/mail-daily.jpg" alt="" width={1200} height={560} loading="lazy" decoding="async" className="block h-auto w-full" />
              <div className="px-5 pb-6 pt-5 sm:px-7">
                <h3 className="font-display text-[24px] leading-snug text-[var(--deck-ink)]">{report.lead?.title ?? report.title}</h3>
                {entries.length > 0 && <>
                  <p className="mt-5 border-b border-[rgb(217_164_65/.4)] pb-2 text-[12px] font-semibold tracking-[0.1em] text-[var(--brass)]">{tx("今天这 {0} 件事", entries.length)}</p>
                  <ol>
                    {entries.slice(0, PREVIEW_ROWS).map((item, index) => <li key={item.itemId ?? item.sourceUrl} className="flex gap-3 border-b border-[rgb(244_236_220/.1)] py-2.5">
                      <span className="num w-5 shrink-0 text-right text-[16px] font-black text-[var(--brass)]">{index + 1}</span>
                      <span className="min-w-0 text-[14px] leading-relaxed text-[var(--deck-ink)]">{item.title}</span>
                    </li>)}
                  </ol>
                  {entries.length > PREVIEW_ROWS && <p className="mt-3 text-[12.5px] text-[var(--deck-dim)]">{tx("另外 {0} 件，然后是每一条的全文", entries.length - PREVIEW_ROWS)}</p>}
                </>}
              </div>
            </div>
          ) : <p className="rounded-card border border-line bg-surface p-6 text-[14px] leading-relaxed text-ink-3"><Text value="首份日报准备中。你可以先浏览精选新闻，了解我们关注的内容。" /><Link to="/" className="mt-4 block text-accent"><Text value="浏览精选新闻" /> →</Link></p>}
          {report && <Link to={`/daily/${report.key}`} className="mt-4 inline-block text-[14px] font-semibold text-accent underline underline-offset-4"><Text value="阅读这期完整日报" /> →</Link>}
        </section>
      </div>
    </div>
  );
}
