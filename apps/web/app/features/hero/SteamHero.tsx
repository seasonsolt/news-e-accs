// The homepage masthead: a full-bleed, rounded steampunk film loop (public/media, rendered by
// tools/make-media.sh) behind the site name, the newsletter sign-up and the manifesto. Everything
// moving here is decoration and stops under prefers-reduced-motion.
import { useEffect, useRef } from "react";
import { SITE } from "@aihot/industry/site";
import { Link } from "react-router";

/** The e/acc weekly on Buttondown (the same list e-acc.ai signs people up to). */
const SUBSCRIBE_ACTION = "https://buttondown.com/api/emails/embed-subscribe/SAC-1988";

const MANIFESTO: Array<[string, string]> = [
  ["加速是默认值", "算力、能源、模型能力都在复利增长。我们记录它，而不是害怕它。"],
  ["事实先于情绪", "每条精选都链接原文，写清是谁说的、说了什么；拿不准的，不写成定论。"],
  ["一天只看几条", "上百个信源每天吐出上千条消息。机器先筛、再打两次分，留下真正改变了什么的那几条。"],
  ["同一件事只看一次", "官网一篇、媒体十篇、X 上吵一天，归成一个事件；热度按独立来源算，不按转发算。"],
  ["对人和 Agent 一样开放", "网页、RSS、API、MCP 读的是同一份内容。免费，不用注册。"],
];

export function SteamHero() {
  const video = useRef<HTMLVideoElement>(null);
  const manifesto = useRef<HTMLDialogElement>(null);

  // React renders `muted` as a property, not the attribute autoplay policies look at, so start the
  // loop by hand, and again when a tab opened in the background comes forward (browsers hold back
  // media there). Readers who asked for less motion keep the poster.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (still.matches) v.pause();
      else if (document.visibilityState === "visible") void v.play().catch(() => {});
    };
    sync();
    still.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      still.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <>
      {/* clip-path, not just overflow + radius: the latter lets the spinning gears' layers poke through the corners. */}
      <section aria-labelledby="hero-title" className="steam-hero relative isolate mb-8 overflow-hidden rounded-[32px] bg-[#15110d] text-[#f6ead2] [clip-path:inset(0_round_32px)] lg:rounded-[48px] lg:[clip-path:inset(0_round_48px)]">
        <video
          ref={video}
          className="absolute inset-0 -z-20 size-full object-cover"
          poster="/media/hero-16x9-poster.jpg"
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          <source media="(orientation: portrait)" src="/media/hero-9x16.mp4" type="video/mp4" />
          <source src="/media/hero-16x9.mp4" type="video/mp4" />
        </video>
        <div className="steam-hero-shade absolute inset-0 -z-10" aria-hidden="true" />
        <Gear className="steam-gear steam-gear-a" teeth={14} />
        <Gear className="steam-gear steam-gear-b" teeth={10} />
        <div className="steam-puffs" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="relative flex h-full flex-col items-center justify-center gap-5 px-5 pb-20 pt-12 text-center lg:gap-7">
          <p className="mono text-[11px] uppercase tracking-[0.32em] text-[#e8c98a]">news.e-accs.com · 加速日报</p>
          <h1 id="hero-title" className="font-display text-[clamp(84px,17vw,200px)] italic leading-[0.9] tracking-[-0.02em] [text-shadow:0_2px_30px_rgba(0,0,0,0.55)]">
            {SITE.name}
          </h1>

          <form className="relative w-full max-w-md" action={SUBSCRIBE_ACTION} method="post" target="_blank">
            <label htmlFor="hero-email" className="sr-only">
              邮箱地址
            </label>
            <input
              id="hero-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              autoCapitalize="off"
              placeholder="输入邮箱，订阅 e/acc 周报"
              className="h-12 w-full rounded-full border-2 border-[#f6ead2]/45 bg-[#1a120a]/35 pl-5 pr-14 text-[15px] text-[#f6ead2] shadow-sm backdrop-blur-md transition-[border-color,background-color] duration-200 placeholder:text-[#f6ead2]/75 focus:border-[#e8b85a] focus:bg-[#1a120a]/55 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="订阅"
              className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-105 focus-visible:outline-[#f6ead2]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>

          <p className="max-w-xl text-pretty text-[16px] font-medium leading-[1.45] text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)] lg:text-[19px]">
            每周一封：这一周，AI 又加速了什么。每天的精选、热点和日报就在下面，免费，不用注册。
          </p>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => manifesto.current?.showModal()} className="steam-shine relative h-10 overflow-hidden rounded-full border border-[#f6ead2]/35 bg-[#f6ead2]/12 px-8 text-[14px] font-semibold text-[#f6ead2] backdrop-blur-md transition-colors hover:bg-[#f6ead2]/20">
              宣言 Manifesto
            </button>
            <Link to="/daily" prefetch="intent" className="h-10 rounded-full border border-[#f6ead2]/20 px-6 text-[14px] font-semibold leading-[38px] text-[#f6ead2]/90 backdrop-blur-md transition-colors hover:bg-[#f6ead2]/10">
              今日日报
            </Link>
          </div>
        </div>

        <a href="#feed" className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-[12px] text-[#f6ead2]/80 transition-colors hover:text-[#f6ead2] lg:bottom-7">
          往下看今日热点
          <svg className="steam-bob" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </section>

      <dialog
        ref={manifesto}
        aria-labelledby="manifesto-title"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="steam-manifesto m-auto w-[min(92vw,560px)] rounded-sheet border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[#0d0906]/70 backdrop:backdrop-blur-sm"
      >
        <div className="px-6 pb-6 pt-7 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id="manifesto-title" className="font-display text-[44px] italic leading-none text-ink">
              Manifesto
            </h2>
            <button type="button" onClick={() => manifesto.current?.close()} aria-label="关闭" className="-mr-2 flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-bg-sunk hover:text-ink">
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
                  <div className="text-[15.5px] font-semibold text-ink">{head}</div>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-3">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-4 text-[13px] text-ink-4">
            什么是 e/acc：
            <a href="https://e-acc.ai/what-is-eacc" className="text-accent underline decoration-accent/35 underline-offset-[3px] hover:decoration-accent">
              e-acc.ai/what-is-eacc
            </a>
          </p>
        </div>
      </dialog>
    </>
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
