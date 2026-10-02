// Illustrated banners above a list (public/media/art, made by tools/make-art.sh): the words sit on the
// page colour at the left, the engraving opens to the right, fades in on arrival and then drifts.
import type { ReactNode } from "react";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import type { CategoryKey, ChannelKey } from "@aihot/contracts/taxonomy";

export function ArtBanner({ art, title, note, label, titleAs: Title = "div", children }: {
  art: string;
  title: string;
  note: ReactNode;
  label: string;
  /** "h1" when the banner is the page's own heading. */
  titleAs?: "div" | "h1";
  children?: ReactNode;
}) {
  return (
    // Keyed by the illustration, so moving between banners plays the entrance again.
    <section key={art} className="category-banner mb-4 mt-1" aria-label={label}>
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
        <Title className="font-display text-[40px] italic leading-none text-ink lg:text-[52px]">{title}</Title>
        <p className="mt-2 text-pretty text-[13px] leading-relaxed text-ink-3 lg:text-[14px]">{note}</p>
      </div>
      {children}
    </section>
  );
}

const ART: Record<CategoryKey, string> = {
  "ai-models": "cat-models",
  "ai-products": "cat-products",
  industry: "cat-industry",
  paper: "cat-papers",
  tip: "cat-tips",
  opinion: "cat-opinion",
};

/** The banner for the category (or first-party channel) a feed is filtered by; nothing when unfiltered. */
export function CategoryBanner({ category, channel }: { category: CategoryKey | null; channel: ChannelKey }) {
  const meta = category ? CATEGORIES.find((c) => c.key === category) : null;
  if (meta) return <ArtBanner art={ART[meta.key as CategoryKey]} title={meta.label} note={meta.guide} label={`${meta.label}分类`} />;
  if (channel === "firstParty") {
    return <ArtBanner art="first-party" title="一手" note="模型厂商、公司和研究机构自己发布的消息：官网、官方博客和官方账号。" label="一手消息" />;
  }
  return null;
}
