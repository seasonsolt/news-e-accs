import { defineWebModule } from "@aihot/web/modules";
import { SCENES } from "./scenes.ts";
import { messages as differenceEngine } from "./web/difference-engine-1822/messages.ts";
import { messages as workshops } from "./web/shared/messages.ts";

export default defineWebModule({
  name: "scenes",
  messages: { en: { ...differenceEngine.en, ...workshops.en } },
  chronicle: { scenes: SCENES.map(({ milestone, era, path, label }) => ({ milestone, era, path, label })) },
});
