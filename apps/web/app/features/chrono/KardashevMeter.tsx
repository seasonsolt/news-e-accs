import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// The civilization power meter along the foot of the front page's deck: today's Kardashev rating (from the
// chronicle's energy series, served with the time machine's bounds) on a rail from fire at 0 to a Type I
// civilization at 1.

import { chronicleHref } from "./TimeMachine";
import { useAt } from "./at";

const TICKS = Array.from({ length: 11 }, (_, i) => i / 10);

export function KardashevMeter({ k }: { k: number }) {
  const tx = useTranslate();
  const at = useAt();
  const at01 = Math.min(1, Math.max(0, k));
  return (
    <Link to={chronicleHref(at)} className="kardashev-meter" aria-label={tx("文明功率计：卡尔达肖夫指数 {0}", k.toFixed(3))}>
      <span className="kardashev-meter-track" aria-hidden="true">
        <span className="kardashev-meter-fill" style={{ width: `${at01 * 100}%` }} />
        {TICKS.map((t) => <span key={t} className={`kardashev-meter-tick ${t <= at01 ? "is-lit" : ""}`} style={{ left: `${t * 100}%` }} />)}
        <span className="kardashev-meter-needle" style={{ left: `${at01 * 100}%` }} />
      </span>
      <span className="kardashev-meter-scale" aria-hidden="true">
        <span><Text value="0 · 火" /></span>
        <span className="kardashev-meter-now" style={{ left: `${at01 * 100}%` }}>{k.toFixed(3)}<Text value="· 今天" /></span>
        <span><Text value="1 · I 型文明" /></span>
      </span>
    </Link>
  );
}
