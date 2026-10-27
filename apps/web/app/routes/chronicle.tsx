import { Link, useNavigate } from "../lib/navigation";
import { localeFromMatches, Text, useLocale, useTranslate } from "../lib/i18n";
import { localePath } from "../lib/locale";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { data, useLoaderData, useLocation, useRouteLoaderData, type ShouldRevalidateFunction } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { AXIS_FUTURE_YEARS, BIG_BANG, decimalYear, eraAt, timeLabel, yearToDate, type ChronicleResponse } from "@aihot/contracts/chronicle";
import type { Route } from "./+types/chronicle";
import type { loader as rootLoader } from "../root";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { IconArrowRight, IconHourglass } from "../components/icons";
import { Capabilities } from "../features/chrono/Capabilities";
import { ChronicleAxis } from "../features/chrono/ChronicleAxis";
import { CivilizationGauges } from "../features/chrono/CivilizationGauges";
import { EraStrip } from "../features/chrono/EraStrip";
import { MomentList } from "../features/chrono/MomentList";
import { Observatory } from "../features/chrono/Observatory";
import { StageReadouts } from "../features/chrono/StageReadouts";
import { useDepthTunnel, useTunnelAllowed } from "../features/chrono/DepthTunnel";
import { distanceLabel, focusAt, nearbyPlates, plateOf, restingPicture, stepPicture, timeParam, tunnelPictures, workshopStops } from "../features/chrono/format";
import { scrollToAnchor } from "../lib/motion";
import { atLabel, withAt } from "../features/chrono/at";
import { SubscribeCta } from "../features/subscribe/SubscribeCta";
import { webModules } from "../site-modules";

function moment(search: string, now: number) {
  const raw = new URLSearchParams(search).get("t");
  const t = raw === null ? now : Number(raw);
  return Number.isFinite(t) ? Math.min(now + AXIS_FUTURE_YEARS, Math.max(BIG_BANG, t)) : now;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!FEATURES.timeMachine) throw data({ message: "not_found" }, { status: 404 });
  const now = decimalYear(Date.now());
  const t = moment(new URL(request.url).search, now);
  const chronicle = await loadOr404<ChronicleResponse>("/api/site/chronicle", { request, signal: request.signal });
  return { chronicle, now, t };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, defaultShouldRevalidate }) => currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "加速史：从大爆炸到智能体时代的 AI 与文明时间线", description: "从大爆炸到此刻，再到公开的预测：拖动时间轴，看人类在每个时刻掌握了什么。", path: "/chronicle", image: "/og/pages/chronicle.png" }, localeFromMatches(matches ?? []));
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}

type Panel = "gauges" | "nearby" | "eras" | "workshops";
const PANELS: Array<[Panel, string]> = [["gauges", "全部读数"], ["nearby", "此刻附近"], ["eras", "时代画卷"], ["workshops", "工坊"]];

/** Keyed like plateOf: era and milestone IDs can be the same. */
const SCENES = new Map(webModules().flatMap((m) => m.chronicle?.scenes ?? []).flatMap((scene) => [
  ...(scene.era ? [[`e-${scene.era}`, scene] as const] : []),
  ...(scene.milestone ? [[`m-${scene.milestone}`, scene] as const] : []),
]));

