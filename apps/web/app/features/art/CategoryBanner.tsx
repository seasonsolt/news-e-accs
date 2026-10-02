// A category's illustration above the feed when the reader filters by it (or by first-party news):
// it fades in as the filter changes, then drifts slowly. Categories without an illustration yet show
// nothing.
import { CATEGORIES } from "@aihot/industry/taxonomy";
import type { CategoryKey, ChannelKey } from "@aihot/contracts/taxonomy";

const ART: Partial<Record<CategoryKey, string>> = {
  "ai-models": "cat-models",
  "ai-products": "cat-products",
  industry: "cat-industry",
  paper: "cat-papers",
  opinion: "cat-opinion",
};

export function CategoryBanner({ category, channel }: { category: CategoryKey | null; channel: ChannelKey }) {
  const meta = category ? CATEGORIES.find((c) => c.key === category) : null;
  const art = category ? ART[category] : channel === "firstParty" ? "first-party" : null;
  if (!art) return null;
  const title = meta?.label ?? "一手";
  const note = meta?.guide ?? "模型厂商、公司和研究机构自己发布的消息：官网、官方博客和官方账号。";
  return (
    // Keyed by the illustration, so switching category plays the entrance again.
    <section key={art} className="category-banner mb-4 mt-1" aria-label={`${title}分类`}>
      <img
        src={`/media/art/${art}-1600.webp`}
        srcSet={`/media/art/${art}-800.webp 800w, /media/art/${art}-1600.webp 1600w`}
        sizes="(min-width: 961px) 1100px, 100vw"
        alt=""
        decoding="async"
        className="category-banner-image"
      />
      <div className="category-banner-shade" aria-hidden="true" />
      <div className="relative flex h-full max-w-[min(30rem,70%)] flex-col justify-center px-5 lg:px-7">
        <div className="font-display text-[40px] italic leading-none text-ink lg:text-[52px]">{title}</div>
        <p className="mt-2 text-pretty text-[13px] leading-relaxed text-ink-3 lg:text-[14px]">{note}</p>
      </div>
    </section>
  );
}
