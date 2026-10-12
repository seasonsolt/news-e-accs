import { defineServerModule } from "@aihot/backend/modules";
import { siteUrl } from "@aihot/backend/publication/links";
import { registerIndices } from "./api/indices.ts";

export default defineServerModule({
  name: "indices",
  http: registerIndices,
  async llms() {
    return { pages: [`- [Cost of intelligence](${siteUrl("/index/cost-of-intelligence")}): how fast the price of a fixed GPQA Diamond score falls; CSV at ${siteUrl("/api/site/indices/cost-of-intelligence.csv")}`] };
  },
  sitemap: { pages: [{ loc: "/index/cost-of-intelligence", changefreq: "weekly", priority: 0.8 }] },
});
