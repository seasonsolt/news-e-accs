import { defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { registerReview } from "./api/review.ts";
import { depthQueue } from "./backend/draft.ts";
import { publishedDepth } from "./backend/publication.ts";

export default defineServerModule({
  name: "story-depth",
  http: registerReview,
  queues: [depthQueue],
  models: { storyDepth: { label: "Story depth", env: "STORY_DEPTH_MODEL", purposes: ["story_depth"] } },
  storyPage: (storyId) => publishedDepth(storyId),
  admin: { counts: { editorialReview: async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM editorial_reviews WHERE status = 'pending'`;
    return row!.n;
  } } },
});
