import { mcpToolName } from "@aihot/contracts/mcp";
import { COST_OF_INTELLIGENCE_TOOL } from "./contracts.ts";
import { defineWebModule } from "@aihot/web/modules";
import { IconTrendDown } from "@aihot/web/components/icons";
import { CHINESE } from "./i18n/messages.ts";

export default defineWebModule({
  name: "indices",
  agent: async () => ({ default: {
    tools: [{ name: mcpToolName(COST_OF_INTELLIGENCE_TOOL), does: "How fast the price of a fixed AI capability falls", ask: "How much cheaper has AI become?" }],
    resources: [["Cost of intelligence", "/api/v1/agent/cost-of-intelligence", "AI capability prices and halving times"]],
    api: { group: "Cost of intelligence", rows: [["/api/v1/agent/cost-of-intelligence", "AI capability prices and halving times", "Once a week"]] },
  } }),
  messages: { zh: CHINESE },
  tools: [{ to: "/index/cost-of-intelligence", label: "Cost of intelligence", icon: <IconTrendDown size={18} /> }],
  home: { links: [{ to: "/index/cost-of-intelligence", label: "The cost of intelligence" }] },
});