export default function ChroniclePage() {
  const tx = useTranslate();
  const { chronicle, now, t: initialT } = useLoaderData<typeof loader>();
  const [t, setT] = useState(initialT);
  const location = useLocation();
  const navigate = useNavigate();
  const bounds = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds;
  useEffect(() => { setT(moment(location.search, now)); }, [location.search, now]);
  const stage = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  // The tunnel opens the scene in a frame of its own, which links do not localize: the frame needs the locale's path.
  const pictures = useMemo(() => tunnelPictures(chronicle.eras, chronicle.milestones, new Map([...SCENES].map(([id, scene]) => [id, localePath(scene.path, locale)]))), [chronicle, locale]);
  const workshops = useMemo(() => workshopStops(pictures, new Map([...SCENES.values()].map((scene) => [localePath(scene.path, locale), scene.label]))), [pictures, locale]);
  // Between two pictures the deck and the tunnel show the nearer one, its plate and its text; the needle and
  // the readouts stay at t. The arrow keys, the wheel and ‹ › step on from the picture in view.
  const resting = restingPicture(pictures, t, now);
  const at = pictures[resting]?.t ?? t;
  const era = eraAt(chronicle.eras, at);
  // An era's opening picture shows the era, not a milestone that happens to stand close by.
  const focus = resting < 0 ? focusAt(chronicle.milestones, t, now) : pictures[resting]!.milestone ?? null;
  const plate = era ? plateOf(era, focus) : null;
  const scene = plate ? SCENES.get(plate.key as `e-${string}` | `m-${string}`) : undefined;
  const allowed = useTunnelAllowed();
  const tunnel = useDepthTunnel(stage, {
    allowed,
    pictures,
    progress: Math.max(0, resting),
    alt: era ? plateOf(era, focus).alt : "",
    sceneTitle: scene ? tx(scene.label) : "",
  });
  const busy = tunnel.mode !== "stage";
  const commit = (next: number) => {
    if (busy) return;
    const clamped = Math.min(now + AXIS_FUTURE_YEARS, Math.max(BIG_BANG, next));
    setT(clamped);
    navigate(`?t=${timeParam(clamped, now)}`, { replace: true, preventScrollReset: true });
  };
  const move = (next: number) => { if (!busy) setT(next); };

  // The layer beside the deck on a desktop; on a phone its panels simply follow the deck.
  const [panel, setPanel] = useState<Panel | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const layer = useRef<HTMLElement>(null);
  const close = () => {
    setPanel(null);
    opener.current?.focus({ preventScroll: true });
    opener.current = null;
  };
  /** From the deck's buttons, which open and close it; Esc and × close it too and give the focus back. */
  const toggle = (next: Panel, from: HTMLElement) => {
    if (panel === next) { close(); return; }
    if (!panel) opener.current = from;
    setPanel(next);
  };
  useEffect(() => {
    if (!panel) return;
    const body = layer.current?.querySelector<HTMLElement>(".chronicle-layer-body");
    if (body) body.scrollTop = 0;
    if (opener.current && !layer.current?.contains(document.activeElement)) {
      const target = panel === "workshops" ? layer.current?.querySelector<HTMLElement>("#chronicle-workshops") : layer.current;
      target?.focus({ preventScroll: true });
      if (panel === "workshops" && window.innerWidth < 961) {
        const chronometer = stage.current?.querySelector<HTMLElement>(".chronometer");
        if (target && chronometer) target.style.scrollMarginTop = `${chronometer.getBoundingClientRect().height + 16}px`;
        scrollToAnchor("chronicle-workshops");
      }
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // In the tunnel the wheel over the plate flies to the next or the previous picture; over the axis it still zooms.
  const step = useRef<(direction: -1 | 1) => void>(() => {});
  step.current = (direction) => commit(stepPicture(chronicle.eras, chronicle.milestones, at, direction));
  const running = tunnel.running;
  useEffect(() => {
    const element = stage.current;
    if (!running || !element) return;
    let sum = 0, at = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || event.target.closest(".chronometer, .observatory-tools, .chronicle-readouts")) return;
      event.preventDefault();
      if (event.timeStamp - at > 300) sum = 0;
      at = event.timeStamp;
      sum += event.deltaY;
      if (Math.abs(sum) < 120) return;
      step.current(sum > 0 ? 1 : -1);
      sum = 0;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [running]);

  if (!era) return <p className="py-8 text-ink-3"><Text value="尚无时代数据。" /></p>;
  // ‹ › go from picture to picture, like the arrow keys and the wheel: every press is a flight.
  const previous = stepPicture(chronicle.eras, chronicle.milestones, at, -1);
  const following = stepPicture(chronicle.eras, chronicle.milestones, at, 1);
  const stopTitle = (stop: number) => focusAt(chronicle.milestones, stop, now)?.title ?? eraAt(chronicle.eras, stop)?.title;
  const date = yearToDate(t);
  const present = !!date && !!bounds && date >= bounds.today;
  const recorded = !!date && !!bounds?.earliest && date >= bounds.earliest && date < bounds.today;
  const links = [{ to: "/", label: tx("精选") }, { to: "/hot", label: tx("热点榜") }, { to: "/daily", label: tx("日报") }];
  const panels: Record<Panel, ReactNode> = {
    gauges: <CivilizationGauges metrics={chronicle.metrics} t={t} now={now} />,
    nearby: (
      <div className="chronicle-nearby">
        <MomentList milestones={chronicle.milestones} t={t} now={now} onCommit={commit} />
        <div className="space-y-8">
          <Capabilities milestones={chronicle.milestones} t={t} now={now} onCommit={commit} />
          {(recorded || present) && (
            <section className="chronicle-slice">
              <h2>
                <IconHourglass size={16} />
                {present ? tx("此刻的本站") : tx("这一天在本站")}
              </h2>
              <p>{present ? tx("时光机落在此刻：这就是现在的站点。") : tx("回到 {0}，看本站当天的样子。", atLabel(date!))}</p>
              <div className="chronicle-slice-links">
                {links.map((link) => (
                  <Link key={link.to} to={withAt(link.to, recorded ? date : null)}>
                    {link.label}
                    <IconArrowRight size={13} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    ),
    eras: <EraStrip milestones={chronicle.milestones} eras={chronicle.eras} current={era.id} now={now} />,
    workshops: (
      <section id="chronicle-workshops" tabIndex={-1} aria-labelledby="chronicle-workshops-title">
        <div className="chronicle-section-head">
          <h2 id="chronicle-workshops-title"><Text value="可进入工坊" /></h2>
          <p>{tx("{0} 个历史时刻，可以亲手探索。", workshops.length)}</p>
        </div>
        <p className="chronicle-workshop-help"><Text value="时间轴上的菱形标记对应可进入的场景。选择年代定位，或直接走进工坊。" /></p>
        <ul className="chronicle-workshop-list">
          {workshops.map((stop) => (
            <li key={stop.path} className={scene && localePath(scene.path, locale) === stop.path ? "is-current" : undefined}>
              <Link to={`?t=${timeParam(stop.t, now)}#observatory`} onClick={close} preventScrollReset className="chronicle-workshop-locate" aria-label={tx("定位到 {0}：{1}", tx(timeLabel(stop.t, now)), tx(stop.label))}>
                <img src={`${stop.src}-800.webp`} alt="" loading="lazy" decoding="async" width={80} height={54} />
                <span><span className="chronicle-workshop-date">{tx(timeLabel(stop.t, now))}</span><strong>{tx(stop.label)}</strong></span>
              </Link>
              <Link to={stop.path} className="chronicle-workshop-enter" aria-label={tx(stop.label)}><Text value="进入 3D" /><span aria-hidden="true">↗</span></Link>
            </li>
          ))}
        </ul>
      </section>
    ),
  };
  return (
    <div className={`chronicle-page pb-8 pt-3 lg:pt-0 ${panel ? "has-layer" : ""}`}>
      <div ref={stage} className={`chronicle-stage is-${tunnel.mode} ${tunnel.ready ? "has-tunnel" : ""}`}>
        <Observatory
          era={era}
          focus={focus}
          nearby={nearbyPlates(chronicle.eras, chronicle.milestones, at, now)}
          label={focus ? tx(timeLabel(focus.t, now, focus.precision, focus.date)) : tx(timeLabel(t, now))}
          distance={tx(distanceLabel(t, now))}
          flat={running}
          scene={scene ? { path: scene.path, label: tx(scene.label), enter: running ? tunnel.enter : null, loading: running && !tunnel.canEnter } : null}
          tools={(
            <div className="observatory-layers" role="toolbar" aria-label={tx("更多内容")}>
              {PANELS.map(([key, label]) => (
                <button key={key} type="button" aria-expanded={panel === key} aria-controls="chronicle-layer" onClick={(event) => toggle(key, event.currentTarget)}>
                  <Text value={label} />
                </button>
              ))}
            </div>
          )}
        />
        <StageReadouts metrics={chronicle.metrics} t={t} now={now} caption={focus?.art ? (focus.artStyle ?? era.artStyle) : era.artStyle} />
        {/* The chronometer docks under the deck and stays at hand while the readouts below scroll by. */}
        <section aria-label={tx("时间导航")} className="chronometer">
          <button type="button" className="chronometer-step is-previous" disabled={previous === at} onClick={() => commit(previous)} title={stopTitle(previous)} aria-label={tx("上一个里程碑")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <ChronicleAxis eras={chronicle.eras} milestones={chronicle.milestones} now={now} t={t} picture={at} workshops={workshops} activeWorkshop={scene ? localePath(scene.path, locale) : undefined} onMove={move} onCommit={commit} />
          <button type="button" className="chronometer-step is-next" disabled={following === at} onClick={() => commit(following)} title={stopTitle(following)} aria-label={tx("下一个里程碑")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="chronometer-controls">
            {/* Also the legend of the diamonds on the axis. */}
            {!!workshops.length && (
              <button type="button" className="chronicle-workshop-menu" aria-expanded={panel === "workshops"} aria-controls="chronicle-workshops" onClick={(event) => toggle("workshops", event.currentTarget)}>
                <span className="chronicle-workshop-key" aria-hidden="true" />
                <span className="chronicle-workshop-long">{tx("{0} 个可进入的工坊", workshops.length)}</span>
                <span className="chronicle-workshop-short">{tx("{0} 个工坊", workshops.length)}</span>
              </button>
            )}
            <button type="button" className="chronometer-now" onClick={() => commit(now)}><Text value="回到现在" /></button>
          </div>
        </section>
      </div>

      {/* Every panel is in the page for readers and search engines alike; a desktop shows the one opened. */}
      <aside ref={layer} id="chronicle-layer" className="chronicle-layer" data-panel={panel ?? undefined} aria-label={tx("更多内容")} tabIndex={-1}>
        <div className="chronicle-layer-head" role="tablist">
          {PANELS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={panel === key} onClick={() => setPanel(key)}><Text value={label} /></button>
          ))}
          <button type="button" className="chronicle-layer-close" onClick={close} aria-label={tx("关闭侧栏")}>×</button>
        </div>
        <div className="chronicle-layer-body">
          {PANELS.map(([key]) => <div key={key} className="chronicle-panel" data-panel={key}>{panels[key]}</div>)}
        </div>
      </aside>

      <div className="chronicle-below">
        <p className="text-[11.5px] leading-relaxed text-ink-4"><Text value="数据在 industry/chronicle/，每条都附出处；指标在两个有来源的数据点之间按对数插值；预测包含机构、社区观点与注明提出者的本站情景推演，年份不是确定的实现日期。配图由 AI 按各时代的画风绘制。" /></p>
        <SubscribeCta source="chronicle_inline" sample={{ to: "/daily" }} sticky />
      </div>
    </div>
  );
}
