import { defineServerModule } from "@aihot/backend/modules";

export default defineServerModule({
  name: "scenes",
  sitemap: { pages: [{ loc: "/chronicle/walk", changefreq: "monthly", priority: 0.5 }] },
});
