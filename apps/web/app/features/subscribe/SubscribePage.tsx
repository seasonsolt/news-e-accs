import { useRef, useState } from "react";
import type { ReportDetail } from "@aihot/contracts/site";
import type { SubscribeSource } from "@aihot/contracts/subscribe";
import { Link } from "../../lib/navigation";
import { Text, useLocale } from "../../lib/i18n";
import { localePath } from "../../lib/locale";
import { EmailForm, Sent, type Phase } from "./SubscribeCta";
import { useSubscribeView } from "./useSubscribeView";

export function SubscribePage({ report, source }: { report: ReportDetail | null; source: SubscribeSource }) {
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  useSubscribeView(formRef, source);
  const seen = new Set<string>();
  const entries = report ? [...report.highlights, ...report.sections.flatMap((s) => s.items), ...report.flashes]
    .filter((item) => {
      const key = item.itemId ?? item.sourceUrl;
      if (!item.available || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3) : [];
  return (
    <div className="mx-auto max-w-6xl py-8 sm:py-12 lg:py-16">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <section className="lg:sticky lg:top-28">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">e/acc · <Text value="每日 AI 简报" /></p>
          <h1 className="mt-5 font-display text-[38px] leading-[1.15] tracking-tight text-ink sm:text-[48px]"><Text value="每天几分钟，看懂 AI 的重要变化" /></h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-3"><Text value="模型发布、价格变化、算力进展。把值得关注的几件事和原始来源，整理成一封邮件。" /></p>
          <ul className="mt-6 space-y-3 text-[14px] text-ink-2">
            {["先看关键变化，再决定深入读什么", "同一事件归在一起，减少重复阅读", "附原文链接，方便核对与继续阅读"].map((text) => <li key={text} className="flex gap-3"><span aria-hidden="true" className="text-accent">✓</span><Text value={text} /></li>)}
          </ul>
          <div className="mt-8 rounded-card border border-line bg-surface p-5 sm:p-6" data-subscribe-page-form>
            {phase.kind === "sent" ? <Sent email={phase.email} /> : <>
              <p className="text-[13px] font-medium text-ink"><Text value={locale === "en" ? "你将收到英文日报" : "你将收到中文日报"} /></p>
              <a href={`${localePath("/subscribe", locale === "en" ? "zh" : "en")}?from=${source}`} className="mt-1 inline-block text-[12px] text-accent underline underline-offset-4">{locale === "en" ? "Read in Chinese" : "改为英文日报"}</a>
              <EmailForm id="subscribe-page-email" source={source} email={email} setEmail={setEmail} phase={phase} formRef={formRef} onPhase={setPhase} buttonLabel="免费订阅日报" className="mt-4" />
              <p className="mt-3 text-[12px] leading-relaxed text-ink-4"><Text value="每天一封，所选语言的日报就绪后发送。点击确认邮件后才会开始，每封都能一键退订。" /></p>
            </>}
          </div>
        </section>
        <section aria-labelledby="sample-title" className="rounded-card border border-line bg-surface p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
            <h2 id="sample-title" className="text-[12px] font-semibold uppercase tracking-widest text-accent"><Text value="先看一份真实日报" /></h2>
            {report && <span className="num text-[12px] text-ink-4">{report.key}</span>}
          </div>
          {report ? <>
            <h3 className="mt-5 font-display text-[25px] leading-snug text-ink">{report.lead?.title ?? report.title}</h3>
            {(report.lead?.leadParagraph || report.overview) && <p className="mt-3 text-[14px] leading-relaxed text-ink-3">{report.lead?.leadParagraph ?? report.overview}</p>}
            <ol className="mt-5 divide-y divide-line">
              {entries.map((item, index) => <li key={item.itemId ?? item.sourceUrl} className="py-5">
                <p className="num text-[11px] text-accent">0{index + 1} · {item.sourceName}</p>
                <h4 className="mt-2 text-[16px] font-semibold leading-relaxed text-ink">{item.title}</h4>
                {item.summary && <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-3">{item.summary}</p>}
              </li>)}
            </ol>
            <Link to={`/daily/${report.key}`} className="mt-4 inline-block text-[14px] font-semibold text-accent underline underline-offset-4"><Text value="阅读这期完整日报" /> →</Link>
          </> : <p className="py-8 text-[14px] leading-relaxed text-ink-3"><Text value="首份日报准备中。你可以先浏览精选新闻，了解我们关注的内容。" /><Link to="/" className="mt-4 block text-accent"><Text value="浏览精选新闻" /> →</Link></p>}
        </section>
      </div>
    </div>
  );
}
