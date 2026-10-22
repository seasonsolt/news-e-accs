import type { NextReads } from "@aihot/contracts/site";

export interface ReadingLink { to: string; title: string; label: string }

const DISCOVERY_SHOWN = 3;

/**
 * Editorial relationships come first, all of them (the API bounds how many). Then the daily for discovery,
 * or a few hot stories when no daily exists.
 */
export function readingLinks(reads: NextReads | null, related: ReadingLink[], currentStory: string | null): ReadingLink[] {
  const discovery: ReadingLink[] = reads?.daily
    ? [{ to: `/daily/${reads.daily.key}`, title: reads.daily.title || reads.daily.key, label: "今日还有哪些重要变化" }]
    : (reads?.hot ?? []).map((h) => ({ to: `/story/${h.storyPublicId}`, title: h.title, label: "正在热议" }));
  const seen = new Set(currentStory ? [`/story/${currentStory}`] : []);
  const titles = new Set<string>();
  const unseen = (link: ReadingLink) => {
    const title = link.title.trim().toLowerCase();
    if (seen.has(link.to) || titles.has(title)) return false;
    titles.add(title);
    seen.add(link.to);
    return true;
  };
  return [...related.filter(unseen), ...discovery.filter(unseen).slice(0, DISCOVERY_SHOWN)];
}
