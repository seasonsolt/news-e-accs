import type { NextReads } from "@aihot/contracts/site";

export interface ReadingLink { to: string; title: string; label: string }

/** Editorial relationships come first. Use the daily for discovery, or hot stories when no daily exists. */
export function readingLinks(reads: NextReads | null, related: ReadingLink[], currentStory: string | null): ReadingLink[] {
  const candidates = [...related];
  if (reads?.daily) candidates.push({ to: `/daily/${reads.daily.key}`, title: reads.daily.title || reads.daily.key, label: "今日还有哪些重要变化" });
  for (const h of reads?.daily ? [] : reads?.hot ?? []) candidates.push({ to: `/story/${h.storyPublicId}`, title: h.title, label: "正在热议" });
  const seen = new Set(currentStory ? [`/story/${currentStory}`] : []);
  const titles = new Set<string>();
  return candidates.filter((link) => {
    const title = link.title.trim().toLowerCase();
    if (seen.has(link.to) || titles.has(title)) return false;
    titles.add(title);
    seen.add(link.to);
    return true;
  }).slice(0, 3);
}
