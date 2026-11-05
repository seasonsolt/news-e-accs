import { beijingDate } from "@aihot/contracts/time";
import { featuredProduct } from "@aihot/industry/products";
import { Link } from "../../lib/navigation";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
import { localePath } from "../../lib/locale";
// Newsletter onboarding: a full-bleed, rounded film of the acceleration (public/media, rendered by
// tools/make-media.sh from ascent.ts, captioned with the era on screen) behind the site name, the sign-up, the manifesto and a way to skip straight to
// the news. /subscribe shows it as a page, and there it also confirms the
// link from the confirmation letter: the page confirms by script as it opens (mail scanners that fetch
// the link do not run it), with the button kept for a retry. Everything moving here is decoration and
// stops under prefers-reduced-motion.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SubscribeSource } from "@aihot/contracts/subscribe";
import type { ReportDetail, ReportLatestPage } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";

import { recordSubscribe, requestConfirm, requestSubscribe } from "../subscribe/flow";
import { useSubscribeView } from "../subscribe/useSubscribeView";
import { useMotionAllowed } from "../motion/preferences";
import { BrassSheen } from "../motion/BrassSheen";
import { DecryptedText } from "../motion/react-bits/DecryptedText";
import { Magnet } from "../motion/react-bits/Magnet";
import { ClickSpark } from "../motion/react-bits/ClickSpark";
import { TearTicket } from "../motion/react-bits/TearTicket";
import { ASCENT, ascentAt } from "./ascent";

const MANIFESTO: Array<[string, string]> = [
  ["加速是默认值", "算力、能源、模型能力都在复利增长。我们记录它，而不是害怕它。"],
  ["事实先于情绪", "每条精选都链接原文，写清是谁说的、说了什么；拿不准的，不写成定论。"],
  ["一天只看几条", "上百个信源每天吐出上千条消息。机器先筛、再打两次分，留下真正改变了什么的那几条。"],
  ["同一件事只看一次", "官网一篇、媒体十篇、X 上吵一天，归成一个事件；热度按独立来源算，不按转发算。"],
  ["对人和 Agent 一样开放", "网页、RSS、API、MCP 读的是同一份内容。免费，不用注册。"],
];

type Phase = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "confirmed" } | { kind: "error"; message: string };

