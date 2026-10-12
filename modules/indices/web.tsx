import { defineWebModule } from "@aihot/web/modules";
import { IconTrendDown } from "@aihot/web/components/icons";
import { CHINESE } from "./i18n/messages.ts";

export default defineWebModule({
  name: "indices",
  messages: { zh: CHINESE },
  tools: [{ to: "/index/cost-of-intelligence", label: "Cost of intelligence", icon: <IconTrendDown size={18} /> }],
});
