import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { useLoaderData } from "react-router";
import { apiGet } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { Deck } from "../components/shell/Deck";

interface TopicSummary {
  slug: string;
  name: string;
  group: "company" | "field" | "genre";
  definition: string;
  total: number;
  recent: number;
  indexable: boolean;
  latestAt: string | null;
}

export async function loader({ request }: { request: Request }) {
  return apiGet<{ topics: TopicSummary[] }>("/api/site/topics", { request, signal: request.signal });
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "主题", description: "按公司与模型、技术方向、内容形态聚合的 AI 主题页：OpenAI、Anthropic、Agent、多模态、论文与教程等 38 个方向。", path: "/topics", image: "/og/pages/topics.png" }, localeFromMatches(matches ?? []));
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

const GROUPS = [
  { key: "company", name: "公司与模型", blurb: "按厂商与模型系追踪：谁发了什么、又赢了哪一局" },
  { key: "field", name: "技术方向", blurb: "按技术领域深挖：Agent、多模态、具身智能……" },
  { key: "genre", name: "内容形态", blurb: "按内容类型浏览：论文、教程、观点、政策……" },
] as const;

export default function TopicsPage() {
  const tx = useTranslate();
  const { topics } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <Deck
        art="topics"
        label={tx("主题索引")}
        kicker={<><Text value="主题索引 ·" /><span className="num">{topics.length}</span><Text value="个主题" /></>}
        title={tx("按主题看 AI")}
        description={tx("按公司与模型、技术方向、内容形态浏览，持续汇集近期焦点与精选。")}
      />
      {GROUPS.map((g) => (
        <section key={g.key} aria-labelledby={`topics-${g.key}`} className="pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={`topics-${g.key}`} className="text-[15px] font-bold text-ink">
              <Text value={g.name} />
            </h2>
            <p className="text-[12px] text-ink-4"><Text value={g.blurb} /></p>
          </div>
          <ul className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {topics
              .filter((t) => t.group === g.key)
              .map((t) => (
                <li key={t.slug}>
                  <Link
                    to={`/topics/${t.slug}`}
                    prefetch="intent"
                    aria-label={tx("查看{0}相关精选文章", t.name)}
                    className="card card-hover group flex h-full flex-col px-5 py-[18px]"
                  >
                    <span className="text-[15px] font-bold text-ink transition-colors group-hover:text-accent">{t.name}</span>
                    <span className="mt-1.5 line-clamp-2 flex-1 text-[12.5px] leading-[1.7] text-ink-3">{t.definition}</span>
                    <span className="mono mt-3 text-[11.5px] text-accent"><Text value="查看" />{t.total}<Text value="条精选" /><span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
