import { artUrl } from "@aihot/web/features/chrono/art";

const chapters = [
  {
    id: "walk-fire", time: "夜里 · 约一百万年前", title: "守着火的人",
    text: "火塘边坐着几个人。走近添一根柴，火光亮起来，黑暗里的眼睛退远了。沿路走到石檐下，岩壁上还留着赭红色的手印。",
    image: "/media/art/epochs/taming-fire", alt: "岩画里的人围坐在火堆旁，野牛和红色手印环绕四周。",
    next: "#walk-field", link: "下一站，田野",
  },
  {
    id: "walk-field", time: "清晨 · 约一万两千年前", title: "留下的一把种子",
    text: "天亮时，路边有人守着一篮种子。在篮边撒下一把，麦苗便沿小路长开。再往前是村落，农人压下长杆，从水渠里提水。",
    image: "/media/art/epochs/agricultural-revolution", alt: "赭色壁画上，人们在田里播种，山羊经过正在垒砌的房屋。",
    next: "#walk-monolith", link: "下一站，巨石",
  },
  {
    id: "walk-monolith", time: "午后 · 今天", title: "麦田里的巨石",
    text: "越过木桥，风车、电塔和射电天线相继出现在麦田里。低矮的机房后面，一块黑石高过麦穗。走过去，伸手碰它，天色便暗下来。",
    image: "/media/art/home-wheat-monolith", alt: "暮色中，一个人站在金黄的麦田里，仰望一块黑色方碑。",
    next: "#walk-title", link: "回到起点",
  },
] as const;

export function WalkGuide({ tx }: { tx: (s: string) => string }) {
  return <section className="walk-guide" id="walk-guide" aria-labelledby="walk-guide-title" tabIndex={-1}>
    <div className="walk-guide-inner">
      <h2 id="walk-guide-title">{tx("沿途图记")}</h2>
      {chapters.map((chapter) => <article className="walk-guide-entry" id={chapter.id} key={chapter.id}
        aria-labelledby={`${chapter.id}-title`} tabIndex={-1}>
        <img className="walk-guide-art" src={artUrl(chapter.image, 800)}
          srcSet={`${artUrl(chapter.image, 800)} 800w, ${artUrl(chapter.image, 1600)} 1600w`}
          sizes="(max-width: 700px) 90vw, (max-width: 1280px) 51vw, 630px"
          alt={tx(chapter.alt)} width={800} height={534} loading="lazy" decoding="async" />
        <div className="walk-guide-copy">
          <p className="walk-guide-time">{tx(chapter.time)}</p>
          <h3 id={`${chapter.id}-title`}>{tx(chapter.title)}</h3>
          <p className="walk-guide-prose">{tx(chapter.text)}</p>
          <a className="walk-guide-link" href={chapter.next}>
            {tx(chapter.link)} <span aria-hidden="true">{chapter.next === "#walk-title" ? "↑" : "↓"}</span>
          </a>
        </div>
      </article>)}
    </div>
  </section>;
}
