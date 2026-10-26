import { Link } from "react-router";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { pageMeta } from "@aihot/web/lib/seo";
import { WORLDS } from "./shared/worlds.ts";
import styles from "./gallery.css?url";

const title = "时代工坊";
const description = "十段历史，十种可以亲手完成的挑战。";
const workshops = Object.values(WORLDS).filter(world => world.challenge).sort((a, b) => a.time - b.time);
export const links = () => [{ rel: "stylesheet", href: styles }];
export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  const locale = localeFromMatches(matches ?? []);
  return pageMeta({ title: translate(locale, title), description: translate(locale, description), path: "/chronicle/workshops" }, locale);
}

export default function Gallery() {
  const tx = useTranslate(), locale = useLocale();
  // SiteShell supplies the document's main landmark; the directory remains fully available in SSR.
  return <section className="workshop-gallery" aria-labelledby="workshop-gallery-title">
    <header className="workshop-gallery-hero">
      <Link className="workshop-gallery-back" to={localePath("/chronicle", locale)}>← {tx("返回加速史")}</Link>
      <div className="workshop-gallery-heading">
        <div><h1 id="workshop-gallery-title">{tx(title)}</h1><p>{tx(description)}</p></div>
        <span className="workshop-gallery-count" aria-hidden="true">01<span>—</span>10</span>
      </div>
    </header>
    <ol className="workshop-gallery-grid">
      {workshops.map((world, index) => {
        const unit = tx(world.unit);
        const date = world.time < 0 && locale !== "en" ? `${unit} ${world.figure}` : `${world.figure}${unit ? ` ${unit}` : ""}`;
        return <li key={world.id}>
          <article className="workshop-gallery-card">
            <div className="workshop-gallery-image"><img src={world.plate} alt="" width={1600} height={1067} loading="lazy" decoding="async" /><span className="workshop-gallery-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span></div>
            <div className="workshop-gallery-body">
              <p className="workshop-gallery-date">{date}</p>
              <h2>{tx(world.title)}</h2>
              <p className="workshop-gallery-subtitle">{tx(world.subtitle)}</p>
              <p className="workshop-gallery-action">{tx(world.action)}</p>
              <Link className="workshop-gallery-start" to={localePath(world.path, locale)} aria-label={`${tx("开始挑战")} · ${tx(world.title)}`}>{tx("开始挑战")}<span aria-hidden="true">↗</span></Link>
            </div>
          </article>
        </li>;
      })}
    </ol>
  </section>;
}
