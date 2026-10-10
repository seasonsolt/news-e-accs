// Share images (1200×630 PNG) for pages, items, reports, topics and events. Only public content
// gets a card; anything else is a real 404.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { beijingDate } from "@aihot/contracts/time";
import { localizePublication } from "@aihot/backend/publication/content-language";
import { distributionCategory, distributionLanguage, editionPath, editionReady, type DistributionLanguage } from "@aihot/backend/publication/distribution";
import { loadItemShare } from "@aihot/backend/publication/og";
import { loadReport, type ReportKind } from "@aihot/backend/publication/reports";
import { loadTopic } from "@aihot/backend/publication/topics";
import { loadStoryDetail, resolveStory } from "@aihot/backend/publication/stories";
import { SITE, withSubject } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { config } from "@aihot/backend/config";
import { ogEtag, renderOg, type OgCard } from "../og/render.ts";
import { posterEtag, renderPoster, type Poster } from "../og/poster.ts";

const S = SITE.subject;
const ZH_PAGES: Record<string, OgCard> = {
  site: { kicker: SITE.name, title: "追踪 AI 进展的新闻日报", subtitle: "精选 AI 新闻、归组相关报道，并提供每日简报。" },
  all: { kicker: `全部${withSubject("动态")}`, title: "所有信源的最新动态，一站看完", subtitle: "按时间汇总各信源的最新动态，可按类别与标签筛选。" },
  hot: { kicker: "热点榜", title: `过去 48 小时，大家在讨论什么`, subtitle: "热度指数、趋势与组成热度的公开来源。", accent: "hot" },
  daily: { kicker: withSubject("日报"), title: `每天 8 点，一份读得完的${withSubject("日报")}`, subtitle: `前一天值得关注的${S}动态。` },
  weekly: { kicker: withSubject("周报"), title: "一周大事，一次看清", subtitle: "本周的主线、重要发布与值得回看的讨论。" },
  monthly: { kicker: withSubject("月报"), title: "一个月的变化", subtitle: "月度主线与关键事件回顾。" },
  topics: { kicker: "主题", title: "长期追踪的方向", subtitle: "公司与机构、专题方向、内容形态。" },
  leaderboard: { kicker: "AI 模型排行榜", title: "多家公开评测的共识排名", subtitle: "综合、编程、推理、知识、专业办公；缺测不补零，价格不影响排名。" },
  "codex-reset": { kicker: "Tibo 重置监控", title: "Codex 额度重置什么时候生效", subtitle: "推算的北京时间窗口、适用范围与 Tibo 原话。", accent: "amber" },
  about: { kicker: "关于", title: `关于 ${SITE.name}`, subtitle: "精选 AI 新闻、归组相关报道，并提供每日简报。" },
  terms: { kicker: "使用规则", title: `${SITE.name} 使用规则`, subtitle: "网站、API、RSS 与 MCP 的使用范围。" },
  privacy: { kicker: "隐私说明", title: `${SITE.name} 隐私说明`, subtitle: "访问日志、浏览器本地数据与反馈资料的处理方式。" },
  chronicle: { kicker: "四维视角", title: "在时间里自由穿行", subtitle: "从大爆炸到此刻，再到公开的预测：每个时刻，人类走到了哪里" },
  changelog: { kicker: "更新日志", title: `${SITE.name} 更新日志`, subtitle: "功能更新、优化、公告与下线记录。" },
  feedback: { kicker: "反馈", title: "告诉我们哪里可以更好", subtitle: "内容、功能、接入，或来源方的更正与下架请求。" },
  agent: { kicker: "Agent 接入", title: `让 Agent 直接使用 ${SITE.name}`, subtitle: "MCP、RSS 与 REST API v1，匿名只读。" },
};

