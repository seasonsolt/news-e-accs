import { defineModule, type ModulePage } from "@aihot/contracts/modules";

const pages: ModulePage[] = [{ path: "index/cost-of-intelligence", file: "web/routes/cost-of-intelligence.tsx", id: "index-cost-of-intelligence" }];

export default defineModule({
  name: "indices",
  pages: [...pages, ...pages.map((p) => ({ ...p, path: `zh/${p.path}`, id: `zh-${p.id}` }))],
  apiPaths: [/^\/api\/site\/indices\//],
  localizedPaths: [/^\/index\/cost-of-intelligence$/],
});
