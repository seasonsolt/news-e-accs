// Newsletter onboarding: a full-bleed, rounded steampunk film loop (public/media, rendered by
// tools/make-media.sh) behind the site name, the sign-up, the manifesto and a way to skip straight to
// the news. On a first visit to the front page it covers the screen (html[data-onboarding], set before
// paint by ONBOARDING_BOOT_SCRIPT); /subscribe shows it as a page, and there it also confirms the
// link from the confirmation letter: the page confirms by script as it opens (mail scanners that fetch
// the link do not run it), with the button kept for a retry. Everything moving here is decoration and
// stops under prefers-reduced-motion.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SITE } from "@aihot/industry/site";
import { Link } from "react-router";
import { markOnboarded } from "../../lib/local-state";
import { useMotionAllowed } from "../motion/preferences";
import { BrassSheen } from "../motion/BrassSheen";
import { DecryptedText } from "../motion/react-bits/DecryptedText";
import { Magnet } from "../motion/react-bits/Magnet";
import { ClickSpark } from "../motion/react-bits/ClickSpark";
import { TearTicket } from "../motion/react-bits/TearTicket";

const MANIFESTO: Array<[string, string]> = [
  ["加速是默认值", "算力、能源、模型能力都在复利增长。我们记录它，而不是害怕它。"],
  ["事实先于情绪", "每条精选都链接原文，写清是谁说的、说了什么；拿不准的，不写成定论。"],
  ["一天只看几条", "上百个信源每天吐出上千条消息。机器先筛、再打两次分，留下真正改变了什么的那几条。"],
  ["同一件事只看一次", "官网一篇、媒体十篇、X 上吵一天，归成一个事件；热度按独立来源算，不按转发算。"],
  ["对人和 Agent 一样开放", "网页、RSS、API、MCP 读的是同一份内容。免费，不用注册。"],
];

type Phase = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "confirmed" } | { kind: "error"; message: string };

async function post(path: string, body: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const problem = await res.json().catch(() => ({}));
    return typeof problem.detail === "string" ? problem.detail : "暂时无法完成，请稍后再试。";
  } catch {
    return "网络好像断了，请稍后再试。";
  }
}

/**
 * `overlay`: the front page's first-visit screen, closed by subscribing or skipping. `page`: /subscribe,
 * where `token` (from the confirmation letter) is confirmed on arrival, with a button to try again.
 */
