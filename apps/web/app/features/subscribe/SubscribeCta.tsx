// One email field on the pages readers actually land on. Same double opt-in as /subscribe.
// The form is in the document (no client-only injection, no image) so it does not compete with LCP.
// The phone bar is mounted only after a reader has scrolled about 60%, and only on a phone.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useLocation } from "react-router";
import type { SubscribeSource } from "@aihot/contracts/subscribe";
import { Link } from "../../lib/navigation";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
import { dismissSubscribeBar, subscribeBarDismissed } from "../../lib/local-state";
import { isPhone } from "../../components/shell/screens";
import { claimSubscribeView, useSubscribeView } from "./useSubscribeView";
import { recordSubscribe, requestSubscribe } from "./flow";

type InlineSource = Extract<SubscribeSource, "daily_inline" | "chronicle_inline" | "story_inline">;
export type Phase = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

const FIELD = "h-12 w-full rounded-full border border-line bg-bg px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent";
const BUTTON = "inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-ink px-5 text-[15px] font-semibold text-bg transition-opacity disabled:opacity-60";

export function SubscribeCta({ source, sample, sticky = false, place }: {
  source: InlineSource;
  /** The narrow card in a column beside the piece (the daily's), rather than the block after it. */
  place?: "aside";
  /** A real past issue (or the daily archive) so the promise is concrete. */
  sample?: { to: string; date?: string };
  /** Phone-only bar after roughly 60% of the page has been scrolled. Dismiss is remembered on this device. */
  sticky?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useSubscribeView(formRef, source);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [email, setEmail] = useState("");
  const submitted = phase.kind === "sent";
  const aside = place === "aside";
  // Two forms of one source can share a page (the daily's column and its end), so ids carry the place.
  const id = aside ? `${source}-aside` : source;

  return (
    <>
      <section aria-labelledby={`subscribe-cta-${id}`} data-subscribe-cta={source} data-subscribe-place={place} className={aside ? "rounded-panel border border-accent/40 bg-surface p-5" : "mt-10 rounded-card border border-line bg-surface px-4 py-5 sm:px-6"}>
        {submitted ? (
          <Sent email={phase.email} />
        ) : (
          <>
            <h2 id={`subscribe-cta-${id}`} className={`font-display italic leading-tight text-ink ${aside ? "text-[24px]" : "text-[26px] sm:text-[30px]"}`}>
              <Text value={aside ? "每天早上，把这样一份日报发到你邮箱" : source === "daily_inline" ? "明早 08:00 把这样一份日报发到你邮箱" : "每天一封，跟上 AI 的重要变化"} />
            </h2>
            <p className={`mt-2 max-w-[62ch] leading-relaxed text-ink-3 ${aside ? "text-[13.5px]" : "text-[14.5px]"}`}>
              <Text value={aside ? "免费。点确认信之后才开始发送，每封都能一键退订。" : source === "daily_inline" ? "和上面这份一样：几件值得看的事。免费，点确认信之后才会开始发送，每封信都能一键退订。" : "模型发布、价格变化、算力进展，附原始来源。免费，确认后开始发送，随时一键退订。"} />
              {sample && <>{" "}<SampleLink sample={sample} /></>}
            </p>
            <EmailForm id={`subscribe-email-${id}`} source={source} email={email} setEmail={setEmail} phase={phase} formRef={formRef} onPhase={setPhase} className="mt-4" />
          </>
        )}
      </section>
      {sticky && !submitted && <StickyBar source={source} sample={sample} inline={formRef} />}
    </>
  );
}

function SampleLink({ sample }: { sample: { to: string; date?: string } }) {
  return (
    <Link to={sample.to} className="font-medium text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent">
      <Text value="看一份往期日报" />
      {sample.date ? <span className="num"> · {sample.date}</span> : null}
    </Link>
  );
}

export function Sent({ email }: { email: string }) {
  const tx = useTranslate();
  return (
    <div role="status">
      <h2 className="font-display text-[26px] italic leading-tight text-ink"><Text value="去邮箱点一下确认" /></h2>
      <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-3">{tx("确认邮件已经发到 {0}。点信里的「确认订阅」，就能在所选语言的日报就绪后收到邮件。没收到的话，看看「推广」和「垃圾邮件」。", email)}</p>
    </div>
  );
}

export function EmailForm({ id, source, email, setEmail, phase, formRef, onPhase, className = "", compact = false, buttonLabel = "订阅" }: {
  id: string;
  source: SubscribeSource;
  email: string;
  setEmail: (value: string) => void;
  phase: Phase;
  formRef?: RefObject<HTMLFormElement | null>;
  onPhase: (phase: Phase) => void;
  className?: string;
  /** One row, for the phone bar where a stacked field would cover the page. */
  compact?: boolean;
  buttonLabel?: string;
}) {
  const tx = useTranslate();
  const locale = useLocale();
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    recordSubscribe("subscribe_submit", source, locale);
    onPhase({ kind: "sending" });
    const error = await requestSubscribe(email, locale, source);
    if (error) {
      recordSubscribe("subscribe_error", source, locale, error.reason);
      onPhase({ kind: "error", message: error.detail });
      return;
    }
    recordSubscribe("subscribe_success", source, locale);
    onPhase({ kind: "sent", email: email.trim() });
  }
  return (
    <form ref={formRef} className={className} onSubmit={onSubmit}>
      <div className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <label htmlFor={id} className="sr-only"><Text value="邮箱地址" /></label>
        <input
          id={id}
          type="email"
          name="email"
          required
          autoComplete="email"
          autoCapitalize="off"
          inputMode="email"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={tx("输入邮箱")}
          className={`${FIELD} min-w-0 ${compact ? "flex-1" : "sm:flex-1"}`}
        />
        <button type="submit" disabled={phase.kind === "sending"} className={BUTTON}>
          {phase.kind === "sending" ? tx("确认中…") : tx(buttonLabel)}
        </button>
      </div>
      {phase.kind === "error" && <p role="alert" className="mt-2 text-[13.5px] text-hot">{tx(phase.message)}</p>}
    </form>
  );
}

