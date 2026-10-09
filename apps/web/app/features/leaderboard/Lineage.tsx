import { useTranslate } from "../../lib/i18n";
// Coding evidence changes hands like a telegraph relay: three brass rules draw in sequence on its
// first below-fold reveal. All names, dates and notes are final in SSR, and initially visible content
// stays untouched. The decorative rules do not affect card sizes, phone stacking or accessible text.
import { useEffect, useRef } from "react";
import type { LbSourceGroup } from "@aihot/contracts/leaderboard";
import { useMotionAllowed } from "../motion/preferences";
import { runFrames, useInViewOnce } from "../motion/viewport";

export function Lineage({ group }: { group: LbSourceGroup }) {
  const tx = useTranslate();
  const ref = useRef<HTMLOListElement>(null);
  const played = useRef(false);
  const allowed = useMotionAllowed();
  const seen = useInViewOnce(ref, { enabled: allowed, skipInitial: true });
  useEffect(() => {
    const element = ref.current;
    if (!element || !allowed || !seen || played.current) return;
    played.current = true;
    const rules = Array.from(element.querySelectorAll<HTMLElement>("[data-lineage-rule]"));
    return runFrames(element, 900, (progress) => {
      rules.forEach((rule, i) => { rule.style.transform = `scaleX(${Math.max(0, Math.min(1, progress * rules.length - i))})`; });
    });
  }, [allowed, seen]);
  return (
    <ol ref={ref} className="mt-4 grid gap-2 sm:grid-cols-3" aria-label={tx("{0}评测的权威更替", group.name)}>
      {group.lineage.map((step, i) => (
        <li key={step.name} className={`relative rounded-xl border px-4 py-3 ${step.current ? "border-accent/50 bg-surface" : "border-line"}`}>
          <span aria-hidden="true" data-lineage-rule="" className="pointer-events-none absolute inset-x-4 bottom-0 h-px origin-left bg-amber/50" />
          <span className="flex items-baseline justify-between gap-2">
            <span className={`text-[13.5px] font-semibold ${step.current ? "text-accent" : "text-ink-3"}`}>
              {i > 0 && <span className="mr-1.5 text-ink-4" aria-hidden="true">→</span>}
              {step.name}
            </span>
            <span className="mono shrink-0 text-[11px] text-ink-4">{step.current ? tx("{0} · 主力", step.period) : step.period}</span>
          </span>
          <span className="mt-1 block text-[12px] leading-[1.65] text-ink-4">{step.note}</span>
        </li>
      ))}
    </ol>
  );
}
