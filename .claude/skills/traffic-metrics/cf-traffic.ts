// Reader traffic from Cloudflare's request log: who is a person, how many there were, where they landed,
// whether they read on, and who else (crawlers, AI assistants, feed readers, agents) fetched the site.
// Days are Beijing/Taipei calendar days (UTC+8), the same days as the site's own page-view counters.
//   node .claude/skills/traffic-metrics/cf-traffic.ts [--days 7] [--until 2026-10-15] [--zone <zone id>] [--host e-acc.ai] [--json]
// Needs the `cf` CLI signed in with Analytics Read on the zone. Reads only.
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { addDays, beijingDate, beijingMidnight } from "@aihot/contracts/time";

const { values: args } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    until: { type: "string" },
    zone: { type: "string", default: process.env.CLOUDFLARE_ZONE_ID ?? "36c73abc72da63fed2f8ace234ae87d1" },
    host: { type: "string", default: process.env.SITE_URL ? new URL(process.env.SITE_URL).host : "e-acc.ai" },
    json: { type: "boolean", default: false },
  },
});

/** A person rarely opens more than this many full pages from one browser in a day without navigating in-app. */
const MAX_FULL_LOADS = 15;
/** Above that, a person navigates in-app at least once per this many further full loads; a crawler that renders
 * JavaScript reloads nearly every page (Chrome/145 Mac on 10-18: 278 loads, 2 navigations). */
const LOADS_PER_NAV = 10;
const SESSION_GAP_MS = 30 * 60_000;
const ROW_LIMIT = 10_000;
const BOT_WORDS = /bot|crawl|spider|slurp|headless|preview|fetch|scan|monitor|python|curl|wget|go-http|axios|node|java\/|compatible;/i;

// Known machine readers. "user" ones fetch because a person just asked an assistant something.
const AGENTS: Array<[name: string, match: RegExp, user?: true]> = [
  ["ChatGPT-User", /ChatGPT-User/, true], ["OAI-SearchBot", /OAI-SearchBot/], ["GPTBot", /GPTBot/],
  ["Claude-User", /Claude-User/, true], ["Claude-SearchBot", /Claude-SearchBot/], ["ClaudeBot", /ClaudeBot/],
  ["Perplexity-User", /Perplexity-User/, true], ["PerplexityBot", /PerplexityBot/],
  ["MistralAI-User", /MistralAI-User/, true], ["DuckAssistBot", /DuckAssistBot/],
  ["Googlebot", /Googlebot|Google-InspectionTool|GoogleOther/], ["bingbot", /bingbot/i], ["Applebot", /Applebot/],
  ["Amazonbot", /Amazonbot/], ["meta-externalagent", /meta-external/], ["Bytespider", /Bytespider/], ["CCBot", /CCBot/],
  ["YandexBot", /YandexBot/], ["Baiduspider", /Baiduspider/], ["DuckDuckBot", /DuckDuckBot/],
];

const PATH_CLASS = `CASE
  WHEN clientRequestPath LIKE '/api/admin%' OR (clientRequestPath LIKE '/admin/%' AND clientRequestPath LIKE '%.data') THEN 'owner'
  WHEN clientRequestPath LIKE '/admin%' THEN 'admin'
  WHEN clientRequestPath = '/api/site/analytics' THEN 'beacon'
  WHEN clientRequestPath LIKE '/assets/%' THEN 'assets'
  WHEN clientRequestPath LIKE '%.data' THEN 'nav'
  WHEN clientRequestPath LIKE '/api/v1/%' OR clientRequestPath = '/openapi-v1.json' THEN 'api'
  WHEN clientRequestPath LIKE '/api/mcp%' THEN 'mcp'
  WHEN clientRequestPath LIKE '/feed%' THEN 'feed'
  WHEN clientRequestPath LIKE '/llms%' OR clientRequestPath LIKE '%.md' THEN 'agent-md'
  WHEN clientRequestPath = '/robots.txt' OR clientRequestPath LIKE '/sitemap%' THEN 'crawl-meta'
  WHEN clientRequestPath LIKE '/api/%' THEN 'site-api'
  WHEN clientRequestPath LIKE '%.%' OR clientRequestPath LIKE '/og/%' OR clientRequestPath LIKE '/cdn-cgi/%' THEN 'file'
  ELSE 'page' END`;
const PAGE_OR_NAV = `(clientRequestPath LIKE '%.data' OR (clientRequestPath NOT LIKE '%.%' AND clientRequestPath NOT LIKE '/api%'
  AND clientRequestPath NOT LIKE '/og/%' AND clientRequestPath NOT LIKE '/cdn-cgi/%' AND clientRequestPath NOT LIKE '/feed%' AND clientRequestPath NOT LIKE '/admin%'))`;

