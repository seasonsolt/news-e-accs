import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "story-depth",
  admin: { content: [{ to: "/admin/review", label: "待审", count: "editorialReview", tone: "accent" }] },
  storyPage: () => import("./web/Depth.tsx"),
});
