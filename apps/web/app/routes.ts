import { type RouteConfig, type RouteConfigEntry, index, layout, route } from "@react-router/dev/routes";
import type { ModulePage } from "@aihot/contracts/modules";
import { MODULES } from "@aihot/site/modules";

/** A module's route module, from the app directory. */
const file = (module: string, path: string) => `../../../modules/${module}/${path}`;
const page = (module: string, p: ModulePage) => route(p.gray ? `preview/${p.path}` : p.path, file(module, p.file), p.id ? { id: p.id } : {});

/** The site's modules' pages, after the engine's. */
const modulePages: RouteConfigEntry[] = MODULES.flatMap((m) =>
  (m.pages ?? []).map((p) => ("layout" in p ? layout(file(m.name, p.layout), p.id ? { id: p.id } : {}, p.pages.map((c) => page(m.name, c))) : page(m.name, p))),
);
const moduleAdminPages: RouteConfigEntry[] = MODULES.flatMap((m) => (m.adminPages ?? []).map((p) => page(m.name, p)));

const publicRoutes: RouteConfig = [
  index("routes/home.tsx"),
  route("all", "routes/all.tsx"),
  route("all/search-busy", "routes/search-busy.tsx", { id: "all-search-busy" }),
  route("search-busy", "routes/search-busy.tsx", { id: "search-busy" }),
  route("items/:id", "routes/item.tsx"),
  route("items/:id/original", "routes/item-original.tsx", { id: "item-original" }),
  route("hot", "routes/hot.tsx"),
  route("story/:publicId", "routes/story.tsx"),
  route("daily", "routes/report-latest.tsx", { id: "daily-latest" }),
  route("daily/archive", "routes/daily-archive.tsx"),
  route("daily/:key", "routes/report-detail.tsx", { id: "daily-detail" }),
  route("weekly", "routes/report-latest.tsx", { id: "weekly-latest" }),
  route("weekly/:key", "routes/report-detail.tsx", { id: "weekly-detail" }),
  route("monthly", "routes/report-latest.tsx", { id: "monthly-latest" }),
  route("monthly/:key", "routes/report-detail.tsx", { id: "monthly-detail" }),
  route("topics", "routes/topics.tsx"),
  route("topics/:slug", "routes/topic.tsx", { id: "topic" }),
  route("topics/:slug/page/:page", "routes/topic.tsx", { id: "topic-page" }),
  route("chronicle", "routes/chronicle.tsx"),
  route("what-is-eacc", "routes/concept.tsx", { id: "concept-what-is-eacc" }),
  route("eacc-vs-dacc", "routes/concept.tsx", { id: "concept-eacc-vs-dacc" }),
  route("eacc-vs-ea", "routes/concept.tsx", { id: "concept-eacc-vs-ea" }),
  route("eacc-manifesto", "routes/concept.tsx", { id: "concept-eacc-manifesto" }),
  route("eacc-token", "routes/concept.tsx", { id: "concept-eacc-token" }),
  route("eacc-glossary", "routes/concept.tsx", { id: "concept-eacc-glossary" }),
  route("manifesto", "routes/manifesto.tsx"),
  route("products", "routes/products.tsx"),
  route("about", "routes/about.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("changelog", "routes/changelog.tsx"),
  route("feedback", "routes/feedback.tsx"),
  route("subscribe", "routes/subscribe.tsx"),
  route("more", "routes/more.tsx"),
  route("starred", "routes/starred.tsx"),
  route("agent", "routes/agent.tsx"),
];

function chineseRoutes(entries: Awaited<RouteConfig>): Awaited<RouteConfig> {
  return entries.map((entry) => ({
    ...entry,
    id: `zh-${entry.id ?? entry.file}`,
    ...(entry.children ? { children: chineseRoutes(entry.children) } : {}),
  }));
}

export default [
  ...publicRoutes,
  ...chineseRoutes(publicRoutes).map((entry) => ({ ...entry, index: undefined, path: entry.index ? "zh" : entry.path ? `zh/${entry.path}` : undefined,
    // Pathless layouts keep their children beneath the language prefix.
    ...(entry.children ? { children: entry.children.map((child) => ({ ...child, path: child.path ? `zh/${child.path}` : undefined })) } : {}),
  })),
  // Site modules' pages stay outside the /zh mirror: a module owns its own language handling.
  ...modulePages,
  route("admin/login", "routes/admin-login.tsx"),
  layout("routes/admin/layout.tsx", { id: "admin-layout" }, [
    route("admin", "routes/admin/index.tsx"),
    route("admin/content", "routes/admin/content.tsx"),
    route("admin/content/:id", "routes/admin/content-item.tsx"),
    route("admin/sources", "routes/admin/sources.tsx"),
    route("admin/sources/new", "routes/admin/source-new.tsx"),
    route("admin/sources/:id", "routes/admin/source.tsx"),
    route("admin/feedback", "routes/admin/feedback.tsx"),
    route("admin/newsletter", "routes/admin/newsletter.tsx"),
    route("admin/wechat", "routes/admin/wechat.tsx"),
    route("admin/analytics", "routes/admin/analytics.tsx"),
    route("admin/metrics", "routes/admin/metrics.tsx"),
    route("admin/runs", "routes/admin/runs.tsx"),
    route("admin/models", "routes/admin/models.tsx"),
    route("admin/selectbench", "routes/admin/selectbench.tsx"),
    route("admin/selectbench/:runId", "routes/admin/selectbench-run.tsx"),
    route("admin/settings", "routes/admin/settings.tsx"),
    route("admin/audit", "routes/admin/audit.tsx"),
    ...moduleAdminPages,
  ]),
] satisfies RouteConfig;
