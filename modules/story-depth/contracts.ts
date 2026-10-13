export interface StoryDepth {
  background: string;
  numbers: Array<{ value: string; context: string; reportId: string; quote: string }>;
  reactions: Array<{ who: string; text: string; reportId: string; quote: string }>;
  accelerates: string;
  curve: { path: string; label: string } | null;
}

export interface PublishedDepth {
  content: StoryDepth;
  publishedAt: string;
  sources: Array<{ id: string; name: string }>;
}

export interface ReviewEntry {
  id: number;
  kind: string;
  subjectId: string;
  title: string;
  publicId: string;
  status: "queued" | "pending" | "failed";
  version: number;
  draft: StoryDepth | null;
  published: StoryDepth | null;
  error: string | null;
  evidence: Array<{ id: string; title: string; source: string; text: string }>;
}

export interface ReviewQueue {
  entries: ReviewEntry[];
  stories: Array<{ id: number; publicId: string; title: string; published: boolean }>;
  page: number;
  hasMore: boolean;
}

export function depthDiff(before: StoryDepth | null, after: StoryDepth) {
  return (Object.keys(after) as Array<keyof StoryDepth>).flatMap((field) => {
    const previous = JSON.stringify(before?.[field] ?? null, null, 2);
    const next = JSON.stringify(after[field], null, 2);
    return previous === next ? [] : [{ field, before: previous, after: next }];
  });
}
