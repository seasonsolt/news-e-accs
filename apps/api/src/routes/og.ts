// Share images (1200×630 PNG) for pages, items, reports, topics and events. Only public content
// gets a card; anything else is a real 404.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { beijingDate } from "@aihot/contracts/time";
import { localizePublication } from "@aihot/backend/publication/content-language";
import { distributionCategory, distributionLanguage, editionPath, editionReady, type DistributionLanguage } from "@aihot/backend/publication/distribution";
import { loadItemOgCard, loadItemShare } from "@aihot/backend/publication/og";
import { loadReport, type ReportKind } from "@aihot/backend/publication/reports";
import { findTopic, TOPIC_GROUPS, TOPICS, topicText } from "@aihot/backend/publication/topics";
import { loadStoryDetail, resolveStory } from "@aihot/backend/publication/stories";
import { ogEtag, renderOg, type OgCard } from "@aihot/backend/media/og";
import { posterEtag, renderPoster, type Poster } from "@aihot/backend/media/poster";
import { CARDS, ITEM_COPY, REPORTS, SITE, subjectAfter, withSubject } from "@aihot/site";
import { config } from "@aihot/backend/config";

/** The Chinese edition's cards: the site's texts (CARDS), the topic count of the topic list, and the cards this fork words itself. */
const ZH_PAGES: Record<string, OgCard> = {
  ...CARDS,
  site: { kicker: SITE.name, title: "追踪 AI 进展的新闻日报", subtitle: "精选 AI 新闻、归组相关报道，并提供每日简报。" },
  topics: { kicker: "主题", title: `${TOPICS.length} ${subjectAfter("个长期追踪的", "方向")}`, subtitle: `${TOPIC_GROUPS.map((g) => g.name).join("、")}。` },
  about: { kicker: "关于", title: `关于 ${SITE.name}`, subtitle: "精选 AI 新闻、归组相关报道，并提供每日简报。" },
  chronicle: { kicker: "四维视角", title: "在时间里自由穿行", subtitle: "从大爆炸到此刻，再到公开的预测：每个时刻，人类走到了哪里" },
};

const PAGES: Record<string, OgCard> = {
  site: { kicker: SITE.name, title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: "AI news", title: "The latest from every source", subtitle: "Public AI news, organized by time, category, and topic." },
  hot: { kicker: "Hot topics", title: "What is everyone discussing?", subtitle: "Events gaining attention across independent sources in the past 48 hours.", accent: "hot" },
  daily: { kicker: "Daily briefing", title: "The AI news worth your time", subtitle: "A concise daily guide to the stories that matter." },
  weekly: { kicker: "Weekly briefing", title: "The week in AI", subtitle: "Major releases, emerging stories, and discussions worth revisiting." },
  monthly: { kicker: "Monthly briefing", title: "A month of progress", subtitle: "The trends and events shaping AI." },
  topics: { kicker: "Topics", title: "Follow the bigger picture", subtitle: "Companies, research directions, and recurring themes." },
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
 * Article, event and report images carry editable content. A reader may keep a copy for five
 * minutes; shared caches are refreshed on publication changes. Brand images keep their own lifetime.
 */
const CONTENT_IMAGE_CACHE = "public, max-age=300, s-maxage=3600, must-revalidate";

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
    if (!card || !(req.params as { file: string }).file.endsWith(".png")) return notFound(reply);
    return send(req, reply, card, 86400);
  }));

  app.get("/og/items/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    if (!file.endsWith(".png")) return notFound(reply);
    const card = await loadItemOgCard(file.slice(0, -4), lang);
    if (!card) return notFound(reply);
    return send(req, reply, card, 3600, CONTENT_IMAGE_CACHE);
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
      source: d.source.name,
      date: beijingDate(d.timelineAt),
      score: d.selected && ITEM_COPY.showScore ? d.score : null,
    };
    const tag = `"poster-${posterEtag(poster)}"`;
    reply.header("ETag", tag).header("Cache-Control", CONTENT_IMAGE_CACHE);
    if (String(req.headers["if-none-match"] ?? "").split(",").some((t) => t.trim().replace(/^W\//, "") === tag)) return reply.code(304).send();
    return reply.type("image/png").send((await renderPoster(poster)).png);
  }));

  app.get("/og/reports/:kind/:file", languageHandler(async (req, reply, lang) => {
    const { kind, file } = req.params as { kind: string; file: string };
    if (!["daily", "weekly", "monthly"].includes(kind) || !file.endsWith(".png")) return notFound(reply);
    const source = await loadReport(kind as ReportKind, file.slice(0, -4));
    const r = source ? await localizePublication(source, lang) : null;
    if (!r || !editionReady(r, lang)) return notFound(reply);
    const count = r.sections.reduce((n, s) => n + s.items.length, 0);
    return send(req, reply, {
      kicker: `${lang === "en" ? REPORT_NAMES[r.kind] : withSubject(r.kind === "daily" ? "日报" : r.kind === "weekly" ? "周报" : "月报")} · ${r.key}`,
      title: r.lead?.title ?? r.title,
      subtitle: r.lead?.leadParagraph ?? r.overview,
      // A quiet day's issue (REPORTS.quiet) has nothing to count.
      meta: count > 0 ? (lang === "en" ? `${count} stories · ${r.readingMinutes} min read` : `${count} ${REPORTS.shareUnit} · 约 ${r.readingMinutes} 分钟读完`) : null,
    }, 3600, CONTENT_IMAGE_CACHE);
  }));

  app.get("/og/topics/:file", languageHandler(async (req, reply, lang) => {
    const file = (req.params as { file: string }).file;
    const t = file.endsWith(".png") ? findTopic(file.slice(0, -4)) : null;
    if (!t) return notFound(reply);
    if (lang === "en") return send(req, reply, { kicker: "Topic", title: topicText(t, "en").name, subtitle: topicText(t, "en").definition }, 86400);
    return send(req, reply, { kicker: `主题 · ${TOPIC_GROUPS.find((g) => g.key === t.group)?.name ?? ""}`, title: `${t.name} 最新动态`, subtitle: t.definition }, 86400);
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
    }, 3600, CONTENT_IMAGE_CACHE);
  }));
}