const PAGES: Record<string, OgCard> = {
  site: { kicker: SITE.name, title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: "AI news", title: "The latest from every source", subtitle: "Public AI news, organized by time, category, and topic." },
  hot: { kicker: "Hot topics", title: "What is everyone discussing?", subtitle: "Events gaining attention across independent sources in the past 48 hours.", accent: "hot" },
  daily: { kicker: "Daily briefing", title: "The AI news worth your time", subtitle: "A concise daily guide to the stories that matter." },
  weekly: { kicker: "Weekly briefing", title: "The week in AI", subtitle: "Major releases, emerging stories, and discussions worth revisiting." },
  monthly: { kicker: "Monthly briefing", title: "A month of progress", subtitle: "The trends and events shaping AI." },
  topics: { kicker: "Topics", title: "Follow the bigger picture", subtitle: "Companies, research directions, and recurring themes." },
  leaderboard: { kicker: "AI model leaderboard", title: "Consensus across public benchmarks", subtitle: "Overall, coding, reasoning, knowledge, and professional tasks." },
  "codex-reset": { kicker: "Tibo reset monitor", title: "When does the Codex quota reset?", subtitle: "Estimated windows, scope, and Tibo's original posts.", accent: "amber" },
  about: { kicker: "About", title: `About ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "Terms", title: `${SITE.name} terms of use`, subtitle: "Website, API, RSS, and MCP usage." },
  privacy: { kicker: "Privacy", title: `${SITE.name} privacy information`, subtitle: "Information about logs, browser data, and feedback." },
  chronicle: { kicker: "Chronicle", title: "Explore the arc of progress", subtitle: "From the Big Bang to today and beyond." },
  changelog: { kicker: "Changelog", title: `${SITE.name} updates`, subtitle: "New features, improvements, and announcements." },
  feedback: { kicker: "Feedback", title: "Help us improve", subtitle: "Share feedback or request a correction or removal." },
  agent: { kicker: "For agents", title: `Connect your agent to ${SITE.name}`, subtitle: "Anonymous, read-only MCP, RSS, and REST API access." },
};

function languageHandler(run: (req: FastifyRequest, reply: FastifyReply, lang: DistributionLanguage) => Promise<unknown>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    let lang: DistributionLanguage;
    try { lang = distributionLanguage((req.query as { lang?: unknown }).lang); }
    catch { return reply.code(400).header("Cache-Control", "no-store").send({ error: "lang must be en or zh" }); }
    return run(req, reply, lang);
  };
}

/**
 * Article share images carry the title and summary, so shared caches keep them for an hour at most:
 * after a withdrawal or a correction they are gone from any cache within the hour.
 */
export const ARTICLE_IMAGE_CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600";
const ARTICLE_IMAGE_ORIGIN_SECONDS = "300";

async function send(req: FastifyRequest, reply: FastifyReply, card: OgCard, maxAge: number, cacheControl = `public, max-age=${maxAge}, s-maxage=${maxAge * 7}, stale-while-revalidate=86400`) {
  const tag = `"og-${ogEtag(card)}"`;
  reply.header("ETag", tag).header("Cache-Control", cacheControl);
  if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
  return reply.type("image/png").send((await renderOg(card)).png);
}

function notFound(reply: FastifyReply) {
  return reply.code(404).header("Cache-Control", "public, max-age=300").type("text/plain; charset=utf-8").send("Not found");
}

const REPORT_NAMES: Record<ReportKind, string> = { daily: "Daily briefing", weekly: "Weekly briefing", monthly: "Monthly briefing" };

export function registerOg(app: FastifyInstance) {
  app.get("/og/site.png", languageHandler(async (req, reply, lang) => send(req, reply, (lang === "en" ? PAGES : ZH_PAGES).site!, 86400)));

  app.get("/og/pages/:file", languageHandler(async (req, reply, lang) => {
    const name = (req.params as { file: string }).file.replace(/\.png$/, "");
    const card = (lang === "en" ? PAGES : ZH_PAGES)[name];
    if ((name === "leaderboard" && !FEATURES.leaderboard) || (name === "codex-reset" && !FEATURES.codexResetMonitor)) return notFound(reply);
    if (!card || !(req.params as { file: string }).file.endsWith(".png")) return notFound(reply);
    return send(req, reply, card, 86400);
  }));

  app.get("/og/items/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4), lang);
    if (!d) return notFound(reply);
    reply.header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    return send(req, reply, {
      kicker: d.category ? distributionCategory(d.category, lang) : lang === "en" ? "AI news" : withSubject("动态"),
      title: d.title,
      subtitle: d.summary,
      meta: `${d.source.name.replace(/（[^）]*）\s*$/, "")} · ${beijingDate(d.timelineAt)}`,
      badge: d.selected && d.score !== null ? { value: String(Math.round(d.score)), label: lang === "en" ? "Editorial score" : "精选评分" } : null,
    }, 3600, ARTICLE_IMAGE_CACHE);
  }));

  // Phone share poster for an article (1080×1440), generated on first request and cached by content.
  app.get("/og/posters/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const d = await loadItemShare(file.slice(0, -4), lang);
    if (!d) return notFound(reply);
    const poster: Poster = {
      language: lang,
      url: `${config.siteUrl}${editionPath(`/items/${d.id}`, lang)}`,
      kicker: d.category ? distributionCategory(d.category, lang) : lang === "en" ? "AI news" : withSubject("动态"),
      title: d.title,
      summary: d.summary,
      source: d.source.name.replace(/（[^）]*）\s*$/, ""),
      date: beijingDate(d.timelineAt),
      score: d.selected ? d.score : null,
    };
    const tag = `"poster-${posterEtag(poster)}"`;
    reply.header("ETag", tag).header("Cache-Control", ARTICLE_IMAGE_CACHE).header("X-Accel-Expires", ARTICLE_IMAGE_ORIGIN_SECONDS);
    if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
    return reply.type("image/png").send((await renderPoster(poster)).png);
  }));

  app.get("/og/reports/:kind/:file", languageHandler(async (req, reply, lang) => {
    const { kind, file } = req.params as { kind: string; file: string };
    if (!["daily", "weekly", "monthly"].includes(kind) || !file.endsWith(".png")) return notFound(reply);
    const source = await loadReport(kind as ReportKind, file.slice(0, -4));
    const r = source ? await localizePublication(source, lang) : null;
    if (!r || !editionReady(r, lang)) return notFound(reply);
    return send(req, reply, {
      kicker: `${lang === "en" ? REPORT_NAMES[r.kind] : withSubject(r.kind === "daily" ? "日报" : r.kind === "weekly" ? "周报" : "月报")} · ${r.key}`,
      title: r.lead?.title ?? r.title,
      subtitle: r.lead?.leadParagraph ?? r.overview,
      meta: lang === "en" ? `${r.stories.length} stories · ${r.readingMinutes} min read` : `${r.stories.length} 条核心新闻 · 约 ${r.readingMinutes} 分钟读完`,
    }, 86400);
  }));

  app.get("/og/topics/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    const t = file.endsWith(".png") ? await loadTopic(file.slice(0, -4)) : null;
    if (!t || (lang === "en" && !editionReady(t, lang))) return notFound(reply);
    return send(req, reply, { kicker: lang === "en" ? "Topic" : "主题", title: t.name, subtitle: t.definition }, 86400);
  }));

  app.get("/og/stories/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const found = await resolveStory(file.slice(0, -4));
    if (found.kind !== "found") return notFound(reply);
    const source = await loadStoryDetail(found.storyId);
    const s = source ? await localizePublication(source, lang) : null;
    if (!s || !editionReady(s, lang)) return notFound(reply);
    return send(req, reply, {
      kicker: lang === "en" ? (s.whyHot.rank ? `Hot topic #${s.whyHot.rank}` : "Story") : (s.whyHot.rank ? `热点第 ${s.whyHot.rank} · 事件` : "事件"),
      title: s.title,
      subtitle: s.latest ?? s.digest,
      meta: lang === "en" ? `${s.sourceCount} sources · ${s.reportCount} reports` : `${s.sourceCount} 个来源 · ${s.reportCount} 篇报道`,
      accent: s.whyHot.rank ? "hot" : "teal",
    }, 3600);
  }));
}
