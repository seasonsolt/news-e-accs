// The cost-of-intelligence index for AI agents: the Markdown at /api/v1/agent/cost-of-intelligence and the
// MCP tool's text (backend/modules.ts AgentAbility). The numbers are the site's own, so nothing is fenced off
// as external data.
import { SITE } from "@aihot/site";
import { answer, NO_INTERNALS } from "@aihot/backend/publication/agent";
import { siteUrl } from "@aihot/backend/publication/links";
import type { CostOfIntelligence } from "../contracts.ts";

const usd = (price: number) => `$${price < 1 ? price.toPrecision(2) : price.toFixed(2)}`;

export function costOfIntelligenceAnswer(data: CostOfIntelligence): string {
  const head = [
    `# ${SITE.name} 智能成本指数（${data.asOf}）`,
    "",
    "达到同一 GPQA Diamond 分数的最便宜模型，每百万 token 的混合价格（3 份输入 + 1 份输出，美元）随时间怎么变。每档一条阶梯线：每次有更便宜的模型上市或降价，就下一个台阶。",
    "",
    "| GPQA 门槛 | 最早一级 | 现在最便宜 | 便宜了 | 价格减半约需 |",
    "|---|---|---|---|---|",
    ...data.tiers.map((t) => {
      const first = t.points[0];
      const now = t.points.at(-1);
      if (!first || !now) return `| ≥ ${Math.round(t.threshold * 100)}% | — | 还没有模型达到 | — | — |`;
      return `| ≥ ${Math.round(t.threshold * 100)}%（${t.reference}） | ${first.date} ${first.model.name} ${usd(first.price)} | ${now.date} ${now.model.name} ${usd(now.price)} | ${t.ratio ? `${Math.round(t.ratio)} 倍` : "—"} | ${t.halvingMonths ? `${t.halvingMonths.toFixed(1)} 个月` : "—"} |`;
    }),
    "",
    `共 ${data.modelCount} 个同时有 GPQA 分数和官方 API 价格的模型。价格是厂商官方标准价，每条附出处；人民币价格按${data.fx ? ` ${data.fx.asOf} 的汇率 ${data.fx.rate}` : "最新汇率"}折算。GPQA 分数来自 Epoch AI（CC BY 4.0）。`,
    "",
    `页面：${siteUrl("/index/cost-of-intelligence")}　数据下载（CSV）：${siteUrl("/api/site/indices/cost-of-intelligence.csv")}`,
  ];
  return answer(head, null, [
    "先说结论：同等能力的价格降了多少倍、多久降一半；再按用户关心的门槛给具体模型和价格。",
    "这是按公开价格算的趋势，不代表某个模型在用户任务上的实际效果；倍数和减半时间会随新模型和降价变化，以页面上的最新数字为准。",
    `引用时写「${SITE.name} 智能成本指数」并附页面链接。`,
    NO_INTERNALS,
  ]);
}
