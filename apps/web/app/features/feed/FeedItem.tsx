import { contentHtmlLanguage } from "../../lib/content-language";
import { Link } from "../../lib/navigation";
import { ContentLanguage } from "../../components/ContentLanguage";
import { useLocale, useTranslate, Text } from "../../lib/i18n";
// One report in a feed. Desktop (≥ 961px): a white card beside the time rail. Phones: a compact row with
// the time in the source line, the bookmark at hand, the reason in one line and duplicate reports
// behind one button that opens a sheet. One markup, two presentations.
import { memo } from "react";

import { IntentLink } from "../../components/ui/IntentLink";
import type { GroupInfo, FeedItemSummary, TimelineFilters } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ITEM_COPY } from "@aihot/site";
import { SameEventBadge, SelectedBadge } from "../../components/ui/Badge";
import { ScoreLabel } from "../../components/ui/Score";
import { beijingTime } from "@aihot/contracts/time";
import { MediaThumbs, SourceLine, StarButton, readTone } from "./parts";
import { GroupButton, GroupSources } from "./ReadingGroup";
import { QuotedLine } from "../item/QuotedPost";
import { rememberPreview } from "../item/preview";

export interface FeedItemProps {
  item: FeedItemSummary;
  group?: GroupInfo | null;
  filters?: TimelineFilters;
  read?: boolean;
  onOpen?: (id: string) => void;
  /** Show category and tags under the text (全部动态, topics, search). */
  showTags?: boolean;
  /** The time the item sits at in its list; phones show it in the source line (desktop: on the rail). */
  at?: string;
  /** Keep the reason behind a 推荐理由 toggle (the front page's quieter list). */
  foldReason?: boolean;
}

export const FeedItem = memo(function FeedItem({ item, group, filters, read = false, onOpen, showTags = false, at, foldReason = false }: FeedItemProps) {
  const tx = useTranslate();
  const language = contentHtmlLanguage(item, useLocale()) ?? "und";
  const isX = item.channel === "x" && !!item.x;
  const open = () => {
    rememberPreview(item);
    onOpen?.(item.id);
  };
  const showSources = !!group && (group.additionalSourceCount > 0 || group.reportCount > 1);
  const tags = showTags ? item.tags.slice(0, 3) : [];

  return (
    <article className="relative min-w-0 lg:card lg:card-hover lg:px-[18px] lg:pb-[14px] lg:pt-[15px]" data-item-id={item.id}>
      <header className="flex min-h-[22px] items-center gap-1.5 text-[12.5px] leading-[18px] text-ink-4 lg:min-h-[18px] lg:gap-2">
        <SourceLine item={item} className="text-ink-4" />
        {at && (
          <time dateTime={at} className="mono shrink-0 text-[12px] lg:hidden">
            · {beijingTime(at)}
          </time>
        )}
        {item.selected && (
          <span className="hidden lg:inline-flex">
            {item.sameEvent ? <SameEventBadge /> : <SelectedBadge />}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 lg:gap-1.5">
          <ScoreLabel score={item.score} desktopLabel />
          <span className="-my-[11px] -mr-3 inline-flex lg:-my-1 lg:mr-0">
            <StarButton item={item} className="size-11 lg:size-[26px]" />
          </span>
        </span>
      </header>

      <ContentLanguage content={item} />
      {isX ? (
        item.summary ? <p lang={language} className={`mt-1.5 whitespace-pre-line text-[15px] leading-[1.75] line-clamp-5 lg:mt-2 lg:line-clamp-4 ${read ? "text-ink-4" : "text-ink"}`}>
          <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} className="after:absolute after:inset-0 after:content-['']">
            {item.summary}
          </IntentLink>
        </p> : <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} aria-label={tx("查看 {0} 的帖子", item.x!.authorName)} className="absolute inset-0" />
      ) : (
        <div className="flex gap-3 lg:gap-4">
          <div className="min-w-0 flex-1">
            <h3 lang={language} className={`mt-1.5 line-clamp-2 text-[17px] font-[650] leading-[1.5] lg:mt-2 lg:line-clamp-none lg:leading-[1.55] ${read ? "text-ink-4" : "text-ink"}`}>
              <IntentLink viewTransition to={`/items/${item.id}`} onClick={open} className="after:absolute after:inset-0 after:content-['']">
                {item.title}
              </IntentLink>
            </h3>
            {item.summary && <p lang={language} className="mt-1 line-clamp-2 text-[14.5px] leading-[1.7] text-ink-3 lg:mt-2 lg:line-clamp-3 lg:text-[15px] lg:leading-[1.75]">{item.summary}</p>}
          </div>
          {/* The original page's share picture; the link over the card opens the report. */}
          {item.cover && (
            <img src={item.cover.url} srcSet={item.cover.srcSet} sizes="(min-width: 961px) 152px, 96px" alt="" loading="lazy" decoding="async"
              className="mt-2 aspect-[4/3] w-[96px] shrink-0 self-start rounded-control border border-line-soft bg-bg-sunk object-cover lg:mt-2.5 lg:aspect-[16/10] lg:w-[152px]" />
          )}
        </div>
      )}

      {isX && item.x!.media.length > 0 && <MediaThumbs media={item.x!.media} className="mt-2.5" />}
      {isX && item.x!.quoted?.text && <QuotedLine quoted={item.x!.quoted} />}

      {(tags.length > 0 || (showTags && item.category)) && (
        <div className="relative z-10 mt-2 hidden flex-wrap gap-x-2.5 gap-y-1 text-[12px] text-ink-4 lg:flex">
          {showTags && item.category && (
            <Link to={`/all?category=${item.category}`} className="hover:text-accent">
              {tx(CATEGORY_LABELS[item.category])}
            </Link>
          )}
          {tags.map((t) => (
            <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="hover:text-accent">
              #{tx(t)}
            </Link>
          ))}
        </div>
      )}

      {item.sameEvent && (
        <p className="relative z-10 mt-2 line-clamp-1 text-[12.5px] text-ink-4">
          {tx("同一新闻，精选展示")}
          <Link viewTransition to={`/items/${item.sameEvent.id}`} className="text-ink-3 transition-colors hover:text-accent">
            《{item.sameEvent.title}》
          </Link>
        </p>
      )}
      {group && showSources && (
        <div className="mt-2 hidden lg:block">
          <GroupSources group={group} filters={filters} parentId={item.id} />
        </div>
      )}

      {item.reason && foldReason && (
        <details className="feed-reason relative z-10 mt-1 lg:mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-[13px] text-accent-ink lg:min-h-8"><Text value={ITEM_COPY.reasonLabel} /></summary>
          <p className="mb-1 rounded-tile bg-accent-softer px-3 py-2 text-[13px] leading-[1.75] text-note">{item.reason}</p>
        </details>
      )}
      {item.reason && !foldReason && (
        <div className="mt-1 lg:mt-3 lg:border-t lg:border-line-soft lg:pt-3">
          <p className="line-clamp-1 text-[13px] leading-[1.65] text-note lg:line-clamp-none lg:leading-[1.75]"><Text value={`${ITEM_COPY.reasonLabel}：`} />{item.reason}</p>
        </div>
      )}

      {/* Phones: duplicate reports open in a sheet. */}
      {group && showSources && <GroupButton group={group} filters={filters} parentId={item.id} />}
    </article>
  );
});
