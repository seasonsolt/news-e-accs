import type { PublishedDepth } from "../contracts.ts";

export default function Depth({ data }: { data: unknown }) {
  const depth = data as PublishedDepth;
  const d = depth.content;
  const source = (id: string) => <a className="text-accent underline" href={`/items/${encodeURIComponent(id)}`}>{depth.sources.find((s) => s.id === id)?.name ?? "Source report"}</a>;
  return <section lang="en" aria-labelledby="story-depth-title" className="card space-y-5 p-5 lg:p-6">
    <header><h2 id="story-depth-title" className="text-[20px] font-semibold">In depth</h2>
      <p className="mt-1 text-xs text-ink-4">AI drafted · Human reviewed · <time dateTime={depth.publishedAt}>{depth.publishedAt.slice(0, 10)}</time></p></header>
    <div><h3 className="font-semibold">Background</h3><p className="mt-2 whitespace-pre-line leading-relaxed">{d.background}</p></div>
    <div><h3 className="font-semibold">Key numbers</h3>{d.numbers.length ? <ul className="mt-2 space-y-3">{d.numbers.map((n, i) => <li key={i}><strong>{n.value}</strong> — {n.context} <span className="text-sm">({source(n.reportId)})</span></li>)}</ul> : <p className="mt-2 text-ink-3">No figures established by the available reports.</p>}</div>
    <div><h3 className="font-semibold">Reactions</h3>{d.reactions.length ? <ul className="mt-2 space-y-3">{d.reactions.map((r, i) => <li key={i}><strong>{r.who}</strong>: {r.text} <span className="text-sm">({source(r.reportId)})</span></li>)}</ul> : <p className="mt-2 text-ink-3">No reactions established by the available reports.</p>}</div>
    <div><h3 className="font-semibold">What it accelerates</h3><p className="mt-2 whitespace-pre-line leading-relaxed">{d.accelerates}</p></div>
    {d.curve && <div><h3 className="font-semibold">Which curve it pushes</h3><a className="mt-2 inline-block text-accent underline" href={d.curve.path}>{d.curve.label}</a></div>}
  </section>;
}
