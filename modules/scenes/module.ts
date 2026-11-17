import { defineModule } from "@aihot/contracts/modules";

// The chronicle's walk (加速史): one continuous world from a hearth to the monolith, opened from the chronicle.
// The workshops it replaced, and their directory, were at /chronicle/<name>; those addresses lead here.
const RETIRED = "workshops|stone-tools|fire|agriculture|difference-engine|agents|writing|iron|printing|observatory|steam|electric|flight|logic|space|network";

export default defineModule({
  name: "scenes",
  pages: [
    { path: "chronicle/walk", file: "web/walk/page.tsx", id: "scene-walk" },
    { path: "zh/chronicle/walk", file: "web/walk/page.tsx", id: "zh-scene-walk" },
  ],
  redirects: [
    { match: "regex", path: `^/chronicle/(?:${RETIRED})$`, status: 301, location: "/chronicle/walk", why: "the retired workshops" },
    { match: "regex", path: `^/zh/chronicle/(?:${RETIRED})$`, status: 301, location: "/zh/chronicle/walk", why: "the retired workshops" },
  ],
  localizedPaths: [/^\/chronicle\/walk$/],
});
