import { Link } from "@aihot/web/lib/navigation";
import { Text, useTranslate } from "@aihot/web/lib/i18n";
import { BrandMark } from "@aihot/web/components/BrandMark";
import { IconArrowRight } from "@aihot/web/components/icons";
import type { LbStoryModels } from "@aihot/leaderboard/contracts";
import { usd } from "./features/format";

/** The leaderboard models a story names, linked to their pages (storyPage). */
export default function StoryModels({ data }: { data: unknown }) {
  const tx = useTranslate();
  const { models, compare } = data as LbStoryModels;
  return (
    <section aria-labelledby="story-models-title" className="card p-5 lg:p-6">
      <h2 id="story-models-title" className="text-[17px] font-bold text-ink"><Text value="提到的模型" /></h2>
      <ul className="mt-3 divide-y divide-line-soft">
        {models.map(({ model, rank, usd: price }) => (
          <li key={model.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
            <BrandMark brand={model.brand} size={22} />
            <Link to={`/leaderboard/${model.slug}`} className="font-medium text-ink hover:text-accent">{model.name}</Link>
            {rank !== null && <span className="num text-ink-4">{tx("综合榜第 {0}", rank)}</span>}
            {price && price.input !== null && price.output !== null && (
              <span className="num ml-auto text-ink-3">{tx("每百万 Token 输入 {0} / 输出 {1}", usd(price.input), usd(price.output))}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-medium">
        {compare && <Link to={`/pricing/compare/${compare}`} className="inline-flex items-center gap-1 text-accent hover:text-accent-ink"><Text value="对比两者的 API 价格" /><IconArrowRight size={13} /></Link>}
        <Link to="/pricing" className="inline-flex items-center gap-1 text-accent hover:text-accent-ink"><Text value="全部模型的 API 价格" /><IconArrowRight size={13} /></Link>
      </div>
    </section>
  );
}