export function Onboarding({ mode, token = null }: { mode: "overlay" | "page"; token?: string | null }) {
  const motionAllowed = useMotionAllowed();
  const video = useRef<HTMLVideoElement>(null);
  const manifesto = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [email, setEmail] = useState("");
  // Whether this is on screen; until then the film has no poster either, so nothing is downloaded.
  const [shown, setShown] = useState(mode === "page");

  // The film and its poster load only while this is on screen (preload="none"): a reader who already
  // chose never downloads them. React renders `muted` as a property, not the attribute autoplay policies look at, so
  // the loop is started by hand, and again when a tab opened in the background comes forward.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const visible = () => mode === "page" || document.documentElement.hasAttribute("data-onboarding");
    v.muted = true;
    const sync = () => {
      setShown(visible());
      if (!visible() || !motionAllowed || document.visibilityState !== "visible") v.pause();
      else void v.play().catch(() => {});
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-onboarding"] });
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      v.pause();
    };
  }, [mode, motionAllowed]);

  // Escape skips the overlay, as a dialog's close would.
  useEffect(() => {
    if (mode !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.documentElement.hasAttribute("data-onboarding") && !manifesto.current?.open) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  function close() {
    markOnboarded();
    video.current?.pause();
  }

  async function subscribe(e: FormEvent) {
    e.preventDefault();
    setPhase({ kind: "sending" });
    const error = await post("/api/site/newsletter/subscribe", { email });
    if (error) return setPhase({ kind: "error", message: error });
    setPhase({ kind: "sent", email: email.trim() });
    markOnboarded();
  }

  async function confirmToken() {
    setPhase({ kind: "sending" });
    const error = await post("/api/site/newsletter/confirm", { token: token ?? "" });
    if (error) return setPhase({ kind: "error", message: error });
    setPhase({ kind: "confirmed" });
    markOnboarded();
  }

  // Opening the letter's link is the reader's confirmation; confirming twice is harmless.
  useEffect(() => {
    if (mode === "page" && token) void confirmToken();
  }, [mode, token]);

  // Leaving for the news: the overlay just closes; the page links home.
  const toNews = (label: string, primary = false) => {
    const cls = primary
      ? "inline-flex h-11 items-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] px-7 text-[15px] font-semibold text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-[1.03]"
      : "text-[14px] text-[#f6ead2]/80 underline decoration-[#f6ead2]/30 underline-offset-4 transition-colors hover:text-[#f6ead2] hover:decoration-[#f6ead2]/70";
    return mode === "overlay" ? (
      <button type="button" onClick={close} className={cls}>
        {label}
      </button>
    ) : (
      <Link to="/" onClick={() => markOnboarded()} className={cls}>
        {label}
      </Link>
    );
  };

  const confirming = mode === "page" && !!token;
  // The front page's own h1 is the news; the overlay's name is a second-level heading there.
  const Title = mode === "page" ? "h1" : "h2";
  const card = (
    <section
      aria-labelledby={`onboarding-title-${mode}`}
      className={`relative isolate overflow-hidden rounded-[32px] bg-[#15110d] text-[#f6ead2] [clip-path:inset(0_round_32px)] lg:rounded-[48px] lg:[clip-path:inset(0_round_48px)] ${mode === "overlay" ? "h-full" : "steam-hero-page mb-8"}`}
    >
      {/* clip-path, not just overflow + radius: the latter lets the spinning gears' layers poke through the corners. */}
      <video ref={video} className="absolute inset-0 -z-20 size-full object-cover" poster={shown ? "/media/hero-16x9-poster.jpg" : undefined} loop muted playsInline preload="none" aria-hidden="true">
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

      <div className="relative flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-5 pb-16 pt-12 text-center lg:gap-7">
        <p className="mono text-[11px] uppercase tracking-[0.32em] text-[#e8c98a]"><DecryptedText text="e-acc.ai · 加速日报" /></p>
        <Title id={`onboarding-title-${mode}`} aria-label={SITE.name} className="font-display text-[clamp(84px,17vw,200px)] italic leading-[0.9] tracking-[-0.02em] [text-shadow:0_2px_30px_rgba(0,0,0,0.55)]">
          <BrassSheen text={SITE.name} visible={shown} />
        </Title>

        {phase.kind === "sent" ? (
          <Notice title="去邮箱点一下确认" body={`确认邮件已经发到 ${phase.email}。点信里的「确认订阅」，明早 8 点就能收到第一期日报。没收到的话，看看「推广」和「垃圾邮件」。`}>
            {toNews("先去看看今天的新闻", true)}
          </Notice>
        ) : phase.kind === "confirmed" ? (
          <>
            <Notice title="订阅成功" body="每天早上 8 点，日报会准时出现在你的邮箱，每一封信的末尾都可以一键退订。用 Gmail 的话，第一封日报如果在「推广」里，把它拖到「主要」，以后就都在收件箱最前面了。">
              {toNews("去看今天的新闻", true)}
            </Notice>
            <TearTicket date={new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} />
          </>
        ) : confirming ? (
          <div className="flex w-full max-w-md flex-col items-center gap-4">
            <p className="text-[17px] font-medium text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">最后一步：确认订阅 {SITE.name} 日报。</p>
            <button
              type="button"
              onClick={confirmToken}
              disabled={phase.kind === "sending"}
              className="inline-flex h-12 items-center rounded-full bg-gradient-to-br from-[#f0c56a] via-[#d9a441] to-[#9a5b1f] px-9 text-[16px] font-semibold text-[#1a1208] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60"
            >
              {phase.kind === "sending" ? "确认中…" : "确认订阅"}
            </button>
            {phase.kind === "error" && <p role="alert" className="text-[14px] text-[#ffb89a] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">{phase.message}</p>}
          </div>
        ) : (
          <>
            <form className="relative w-full max-w-md" onSubmit={subscribe}>
              <label htmlFor={`onboarding-email-${mode}`} className="sr-only">
                邮箱地址
              </label>
              <input
                id={`onboarding-email-${mode}`}
                type="email"
                name="email"
                required
                autoComplete="email"
                autoCapitalize="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="输入邮箱，每天早上收到日报"
                className="h-12 w-full rounded-full border-2 border-[#f6ead2]/45 bg-[#1a120a]/35 pl-5 pr-14 text-[15px] text-[#f6ead2] shadow-sm backdrop-blur-md transition-[border-color,background-color] duration-200 placeholder:text-[#f6ead2]/75 focus:border-[#e8b85a] focus:bg-[#1a120a]/55 focus:outline-none"
              />
              <ClickSpark className="absolute right-1 top-1/2 size-10 -translate-y-1/2">
                <button
                  type="submit"
                  aria-label="订阅"
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
            {phase.kind === "error" && <p role="alert" className="-mt-2 text-[14px] text-[#ffb89a] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">{phase.message}</p>}

            <p className="max-w-xl text-pretty text-[16px] font-medium leading-[1.45] text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)] lg:text-[19px]">
              每天早上 8 点，一封 AI 圈值得看的几件事：模型发布、价格变动、算力扩张。免费，随时一键退订。
            </p>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => manifesto.current?.showModal()} className="steam-shine relative h-10 overflow-hidden rounded-full border border-[#f6ead2]/35 bg-[#f6ead2]/12 px-8 text-[14px] font-semibold text-[#f6ead2] backdrop-blur-md transition-colors hover:bg-[#f6ead2]/20">
                宣言 Manifesto
              </button>
            </div>
            <div className="mt-2">{toNews("先不订阅，直接看新闻 →")}</div>
          </>
        )}
      </div>

      <dialog
        ref={manifesto}
        aria-labelledby={`manifesto-title-${mode}`}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="steam-manifesto m-auto w-[min(92vw,560px)] rounded-sheet border border-line bg-surface p-0 text-left text-ink shadow-pop backdrop:bg-[#0d0906]/70 backdrop:backdrop-blur-sm"
      >
        <div className="px-6 pb-6 pt-7 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`manifesto-title-${mode}`} className="font-display text-[44px] italic leading-none text-ink">
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
    </section>
  );

  // The overlay is always rendered and shown by CSS, so the first frame is already right.
  return mode === "overlay" ? (
    <div className="onboarding-overlay fixed inset-0 z-[80] bg-[#15110d] p-2 sm:p-3" role="dialog" aria-modal="true" aria-labelledby="onboarding-title-overlay">
      {card}
    </div>
  ) : (
    card
  );
}

function Notice({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex max-w-md flex-col items-center gap-4">
      <div className="text-[22px] font-bold [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{title}</div>
      <p className="text-pretty text-[16px] leading-[1.6] text-[#f6ead2]/92 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{body}</p>
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
