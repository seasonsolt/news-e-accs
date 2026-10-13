import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "story-depth",
  adminPages: [{ path: "admin/review", file: "web/review.tsx", id: "editorial-review" }],
  apiPaths: [/^\/api\/admin\/review(?:\/|$)/],
});
