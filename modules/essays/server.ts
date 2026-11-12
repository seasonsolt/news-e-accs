import { defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { registerEssayAdmin } from "./api/admin.ts";
import { registerEssayPublic } from "./api/public.ts";
import { essayLlmsLines, essaySitemapEntries, essaysSince } from "./backend/publication.ts";
import { essayQueue } from "./backend/tasks.ts";

export default defineServerModule({
  name: "essays",
  http: (app) => {
    registerEssayAdmin(app);
    registerEssayPublic(app);
  },
  queues: [essayQueue],
  models: {
    essayOutline: { label: "长文提纲", env: "ESSAY_OUTLINE_MODEL", purposes: ["essay_outline"] },
    essayDraft: { label: "长文成稿", env: "ESSAY_DRAFT_MODEL", purposes: ["essay_draft"] },
    essayRevise: { label: "长文单节重写", env: "ESSAY_REVISE_MODEL", purposes: ["essay_revise"] },
    essayLocalize: { label: "长文中文版", env: "ESSAY_LOCALIZE_MODEL", purposes: ["essay_localize"] },
  },
  admin: { counts: { essayTasks: async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM essay_tasks WHERE status = 'failed' OR (kind = 'revise' AND status = 'done')`;
    return row!.n;
  } } },
  newsletter: { features: essaysSince },
  llms: async () => ({ pages: await essayLlmsLines() }),
  sitemap: { entries: essaySitemapEntries },
});
