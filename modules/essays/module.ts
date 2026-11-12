import { defineModule, type ModulePage } from "@aihot/contracts/modules";

const pages: ModulePage[] = [
  { path: "essays", file: "web/routes/essays.tsx", id: "essays" },
  { path: "essays/:slug", file: "web/routes/essay.tsx", id: "essay" },
];

export default defineModule({
  name: "essays",
  pages: [...pages, ...pages.map((p) => ({ ...p, path: `zh/${p.path}`, id: `zh-${p.id}` }))],
  adminPages: [
    { path: "admin/essays", file: "web/admin/essays.tsx", id: "admin-essays" },
    { path: "admin/essays/:id", file: "web/admin/essay.tsx", id: "admin-essay" },
  ],
  apiPaths: [/^\/api\/site\/essays(?:\/|$)/, /^\/api\/admin\/essays(?:\/|$)/, /^\/essays\/media\//, /^\/feed\/(?:zh\/)?essays\.xml$/],
  localizedPaths: [/^\/essays(?:\/[a-z0-9-]+)?$/],
});