type Agg = { ua: string; cat: string; cls: string; ok: string; okw: string; n: string };
type Hit = { ts: string; ua: string; path: string };

function cf<T>(query: string, since: Date, until: Date): T[] {
  const out = execFileSync("cf", ["sql", "query", `${query} FORMAT JSONEachRow`, "--scope-zone", args.zone,
    "--time-since", since.toISOString().replace(".000", ""), "--time-until", until.toISOString().replace(".000", "")],
  { cwd: tmpdir(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  let body: unknown;
  try {
    body = JSON.parse(out);
  } catch {
    throw new Error(`cf sql query failed:\n${out.slice(0, 800)}`);
  }
  if (typeof body !== "string") throw new Error(`unexpected cf output: ${out.slice(0, 300)}`);
  const rows = body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  if (rows.length >= ROW_LIMIT) console.error(`warning: a query on ${beijingDate(since)} hit ${ROW_LIMIT} rows; the day is undercounted`);
  return rows;
}

/** The page an in-app navigation fetched: /story/abc.data is /story/abc, and the home page's data is /_.data. */
function pagePath(raw: string): string {
  return raw === "/_.data" || raw === "/_root.data" ? "/" : raw.replace(/\.data$/, "").replace(/(.)\/$/, "$1");
}

/** Route-level path, like the site's own counters: /story/abc → /story/:id. */
function route(raw: string): string {
  const path = pagePath(raw);
  const zh = path === "/zh" || path.startsWith("/zh/");
  const rest = zh ? path.slice(3) || "/" : path;
  const generic = rest
    .replace(/^\/story\/[^/]+$/, "/story/:id")
    .replace(/^\/items\/[^/]+\/original$/, "/items/:id/original")
    .replace(/^\/items\/[^/]+$/, "/items/:id")
    .replace(/^\/(daily|weekly|monthly)\/[^/]+$/, "/$1/:issue")
    .replace(/^\/topics\/[^/]+(\/page\/\d+)?$/, "/topics/:slug")
    .replace(/^\/leaderboard\/.+$/, "/leaderboard/…");
  return zh ? `/zh${generic === "/" ? "" : generic}` : generic;
}

type UaDay = { beacon: number; pages: number; navs: number; assets: number; owner: number; rows: number; weighted: number };
type Session = { ua: string; landing: string; paths: string[] };

// A person opened a page and ran the page's code (the view beacon, scripts or an in-app navigation), without
// the many full loads and few navigations of a crawler that renders JavaScript.
const isPerson = (s: UaDay) => s.beacon + s.pages + s.navs > 0 && (s.beacon > 0 || s.assets > 0 || s.navs > 0)
  && (s.pages <= MAX_FULL_LOADS || (s.navs > 0 && s.navs * LOADS_PER_NAV >= s.pages - MAX_FULL_LOADS));

const until = args.until ?? addDays(beijingDate(Date.now()), -1);
const days = Array.from({ length: Number(args.days) }, (_, i) => addDays(until, i - Number(args.days) + 1));
const host = args.host.replace(/'/g, "");

const perDay: Array<{ day: string; ua: Map<string, UaDay>; sessions: Session[]; rows: Agg[] }> = [];
for (const day of days) {
  const since = beijingMidnight(day), end = beijingMidnight(addDays(day, 1));
  const rows = cf<Agg>(`SELECT userAgent ua, verifiedBotCategory cat, ${PATH_CLASS} cls,
      sum(CASE WHEN edgeResponseStatus IN ('200', '204', '304') THEN 1 ELSE 0 END) ok,
      sum(CASE WHEN edgeResponseStatus IN ('200', '204', '304') THEN sampleInterval ELSE 0 END) okw, count(*) n
    FROM events.httpRequests WHERE clientRequestHttpHost = '${host}' GROUP BY 1, 2, 3 LIMIT ${ROW_LIMIT}`, since, end);
  const ua = new Map<string, UaDay>();
  for (const r of rows) {
    if (r.cat || !r.ua.startsWith("Mozilla/") || BOT_WORDS.test(r.ua)) continue;
    const s = ua.get(r.ua) ?? { beacon: 0, pages: 0, navs: 0, assets: 0, owner: 0, rows: 0, weighted: 0 };
    const ok = Number(r.ok);
    // Static assets are sampled heavily and only ever answer yes or no; views are what the sampling column is about.
    if (r.cls === "beacon" || r.cls === "page" || r.cls === "nav") {
      s.rows += ok;
      s.weighted += Number(r.okw);
    }
    if (r.cls === "beacon") s.beacon += ok;
    else if (r.cls === "page") s.pages += ok;
    else if (r.cls === "nav") s.navs += ok;
    else if (r.cls === "assets") s.assets += ok;
    else if (r.cls === "owner") s.owner += ok;
    ua.set(r.ua, s);
  }
  // Only the readers' own hits: a crawler rotating browser UAs (10-25: 80,000 loads a day) would fill the row limit.
  const readers = [...ua].filter(([, s]) => isPerson(s)).map(([agent]) => `'${agent.replace(/'/g, "''")}'`);
  const events = readers.length === 0 ? [] : cf<Hit>(`SELECT timestamp ts, userAgent ua, clientRequestPath path FROM events.httpRequests
    WHERE clientRequestHttpHost = '${host}' AND verifiedBotCategory = '' AND edgeResponseStatus = '200'
      AND userAgent IN (${readers.join(", ")}) AND ${PAGE_OR_NAV}
    ORDER BY timestamp LIMIT ${ROW_LIMIT}`, since, end);
  const byUa = new Map<string, Array<{ t: number; path: string }>>();
  for (const e of events) {
    const list = byUa.get(e.ua) ?? [];
    list.push({ t: Date.parse(`${e.ts.replace(" ", "T")}Z`), path: e.path });
    byUa.set(e.ua, list);
  }
  const sessions: Session[] = [];
  for (const [agent, list] of byUa) {
    let current: Session | null = null, last = 0;
    for (const e of list) {
      if (!current || e.t - last > SESSION_GAP_MS) sessions.push(current = { ua: agent, landing: pagePath(e.path), paths: [] });
      current.paths.push(route(e.path));
      last = e.t;
    }
  }
  perDay.push({ day, ua, sessions, rows });
}

// Only a signed-in admin gets a 200 from the admin API or an admin page's data; that browser is left out of every day.
const owner = new Set(perDay.flatMap((d) => [...d.ua].filter(([, s]) => s.owner > 0).map(([agent]) => agent)));
const seen = new Set<string>();
const daily = perDay.map(({ day, ua, sessions }) => {
  const people = [...ua].filter(([agent, s]) => !owner.has(agent) && isPerson(s));
  const peopleSet = new Set(people.map(([agent]) => agent));
  const disguised = [...ua].filter(([agent, s]) => !owner.has(agent) && !isPerson(s) && s.pages > 0);
  const own = sessions.filter((s) => peopleSet.has(s.ua));
  const returning = people.filter(([agent]) => seen.has(agent)).length;
  for (const [agent] of people) seen.add(agent);
  return {
    day,
    // Cloudflare keeps one row per N requests at busy moments; above 1.0 the counts here are rows seen, not the full volume.
    sampling: people.reduce((n, [, s]) => n + s.weighted, 0) / Math.max(1, people.reduce((n, [, s]) => n + s.rows, 0)),
    uv: people.length,
    returning,
    pv: people.reduce((n, [, s]) => n + (s.beacon > 0 ? s.beacon : s.pages + s.navs), 0),
    fullLoads: people.reduce((n, [, s]) => n + s.pages, 0),
    sessions: own.length,
    bounced: own.filter((s) => s.paths.length === 1).length,
    disguisedUas: disguised.length,
    disguisedLoads: disguised.reduce((n, [, s]) => n + s.pages, 0),
    own,
  };
});

const allSessions = daily.flatMap((d) => d.own);
function table<T>(items: T[], key: (x: T) => string, top = 12) {
  const groups = new Map<string, T[]>();
  for (const x of items) groups.set(key(x), [...(groups.get(key(x)) ?? []), x]);
  return [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, top);
}
const landingRoutes = table(allSessions, (s) => route(s.landing)).map(([r, list]) => ({
  route: r, sessions: list.length, bounce: list.filter((s) => s.paths.length === 1).length / list.length,
  pagesPerSession: list.reduce((n, s) => n + s.paths.length, 0) / list.length,
}));
const landingPages = table(allSessions, (s) => s.landing, 10).map(([path, list]) => ({ path, sessions: list.length }));
const articleLandings = allSessions.filter((s) => /\/(story|items)\/:id$/.test(s.paths[0]!));
const nextFromArticle = table(articleLandings.filter((s) => s.paths.length > 1), (s) => s.paths[1]!, 8)
  .map(([r, list]) => ({ route: r, sessions: list.length }));

// Everything that is not a person, over the whole window.
const machines = new Map<string, { requests: number; pages: number; agentReads: number; user: boolean }>();
const outlets = new Map<string, { requests: number; uas: Set<string> }>();
const feedSubscribers = new Map<string, number>();
let verifiedRequests = 0, allRequests = 0;
for (const { rows } of perDay) {
  for (const r of rows) {
    const n = Number(r.n);
    allRequests += n;
    if (r.cat) verifiedRequests += n;
    const agent = AGENTS.find(([, match]) => match.test(r.ua));
    if (agent) {
      const m = machines.get(agent[0]) ?? { requests: 0, pages: 0, agentReads: 0, user: agent[2] === true };
      m.requests += n;
      if (r.cls === "page") m.pages += n;
      if (r.cls === "agent-md" || r.cls === "api" || r.cls === "mcp") m.agentReads += n;
      machines.set(agent[0], m);
    }
    if (["api", "mcp", "feed", "agent-md", "crawl-meta"].includes(r.cls)) {
      const o = outlets.get(r.cls) ?? { requests: 0, uas: new Set<string>() };
      o.requests += n;
      o.uas.add(r.ua);
      outlets.set(r.cls, o);
    }
    // Feed readers put their subscriber count in the user agent, e.g. "Feedly/1.0 (+http://…; 12 subscribers)".
    const subs = r.cls === "feed" ? /(\d+)\s+subscribers?/i.exec(r.ua) : null;
    if (subs) {
      const reader = r.ua.replace(/\d+\s+subscribers?/i, "N subscribers");
      feedSubscribers.set(reader, Math.max(feedSubscribers.get(reader) ?? 0, Number(subs[1])));
    }
  }
}

const report = {
  window: { from: days[0], to: days.at(-1), host, timeZone: "UTC+8" },
  ownerBrowsersExcluded: owner.size,
  daily: daily.map(({ own: _own, ...d }) => ({ ...d, bounceRate: d.sessions ? d.bounced / d.sessions : 0, pvPerUv: d.uv ? d.pv / d.uv : 0 })),
  landingRoutes, landingPages,
  articleLandings: { sessions: articleLandings.length, readOn: articleLandings.filter((s) => s.paths.length > 1).length, next: nextFromArticle },
  machines: [...machines].sort((a, b) => b[1].requests - a[1].requests).map(([name, m]) => ({ name, ...m })),
  outlets: [...outlets].map(([cls, o]) => ({ outlet: cls, requests: o.requests, clients: o.uas.size })),
  feedSubscribers: { total: [...feedSubscribers.values()].reduce((a, b) => a + b, 0), readers: [...feedSubscribers].map(([reader, n]) => ({ reader, n })) },
  requests: { all: allRequests, verifiedBots: verifiedRequests },
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const out: string[] = [`# Traffic ${report.window.from} → ${report.window.to} (${host}, UTC+8 days)`, ""];
  out.push("| day | UV | returning | PV | PV/UV | sessions | bounce | full loads | disguised UAs (loads) | sampling |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const d of report.daily) out.push(`| ${d.day} | ${d.uv} | ${d.returning} | ${d.pv} | ${d.pvPerUv.toFixed(1)} | ${d.sessions} | ${pct(d.bounceRate)} | ${d.fullLoads} | ${d.disguisedUas} (${d.disguisedLoads}) | ${d.sampling.toFixed(2)}× |`);
  out.push("", `Owner browsers left out: ${owner.size}.`, "", "## Landing routes", "", "| route | sessions | bounce | pages/session |", "|---|---|---|---|");
  for (const r of landingRoutes) out.push(`| ${r.route} | ${r.sessions} | ${pct(r.bounce)} | ${r.pagesPerSession.toFixed(1)} |`);
  out.push("", "## Top landing pages", "", ...landingPages.map((p) => `- ${p.sessions} ${p.path}`));
  const a = report.articleLandings;
  out.push("", "## After landing on a story or item", "", `${a.readOn} of ${a.sessions} sessions (${pct(a.sessions ? a.readOn / a.sessions : 0)}) opened another page. Next page:`, ...a.next.map((n) => `- ${n.sessions} ${n.route}`));
  out.push("", "## Machine readers", "", "| reader | requests | pages | md/api/mcp | asked by a person |", "|---|---|---|---|---|");
  for (const m of report.machines) out.push(`| ${m.name} | ${m.requests} | ${m.pages} | ${m.agentReads} | ${m.user ? "yes" : ""} |`);
  out.push("", "## Machine outlets", "", ...report.outlets.map((o) => `- ${o.outlet}: ${o.requests} requests from ${o.clients} clients`));
  out.push("", `Feed subscribers reported by readers: ${report.feedSubscribers.total}${report.feedSubscribers.readers.length ? ` (${report.feedSubscribers.readers.map((r) => `${r.n} via ${r.reader.slice(0, 40)}`).join("; ")})` : ""}.`);
  out.push(`Requests: ${allRequests}, of which verified bots ${verifiedRequests} (${pct(allRequests ? verifiedRequests / allRequests : 0)}).`);
  console.log(out.join("\n"));
}
