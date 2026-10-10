import { defineModule, type ModulePage } from "@aihot/contracts/modules";

const pages: ModulePage[] = [
  { path: "leaderboard/sources", file: "web/routes/leaderboard-sources.tsx", id: "leaderboard-sources" },
  { path: "leaderboard/sources/:key", file: "web/routes/leaderboard-source.tsx", id: "leaderboard-source" },
  { path: "leaderboard/rules", file: "web/routes/leaderboard-rules.tsx", id: "leaderboard-rules" },
  { path: "leaderboard/:slug", file: "web/routes/leaderboard-model.tsx", id: "leaderboard-model" },
];
const boards: ModulePage[] = [
  { path: "leaderboard", file: "web/routes/leaderboard.tsx", id: "leaderboard" },
  { path: "leaderboard/category/:key", file: "web/routes/leaderboard.tsx", id: "leaderboard-category" },
];
const chinese = (p: ModulePage): ModulePage => ({ ...p, path: `zh/${p.path}`, id: `zh-${p.id}` });

export default defineModule({
  name: "leaderboard",
  pages: [
    { layout: "web/routes/leaderboard-boards.tsx", id: "leaderboard-boards", pages: boards },
    ...pages,
    { layout: "web/routes/leaderboard-boards.tsx", id: "zh-leaderboard-boards", pages: boards.map(chinese) },
    ...pages.map(chinese),
  ],
  redirects: [
    { match: "exact", path: "/leaderboard/methodology", status: 308, location: "/leaderboard/sources" },
    { match: "regex", path: "^/leaderboard/category/(aesthetics|writing)$", status: 307, location: "/leaderboard", why: "data-layer categories not yet public" },
    { match: "exact", path: "/leaderboard/category/overall", status: 404, why: "the overall board lives at /leaderboard" },
  ],
  apiPaths: [/^\/api\/site\/leaderboard\//, /^\/(model-providers|leaderboard-sources)\//],
  localizedPaths: [/^\/leaderboard(?:\/.*)?$/],
  timePaths: [/^\/leaderboard(?:\/|$)/],
});