/** /subscribe, where `token` (from the confirmation letter) is confirmed on arrival, with a button to try again. */
export function Onboarding({ token = null, source = "subscribe_page" }: { token?: string | null; source?: SubscribeSource }) {
  const tx = useTranslate();
  const locale = useLocale();
  const motionAllowed = useMotionAllowed();
  const video = useRef<HTMLVideoElement>(null);
  // The era on screen; the poster is the film's first plate, so the caption starts there too.
  const [era, setEra] = useState(0);
  const manifesto = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [email, setEmail] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [daily, setDaily] = useState<ReportDetail | null>(null);
  const confirming = !!token;
  useSubscribeView(formRef, source, !confirming);

  // No film URL in SSR: even preload="none" can fetch metadata, and play() competes with the LCP
  // poster. Wait for window load, decode the matching poster and give it a paint, then start at idle.
  // Returning readers and reduced motion never attach a source. React renders muted as a property,
  // so start the loop by hand, and resume only while the card and the tab are both visible.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const canPlay = () => motionAllowed && document.visibilityState === "visible";
    let loaded = document.readyState === "complete";
    let pending = false;
    let cancelled = false;
    let frame = 0;
    let idle = 0;
    let timer = 0;
    v.muted = true;
    const start = () => {
      pending = false;
      if (cancelled || !canPlay()) return;
      if (!v.hasAttribute("src")) v.src = window.matchMedia("(orientation: portrait)").matches ? "/media/ascent-historical-v2-9x16.mp4" : "/media/ascent-historical-v2-16x9.mp4";
      void v.play().catch(() => {});
    };
    const schedule = () => {
      if (!loaded || pending) return;
      pending = true;
      const poster = new Image();
      poster.src = window.matchMedia("(orientation: portrait)").matches ? "/media/ascent-historical-v2-9x16-poster.jpg" : "/media/ascent-historical-v2-16x9-poster.jpg";
      void poster.decode().catch(() => {}).then(() => {
        if (cancelled) return;
        // Two frames put an actual paint between image decoding and even an immediately idle page.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: 1500 });
            else timer = window.setTimeout(start, 200);
          });
        });
      });
    };
    const sync = () => {
      if (!canPlay()) v.pause();
      else if (v.hasAttribute("src")) void v.play().catch(() => {});
      else schedule();
    };
    const onLoad = () => { loaded = true; sync(); };
    const onTime = () => setEra(ascentAt(v.currentTime));
    v.addEventListener("timeupdate", onTime);
    window.addEventListener("load", onLoad, { once: true });
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
      v.removeEventListener("timeupdate", onTime);
      v.pause();
    };
  }, [motionAllowed]);

  async function subscribe(e: FormEvent) {
    e.preventDefault();
    recordSubscribe("subscribe_submit", source, locale);
    setPhase({ kind: "sending" });
    const error = await requestSubscribe(email, locale, source);
    if (error) {
      recordSubscribe("subscribe_error", source, locale, error.reason);
      return setPhase({ kind: "error", message: error.detail });
    }
    recordSubscribe("subscribe_success", source, locale);
    setPhase({ kind: "sent", email: email.trim() });
  }

  async function confirmToken() {
    setPhase({ kind: "sending" });
    const result = await requestConfirm(token ?? "");
    if ("reason" in result) {
      const error = result;
      recordSubscribe("subscribe_error", "subscribe_page", locale, error.reason);
      return setPhase({ kind: "error", message: error.detail });
    }
    setPhase({ kind: "confirmed" });
    void fetch(`/api/site/reports/daily/latest-page?lang=${result.language}`)
      .then(async (res) => res.ok ? (await res.json() as ReportLatestPage).report : null)
      .then(setDaily).catch(() => setDaily(null));
  }

  // Opening the letter's link is the reader's confirmation; confirming twice is harmless.
  useEffect(() => {
    if (token) void confirmToken();
  }, [token]);

  const toNews = (label: string, primary = false) => {
    const cls = primary
      ? "inline-flex h-11 items-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] px-7 text-[15px] font-semibold text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-[1.03]"
      : "text-[14px] text-[#f6ead2]/80 underline decoration-[#f6ead2]/30 underline-offset-4 transition-colors hover:text-[#f6ead2] hover:decoration-[#f6ead2]/70";
    return (
      <Link to="/" className={cls}>
        {label}
      </Link>
    );
  };

  return (
    <section
      aria-labelledby="onboarding-title"
      className={`relative isolate overflow-hidden rounded-[32px] bg-[#15110d] text-[#f6ead2] [clip-path:inset(0_round_32px)] lg:rounded-[48px] lg:[clip-path:inset(0_round_48px)] steam-hero-page mb-8`}
    >
      {/* clip-path, not just overflow + radius: the latter lets the spinning gears' layers poke through the corners. */}
      <div className="onboarding-poster absolute inset-0 -z-30" aria-hidden="true" />
      <video ref={video} className="absolute inset-0 -z-20 size-full object-cover" loop muted playsInline preload="none" aria-hidden="true" />
      <div className="steam-hero-shade absolute inset-0 -z-10" aria-hidden="true" />
      <Gear className="steam-gear steam-gear-a" teeth={14} />
      <Gear className="steam-gear steam-gear-b" teeth={10} />
      <div className="steam-puffs" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p key={era} className="onboarding-era" aria-hidden="true">{locale === "en" ? ASCENT[era]!.en : ASCENT[era]!.zh}</p>

      <div className="relative flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-5 pb-16 pt-12 text-center lg:gap-7">
        <p className="mono text-[11px] uppercase tracking-[0.32em] text-[#e8c98a]"><DecryptedText text={tx("e-acc.ai · 加速日报")} /></p>
        <h1 id="onboarding-title" aria-label={SITE.name} className="font-display text-[clamp(84px,17vw,200px)] italic leading-[0.9] tracking-[-0.02em] [text-shadow:0_2px_30px_rgba(0,0,0,0.55)]">
          <BrassSheen text={SITE.name} visible />
        </h1>

        {phase.kind === "sent" ? (
          <Notice title={tx("去邮箱点一下确认")} body={tx("确认邮件已经发到 {0}。点信里的「确认订阅」，就能在所选语言的日报就绪后收到邮件。没收到的话，看看「推广」和「垃圾邮件」。", phase.email)}>
            {toNews(tx("先去看看今天的新闻"), true)}
          </Notice>
        ) : phase.kind === "confirmed" ? (
          <>
            <Notice title={tx("订阅成功")} body={tx("所选语言的日报就绪后会送到你的邮箱，每一封信的末尾都可以一键退订。用 Gmail 的话，第一封日报如果在「推广」里，把它拖到「主要」，以后就都在收件箱最前面了。")}>
              {/* The latest issue in the confirmed language: what the first letter will look like. */}
              <div className="flex w-full flex-col items-center gap-4">
                {token && featuredProduct()?.url && <Link to={{ pathname: featuredProduct()!.url!, hash: `token=${encodeURIComponent(token)}` }} className="rounded-full border border-[#f6ead2]/40 px-5 py-3"><Text value="领取 4K 壁纸（送 100 积分）" /></Link>}
                {daily && (
                  <div className="w-full rounded-[20px] border border-[#f6ead2]/25 bg-[#1a120a]/45 px-5 py-4 text-left backdrop-blur-md">
                    <p className="mono text-[11px] uppercase tracking-[0.2em] text-[#e8c98a]"><Text value="最近一期日报" /> · {daily.key}</p>
                    <p className="mt-1.5 text-[17px] font-semibold leading-snug">{daily.lead?.title ?? daily.title}</p>
                    <ul className="mt-2 space-y-1.5 text-[14px] leading-snug text-[#f6ead2]/80">
                      {daily.highlights.slice(0, 3).map((item, i) => <li key={i}>· {item.title}</li>)}
                    </ul>
                  </div>
                )}
                <Link
                  to={daily ? `/daily/${daily.key}` : "/daily"}
                  className="inline-flex h-11 items-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] px-7 text-[15px] font-semibold text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-[1.03]"
                >
                  {tx("阅读这期日报")}
                </Link>
              </div>
            </Notice>
            <TearTicket date={beijingDate(Date.now())} />
          </>
        ) : confirming ? (
          <div className="flex w-full max-w-md flex-col items-center gap-4">
            <p className="text-[17px] font-medium text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]"><Text value="最后一步：确认订阅" />{SITE.name}<Text value="日报。" /></p>
            <button
              type="button"
              onClick={confirmToken}
              disabled={phase.kind === "sending"}
              className="inline-flex h-12 items-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] px-9 text-[16px] font-semibold text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60"
            >
              {phase.kind === "sending" ? tx("确认中…") : tx("确认订阅")}
            </button>
            {phase.kind === "error" && <p role="alert" className="text-[14px] text-[#ffb89a] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">{tx(phase.message)}</p>}
          </div>
        ) : (
          <>
            <form ref={formRef} className="relative w-full max-w-md" onSubmit={subscribe}>
              <label htmlFor="onboarding-email" className="sr-only"><Text value="邮箱地址" /></label>
              <input
                id="onboarding-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                autoCapitalize="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tx("输入邮箱，每天早上收到日报")}
                className="h-12 w-full rounded-full border-2 border-[#f6ead2]/45 bg-[#1a120a]/35 pl-5 pr-14 text-[15px] text-[#f6ead2] shadow-sm backdrop-blur-md transition-[border-color,background-color] duration-200 placeholder:text-[#f6ead2]/75 focus:border-[#e8b85a] focus:bg-[#1a120a]/55 focus:outline-none"
              />
              <ClickSpark className="absolute right-1 top-1/2 size-10 -translate-y-1/2">
                <button
                  type="submit"
                  aria-label={tx("订阅")}
                  disabled={phase.kind === "sending"}
                  className="relative flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-105 focus-visible:outline-[#f6ead2] disabled:opacity-60"
                >
                  <Magnet>
                    {phase.kind === "sending" ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-[#1a1208]/30 border-t-[#1a1208]" aria-hidden="true" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    )}
                  </Magnet>
                </button>
              </ClickSpark>
            </form>
            {phase.kind === "error" && <p role="alert" className="-mt-2 text-[14px] text-[#ffb89a] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">{tx(phase.message)}</p>}

            <p className="max-w-xl text-pretty text-[16px] font-medium leading-[1.45] text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)] lg:text-[19px]"><Text value="每天一封 AI 圈值得看的几件事：模型发布、价格变动、算力扩张。免费，随时一键退订。" /></p>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => manifesto.current?.showModal()} className="steam-shine relative h-10 overflow-hidden rounded-full border border-[#f6ead2]/35 bg-[#f6ead2]/12 px-8 text-[14px] font-semibold text-[#f6ead2] backdrop-blur-md transition-colors hover:bg-[#f6ead2]/20"><Text value="宣言 Manifesto" /></button>
            </div>
            <div className="mt-2">{toNews(tx("先不订阅，直接看新闻 →"))}</div>
          </>
        )}
      </div>

      <dialog
        ref={manifesto}
        aria-labelledby="manifesto-title"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="steam-manifesto m-auto w-[min(92vw,560px)] rounded-sheet border border-line bg-surface p-0 text-left text-ink shadow-pop backdrop:bg-[#0d0906]/70 backdrop:backdrop-blur-sm"
      >
        <div className="px-6 pb-6 pt-7 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id="manifesto-title" className="font-display text-[44px] italic leading-none text-ink">
              Manifesto
            </h2>
            <button type="button" onClick={() => manifesto.current?.close()} aria-label={tx("关闭")} className="-mr-2 flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-bg-sunk hover:text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <ol className="mt-5 space-y-4">
            {MANIFESTO.map(([head, body], i) => (
              <li key={head} className="flex gap-4">
                <span className="w-9 shrink-0 font-display text-[26px] italic leading-none text-accent">{["I", "II", "III", "IV", "V"][i]}</span>
                <div>
                  <div className="text-[15.5px] font-semibold text-ink">{tx(head)}</div>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-3">{tx(body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-4 text-[13px] text-ink-4"><Text value="什么是 e/acc：" /><a href={localePath("/what-is-eacc", locale)} className="text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent">
              {`e-acc.ai${localePath("/what-is-eacc", locale)}`}
            </a>
          </p>
        </div>
      </dialog>
    </section>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex max-w-md flex-col items-center gap-4">
      <div className="text-[22px] font-bold [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{title}</div>
      <p className="text-pretty text-[16px] leading-[1.6] text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]"><Text value={body} /></p>
      {children}
    </div>
  );
}

/** A brass gear outline for the corners; `teeth` sets how coarse it looks. */
function Gear({ className, teeth }: { className: string; teeth: number }) {
  const r = 44;
  const dash = (2 * Math.PI * r) / teeth / 2;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${dash} ${dash}`} />
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="5" />
      {[0, 60, 120].map((a) => (
        <path key={a} d="M50 16v68" stroke="currentColor" strokeWidth="4" transform={`rotate(${a} 50 50)`} />
      ))}
    </svg>
  );
}
