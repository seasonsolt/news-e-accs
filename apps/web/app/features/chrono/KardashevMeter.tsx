// The civilization power meter on the front page's deck: today's Kardashev rating (from the chronicle's
// energy series, served with the time machine's bounds) against a Type I civilization at 1.
import { Link } from "react-router";
import { chronicleHref } from "./TimeMachine";
import { useAt } from "./at";

export function KardashevMeter({ k }: { k: number }) {
  const at = useAt();
  // Type I commands about 1e16 W; a rating k means 10^(10k + 6) W.
  const gap = 10 ** (10 * (1 - k));
  return (
    <Link to={chronicleHref(at)} className="kardashev-meter" aria-label={`文明功率计：卡尔达肖夫指数 ${k.toFixed(3)}`}>
      <span className="kardashev-meter-head">
        <span>文明功率计</span>
        <span className="font-mono">卡尔达肖夫指数</span>
      </span>
      <span className="kardashev-meter-reading">
        <span className="deck-figure kardashev-meter-figure">{k.toFixed(3)}</span>
        <span className="kardashev-meter-of">/ 1.000</span>
      </span>
      <span className="kardashev-meter-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(1, Math.max(0, k)) * 100}%` }} />
      </span>
      <span className="kardashev-meter-scale" aria-hidden="true">
        <span>0 · 火</span>
        <span>{k.toFixed(2)} · 今天</span>
        <span>1 · I 型文明</span>
      </span>
      <span className="kardashev-meter-note">离 I 型文明还差约 {Math.round(gap / 10) * 10} 倍。</span>
    </Link>
  );
}
