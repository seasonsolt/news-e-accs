import { Link } from "react-router";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { workshopTime, useWorkshopProgress } from "@aihot/web/lib/local-state";
import { pageMeta } from "@aihot/web/lib/seo";
import { WORLDS } from "./shared/worlds.ts";
import styles from "./gallery.css?url";

const title = "时代工坊";
const description = "十五座工坊，十个可以亲手完成的挑战。";
interface Workshop { id: string; path: string; time: number; figure: string; unit: string; title: string; subtitle: string; plate: string; action: string; challenge?: boolean }
// The 1822 engine has its own page and copy (difference-engine-1822/page.tsx); this is the card for it.
const engine: Workshop = {
  id: "difference-engine-1822", path: "/chronicle/difference-engine", time: 1822, figure: "1822", unit: "年", title: "差分机工坊",
  subtitle: "当计算，第一次有了形状。走进黄铜与齿轮之间，用一次转动，算出下一行未来。", plate: "/media/art/moments/difference-engine-1600.webp", action: "转动一轮",
};
const workshops: Workshop[] = [...Object.values(WORLDS), engine].sort((a, b) => a.time - b.time);
export const links = () => [{ rel: "stylesheet", href: styles }];
export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  const locale = localeFromMatches(matches ?? []);
  return pageMeta({ title: translate(locale, title), description: translate(locale, description), path: "/chronicle/workshops" }, locale);
}

export default function Gallery() {
  const tx = useTranslate(), locale = useLocale();
  // The server and the first client render know nothing of this reader; the finished ones fill in after hydration.
  const progress = useWorkshopProgress();
  const finished = workshops.filter(world => progress[world.path]).length;
  // SiteShell supplies the document's main landmark; the directory remains fully available in SSR.
  return <section className="workshop-gallery" aria-labelledby="workshop-gallery-title">
    <header className="workshop-gallery-hero">
      <Link className="workshop-gallery-back" to={localePath("/chronicle", locale)}>← {tx("返回加速史")}</Link>
      <div className="workshop-gallery-heading">
        <div><h1 id="workshop-gallery-title">{tx(title)}</h1><p>{tx(description)}</p><p className="workshop-gallery-progress">{tx("已完成 {0} / {1}", finished, workshops.length)}</p></div>
        <span className="workshop-gallery-count" aria-hidden="true">01<span>—</span>{workshops.length}</span>
      </div>
    </header>
    <ol className="workshop-gallery-grid">
      {workshops.map((world, index) => {
        const unit = tx(world.unit), record = progress[world.path];
        const date = world.time < 0 && locale !== "en" ? `${unit} ${world.figure}` : `${world.figure}${unit ? ` ${unit}` : ""}`;
        return <li key={world.id}>
          <article className={`workshop-gallery-card${record ? " is-done" : ""}`}>
            <div className="workshop-gallery-image"><img src={world.plate} alt="" width={1600} height={1067} loading="lazy" decoding="async" /><span className="workshop-gallery-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{record && <span className="workshop-gallery-done" role="img" aria-label={tx("已完成")}>✓</span>}</div>
            <div className="workshop-gallery-body">
              <p className="workshop-gallery-date">{date}</p>
              <h2>{tx(world.title)}</h2>
              <p className="workshop-gallery-subtitle">{tx(world.subtitle)}</p>
              <p className="workshop-gallery-action">{tx(world.action)}</p>
              {record?.ms !== undefined && record.steps !== undefined && <p className="workshop-gallery-best">{tx("最快 {0} · 最少 {1} 次操作", workshopTime(record.ms), record.steps)}</p>}
              <Link className="workshop-gallery-start" to={localePath(world.path, locale)} aria-label={`${tx(world.challenge ? "开始挑战" : "走进工坊")} · ${tx(world.title)}`}>{tx(world.challenge ? "开始挑战" : "走进工坊")}<span aria-hidden="true">↗</span></Link>
            </div>
          </article>
        </li>;
      })}
    </ol>
  </section>;
}
