import { defineWebModule } from "@aihot/web/modules";
import { IconChart } from "@aihot/web/components/icons";
import { CHINESE, ENGLISH } from "./i18n/messages.ts";

export default defineWebModule({
  name: "leaderboard",
  messages: { en: ENGLISH, zh: CHINESE },
  // 前沿 gathers the leaderboard, the prices and the indices module's cost of intelligence (web/routes/frontier.tsx).
  sidebar: { section: "前沿", items: [{ to: "/frontier", label: "前沿", icon: IconChart, also: ["/leaderboard", "/pricing", "/index"] }] },
  admin: { runs: () => import("./web/admin/runs.tsx") },
  storyPage: () => import("./web/StoryModels.tsx"),
  darkMarks: ["/model-providers/moonshot.svg"],
});
