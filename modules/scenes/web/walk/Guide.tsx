import { Link } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { artUrl } from "@aihot/web/features/chrono/art";
import { useLocale } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { STOP_YEARS } from "./land.ts";

const chapters = [
  {
    id: "walk-fire", time: "夜里 · 从约一百万年前出发", title: "守着火的人",
    text: "你给火塘添一根柴。往夜里走，大人背着行囊，孩子沿脚印跟上。再往前，石檐下留着一只赭红的掌印。",
    moments: [[STOP_YEARS.migration, "约六万年前 · 走出非洲"]],
    image: [artUrl("/media/art/epochs/taming-fire", 800), artUrl("/media/art/epochs/taming-fire", 1600)],
    alt: "岩画风格的图像里，人们围坐在火堆旁，野牛和赭红手印环绕四周。",
    caption: "当代创作 · 岩画风格的用火图景",
    next: "#walk-field", link: "下一站，田野",
  },
  {
    id: "walk-field", time: "清晨 · 从约一万两千年前走来", title: "留下的一把种子",
    text: "麦种把人留在田边。村口的粮食一袋袋入仓，记账的人用芦苇笔把数目压进湿泥。走过水渠，印刷机旁晾着一张张印有相同文字的纸。",
    moments: [[STOP_YEARS.ledger, "约公元前 3200 年 · 泥板与粮账"], [STOP_YEARS.press, "约 1440 年 · 古腾堡印刷机"]],
    image: [artUrl("/media/art/epochs/agricultural-revolution", 800), artUrl("/media/art/epochs/agricultural-revolution", 1600)],
    alt: "彩陶风格的图像里，人们在田里播种，山羊经过正在垒砌的房屋。",
    caption: "当代创作 · 彩陶纹样中的农耕与定居",
    next: "#walk-monolith", link: "下一站，巨石",
  },
  {
    id: "walk-monolith", time: "午后 · 走到今天", title: "麦田里的巨石",
    text: "织工把花纹编进一串孔卡。再往前，一台终端把两个字母送到另一台计算机。今天的机房读着人留下的文字与代码。穿过麦田便是《2001：太空漫游》里的黑碑，这一次是人自己立起的。",
    moments: [[STOP_YEARS.loom, "约 1804 年 · 雅卡尔提花机"], [STOP_YEARS.terminal, "1969 年 · ARPANET 首条消息"]],
    image: ["/media/art/manifesto-monolith-800.webp", "/media/art/manifesto-monolith-1600.webp"],
    alt: "日落的麦田中，一块光滑无字的黑色长方体独自竖立。",
    caption: "当代创作 · 人类立起的科幻黑碑",
    next: "#walk-title", link: "回到起点",
  },
] as const;

export function WalkGuide({ tx }: { tx: (s: string) => string }) {
  const locale = useLocale();
  return <section className="walk-guide" id="walk-guide" aria-labelledby="walk-guide-title" tabIndex={-1}>
    <div className="walk-guide-inner">
      <h2 id="walk-guide-title">{tx("沿途图记")}</h2>
      <p className="walk-guide-intro">{tx("加速史记录人类在各个时刻掌握的能力。这条路把不同年代、不同地点的火塘、田野与机器，放进同一个世界。")}</p>
      {chapters.map((chapter) => <article className="walk-guide-entry" id={chapter.id} key={chapter.id}
        aria-labelledby={`${chapter.id}-title`} tabIndex={-1}>
        <figure className="walk-guide-figure">
          <img className="walk-guide-art" src={chapter.image[0]}
            srcSet={`${chapter.image[0]} 800w, ${chapter.image[1]} 1600w`}
            sizes="(max-width: 700px) 90vw, (max-width: 1280px) 51vw, 630px"
            alt={tx(chapter.alt)} width={800} height={534} loading="lazy" decoding="async" />
          <figcaption>{tx(chapter.caption)}</figcaption>
        </figure>
        <div className="walk-guide-copy">
          <p className="walk-guide-time">{tx(chapter.time)}</p>
          <h3 id={`${chapter.id}-title`}>{tx(chapter.title)}</h3>
          <p className="walk-guide-prose">{tx(chapter.text)}</p>
          <ul className="walk-guide-moments">
            {chapter.moments.map(([year, label]) => <li key={year}><Link to={localePath("/chronicle", locale) + "?t=" + year}>{tx(label)}</Link></li>)}
          </ul>
          <a className="walk-guide-link" href={chapter.next}>
            {tx(chapter.link)} <span aria-hidden="true">{chapter.next === "#walk-title" ? "↑" : "↓"}</span>
          </a>
        </div>
      </article>)}
      <nav className="walk-guide-reading" aria-label={tx("继续阅读")}>
        <Link className="walk-guide-link" to={localePath("/chronicle", locale)}>{tx("回到加速史")}</Link>
        {FEATURES.eaccConcepts && <Link className="walk-guide-link" to={localePath("/manifesto#wheat", locale)}>{tx("读宣言里的〈小麦〉")}</Link>}
      </nav>
    </div>
  </section>;
}
