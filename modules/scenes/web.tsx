import { defineWebModule } from "@aihot/web/modules";
import { messages as walk } from "./web/walk/messages.ts";

export default defineWebModule({
  name: "scenes",
  messages: { en: walk.en },
});
