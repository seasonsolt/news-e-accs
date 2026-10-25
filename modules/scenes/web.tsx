import { defineWebModule } from "@aihot/web/modules";
import { SCENES } from "./scenes.ts";
import { messages as differenceEngine } from "./web/difference-engine-1822/messages.ts";

export default defineWebModule({
  name: "scenes",
  messages: { en: differenceEngine.en },
  chronicle: { scenes: SCENES.map(({ milestone, path, label }) => ({ milestone, path, label })) },
});
