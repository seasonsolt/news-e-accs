import { defineWebModule } from "@aihot/web/modules";
import { IconPen } from "@aihot/web/components/icons";
import { CHINESE, ENGLISH } from "./web/messages.ts";

export default defineWebModule({
  name: "essays",
  messages: { en: ENGLISH, zh: CHINESE },
  // A section of its own in the top bar and the phone's tab bar; it stays lit on every essay (/essays/<slug>).
  sidebar: { section: "长文", items: [{ to: "/essays", label: "长文", icon: IconPen }] },
  admin: { content: [{ to: "/admin/essays", label: "长文", count: "essayTasks", tone: "accent" }] },
});