/** Sits above the phone tab bar. Hidden while the inline form is on screen, and after the reader closes it. */
function StickyBar({ source, sample, inline }: { source: InlineSource; sample?: { to: string; date?: string }; inline: RefObject<HTMLFormElement | null> }) {
  const tx = useTranslate();
  const locale = useLocale();
  const pageKey = useLocation().pathname;
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (subscribeBarDismissed()) return;
    let frame = 0;
    let idle = 0;
    let stopped = false;
    const inlineVisible = () => {
      const node = inline.current;
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.bottom > 80 && rect.top < window.innerHeight - 80;
    };
    const update = () => {
      frame = 0;
      if (stopped || subscribeBarDismissed() || phase.kind === "sent") return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 80 ? window.scrollY / max : 0;
      setShown(isPhone() && progress >= 0.6 && !inlineVisible());
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const start = () => {
      if (stopped) return;
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
    };
    if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: 1500 });
    else start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [inline, phase.kind]);

  useEffect(() => {
    if (!shown || !claimSubscribeView(pageKey, "sticky_mobile", locale)) return;
    recordSubscribe("subscribe_view", "sticky_mobile", locale);
  }, [shown, pageKey, locale]);

  if (!shown) return null;
  return (
    <div
      data-subscribe-sticky="sticky_mobile"
      role="region"
      aria-label={tx("订阅日报")}
      className="fixed inset-x-3 bottom-[calc(62px+env(safe-area-inset-bottom))] z-30 rounded-card border border-line bg-surface/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur lg:hidden"
    >
      {phase.kind === "sent" ? (
        <div className="flex items-start gap-2">
          <p role="status" className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink-2">{tx("确认邮件已经发到 {0}。点信里的「确认订阅」，就能在所选语言的日报就绪后收到邮件。没收到的话，看看「推广」和「垃圾邮件」。", phase.email)}</p>
          <button type="button" aria-label={tx("关掉订阅提示")} onClick={() => setShown(false)} className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-bg-sunk hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      ) : (
      <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold leading-snug text-ink"><Text value="明早 08:00 发到你邮箱" /></p>
        <button
          type="button"
          aria-label={tx("关掉订阅提示")}
          onClick={() => {
            recordSubscribe("subscribe_dismiss", "sticky_mobile", locale);
            dismissSubscribeBar();
            setShown(false);
          }}
          className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-bg-sunk hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <EmailForm id={`subscribe-email-sticky-${source}`} source="sticky_mobile" email={email} setEmail={setEmail} phase={phase} compact onPhase={(next) => {
        if (next.kind === "sent") dismissSubscribeBar();
        setPhase(next);
      }} className="mt-2" />
      {sample && <p className="mt-1.5 text-[12.5px]"><SampleLink sample={sample} /></p>}
      </>
      )}
    </div>
  );
}
