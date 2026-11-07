import { costReading } from "@aihot/contracts/chronicle";
import { COST_OF_INTELLIGENCE_TOOL } from "./contracts.ts";
import { z } from "zod";
import { defineServerModule } from "@aihot/backend/modules";
import { siteUrl } from "@aihot/backend/publication/links";
import { registerIndices } from "./api/indices.ts";
import { costOfIntelligenceAnswer } from "./backend/agent.ts";
import { loadCostOfIntelligence } from "./backend/publication.ts";

export default defineServerModule({
  name: "indices",
  http: registerIndices,
  newsletter: { cost: async () => costReading(await loadCostOfIntelligence()) },
  agent: {
    abilities: [{
      path: "/cost-of-intelligence",
      title: "智能成本指数",
      ask: "同等能力的 AI 模型便宜了多少、多久便宜一半",
      answer: async () => costOfIntelligenceAnswer(await loadCostOfIntelligence()),
      etagPrefix: "agent-cost-of-intelligence",
      cacheControl: "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
      mcp: {
        tool: COST_OF_INTELLIGENCE_TOOL,
        use: "for how fast the price of a fixed AI capability falls",
        description: "The cost-of-intelligence index: for each GPQA Diamond threshold, the cheapest first-party API price (blended USD per million tokens) at which a model at or above it could be bought, how many times cheaper it has become, and how many months the price takes to halve.",
        input: z.object({}),
        run: async () => {
          const data = await loadCostOfIntelligence();
          return {
            text: costOfIntelligenceAnswer(data),
            structured: {
              asOf: data.asOf,
              modelCount: data.modelCount,
              page: siteUrl("/index/cost-of-intelligence"),
              csv: siteUrl("/api/site/indices/cost-of-intelligence.csv"),
              tiers: data.tiers.map((t) => ({ threshold: t.threshold, reference: t.reference, ratio: t.ratio, halvingMonths: t.halvingMonths, first: t.points[0] ?? null, current: t.points.at(-1) ?? null })),
            },
          };
        },
      },
    }],
  },
  async llms() {
    return { pages: [`- [Cost of intelligence](${siteUrl("/index/cost-of-intelligence")}): how fast the price of a fixed GPQA Diamond score falls; CSV at ${siteUrl("/api/site/indices/cost-of-intelligence.csv")}`] };
  },
  sitemap: { pages: [{ loc: "/index/cost-of-intelligence", changefreq: "weekly", priority: 0.8 }] },
});
