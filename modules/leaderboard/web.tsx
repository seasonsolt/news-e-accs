import { defineWebModule } from "@aihot/web/modules";
import { IconChart } from "@aihot/web/components/icons";
import { CHINESE, ENGLISH } from "./i18n/messages.ts";

export default defineWebModule({
  name: "leaderboard",
  messages: { en: ENGLISH, zh: CHINESE },
  sidebar: { section: "模型", items: [{ to: "/leaderboard", label: "模型前沿", icon: IconChart }] },
  tools: [{ to: "/leaderboard", label: "模型榜", icon: <IconChart size={18} /> }],
  admin: { runs: () => import("./web/admin/runs.tsx") },
  storyPage: () => import("./web/StoryModels.tsx"),
  darkMarks: ["/model-providers/moonshot.svg"],
});
