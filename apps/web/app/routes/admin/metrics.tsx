import { SITE } from "@aihot/site";
import type { Route } from "./+types/metrics";
import { num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Stat } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

interface QueryReading { page: string; query: string; clicks: number; impressions: number; ctr: number; position: number }
interface SectionReading { clicks: number; impressions: number; inspected: number; indexed: number; reasons?: Record<string, number> }
interface WeeklyReading {
  week: string;
  end: string;
  partial: boolean;
  days: number;
  views: number;
  sections: Record<string, number>;
  subscribers: number;
  signups: number;
  confirmations: number;
  distribution: Array<{ channel: string; visits: number; reads: number; confirmations: number }>;
  confirmationsBySource: Array<{ source: string | null; count: number }>;
  search: { clicks: number; impressions: number; inspected: number; indexed: number; sections: Record<string, SectionReading>; pageQueries: { property: string; rows: QueryReading[]; limitReached: boolean } | null } | null;
}
interface MetricsData { weeks: number; rows: WeeklyReading[]; searchConsole: { enabled: boolean } }

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<MetricsData>(request, `/api/admin/metrics${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `周读数 · ${SITE.name} 后台` }];

const SECTION_LABELS: Record<string, string> = {
  home: "首页", story: "事件", items: "条目", daily: "日报", weekly: "周报", monthly: "月报", index: "指数",
  leaderboard: "模型榜", topics: "话题", all: "全部", hot: "热榜", chronicle: "编年",
};
const label = (section: string) => SECTION_LABELS[section] ?? section;
// Google's coverage states for pages it has not indexed, as Search Console names them in Chinese.
const REASON_LABELS: Record<string, string> = {
  "Crawled - currently not indexed": "已抓取，未编入索引",
  "Discovered - currently not indexed": "已发现，未抓取",
  "URL is unknown to Google": "Google 不知道这个网址",
  "Duplicate, Google chose different canonical than user": "重复，Google 选了别的规范网址",
  "Duplicate without user-selected canonical": "重复，未指定规范网址",
  "Alternate page with proper canonical tag": "备用网页，规范标记正确",
  "Excluded by ‘noindex’ tag": "noindex 排除",
  "Page with redirect": "重定向",
  "Not found (404)": "404",
  "Soft 404": "软 404",
};
const reasons = (x: SectionReading) =>
  Object.entries(x.reasons ?? {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${REASON_LABELS[r] ?? r} ${n}`).join("；");

export default function MetricsAdmin({ loaderData: d }: Route.ComponentProps) {
  // The sections with the most views over the window get a column each; the rest are summed.
  const totals = new Map<string, number>();
  for (const r of d.rows) for (const [s, n] of Object.entries(r.sections)) totals.set(s, (totals.get(s) ?? 0) + n);
  const shown = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
  const latest = d.rows.find((r) => !r.partial);
  const searched = d.rows.find((r) => r.search);
  const detailed = d.rows.find((r) => r.search?.pageQueries);
  const previous = detailed && d.rows[d.rows.indexOf(detailed) + 1];
  const prior = new Map(previous?.search?.pageQueries?.property === detailed?.search?.pageQueries?.property ? previous?.search?.pageQueries?.rows.map((r) => [JSON.stringify([r.page, r.query]), r]) : []);
  const candidates = [...(detailed?.search?.pageQueries?.rows ?? [])].sort((a, b) => b.impressions - a.impressions || a.page.localeCompare(b.page) || a.query.localeCompare(b.query)).slice(0, 100);
  return (
    <AdminPage title="周读数" subtitle="每周一行（周一到周日）：页面访问（浏览器上报，非去重人数，也不能完全排除自动化访问）、邮件订阅和 Search Console。本周未过完，标“进行中”。">
      <div className="mb-4">
        <FilterChips param="weeks" options={[4, 12, 26].map((weeks) => ({ value: weeks === 12 ? "" : String(weeks), label: `近 ${weeks} 周` }))} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="上周页面访问" value={latest ? num(latest.views) : "—"} hint={latest && latest.days < 7 ? `只有 ${latest.days} 天有记录` : latest ? `日均 ${num(Math.round(latest.views / 7))}` : undefined} />
        <Stat label="已确认订阅" value={num(d.rows[0]?.subscribers ?? 0)} hint="不含已退订（每天从 Resend 同步）" />
        <Stat label="上周搜索展示" value={searched?.search ? num(searched.search.impressions) : "—"} hint={searched?.search ? `点击 ${num(searched.search.clicks)}` : undefined} />
        <Stat label="已收录 / 已检查" value={searched?.search ? `${num(searched.search.indexed)} / ${num(searched.search.inspected)}` : "—"} hint={searched?.search ? `${searched.week} 那周` : undefined} />
      </div>
      {!d.searchConsole.enabled && (
        <p className="mb-4 text-[13px] text-ink-3">Search Console 读数没有打开：设 SEARCH_CONSOLE_ENABLED、SEARCH_CONSOLE_PROPERTY 和 SEARCH_CONSOLE_KEY_FILE（见 docs/deploy.md），worker 每周三读上一周。</p>
      )}
      <Card title="每周" pad={false}>
        <DataTable
          rows={d.rows}
          rowKey={(r) => r.week}
          columns={[
            { key: "week", label: "周", render: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] text-ink">{r.week.slice(5)} – {r.end.slice(5)} {r.partial && <Badge>进行中</Badge>}</span> },
            { key: "views", label: "访问", align: "right", render: (r) => <span title={`${r.days} 天有记录`}>{num(r.views)}</span> },
            ...shown.map((s) => ({ key: `s-${s}`, label: label(s), align: "right" as const, render: (r: WeeklyReading) => num(r.sections[s] ?? 0) })),
            { key: "other", label: "其他", align: "right", render: (r) => num(Object.entries(r.sections).filter(([s]) => !shown.includes(s)).reduce((n, [, v]) => n + v, 0)) },
            { key: "subscribers", label: "订阅", align: "right", className: "whitespace-nowrap", render: (r) => <span title={`新登记 ${r.signups}，新确认 ${r.confirmations}`}>{num(r.subscribers)}{r.confirmations ? <span className="text-ink-3"> +{r.confirmations}</span> : null}</span> },
            { key: "sources", label: "首次确认来源", render: (r) => r.confirmationsBySource.map((s) => `${s.source ?? "未知"} ${s.count}`).join("；") || "—" },
            { key: "impressions", label: "展示", align: "right", render: (r) => (r.search ? num(r.search.impressions) : "—") },
            { key: "clicks", label: "点击", align: "right", render: (r) => (r.search ? num(r.search.clicks) : "—") },
            { key: "indexed", label: "收录", align: "right", className: "whitespace-nowrap", render: (r) => (r.search ? `${num(r.search.indexed)} / ${num(r.search.inspected)}` : "—") },
          ]}
        />
      </Card>
      <Card className="mt-5" title="分发来源" pad={false}>
        <p className="p-4 text-[13px] text-ink-3">邮件和分享标记在当前标签页内延续。访问为页面次数，阅读为累计可见 15 秒的页面次数，均非人数；确认按首次登记来源、首次确认时间统计。开始记录前的历史没有渠道归因，未记录不代表没有访问。</p>
        <DataTable rows={d.rows.flatMap((r) => r.distribution.map((c) => ({ week: r.week, ...c })))} rowKey={(r) => `${r.week}:${r.channel}`} columns={[
          { key: "week", label: "周", render: (r) => r.week },
          { key: "channel", label: "来源", render: (r) => r.channel === "newsletter" ? "日报邮件" : "分享链接" },
          { key: "visits", label: "访问", align: "right", render: (r) => num(r.visits) },
          { key: "reads", label: "可见阅读 ≥15 秒", align: "right", render: (r) => num(r.reads) },
          { key: "confirmations", label: "首次确认订阅", align: "right", render: (r) => num(r.confirmations) },
        ]} />
      </Card>
      <Card className="mt-5" title={detailed ? `${detailed.week} 页面 × 查询词（按展示排序，前 100 行）` : "页面 × 查询词"} pad={false}>
        <p className="p-4 text-[13px] text-ink-3">用于逐页核对标题、导语与查询意图，不自动改正文。Google 只返回部分主要查询，不能用明细之和代替全站总数；日期按太平洋时间。变化仅比较紧邻前一周的同网址、同查询，缺失显示 —。{detailed?.search?.pageQueries?.limitReached ? "本次达到 25,000 行采集上限。" : ""}</p>
        {!detailed ? <p className="p-4 text-ink-3">尚未采集页面查询明细；下次周读数任务开始保存，旧周不会补零。</p> : <DataTable rows={candidates} rowKey={(r) => JSON.stringify([r.page, r.query])} columns={[
          { key: "page", label: "页面", render: (r) => <a className="break-all text-accent" href={/^https?:\/\//.test(r.page) ? r.page : undefined} target="_blank" rel="noopener noreferrer">{r.page}</a> },
          { key: "query", label: "查询词", render: (r) => r.query },
          { key: "impressions", label: "展示", align: "right", render: (r) => num(r.impressions) },
          { key: "clicks", label: "点击", align: "right", render: (r) => num(r.clicks) },
          { key: "ctr", label: "CTR", align: "right", render: (r) => pct(r.ctr) },
          { key: "position", label: "平均排名", align: "right", render: (r) => r.position.toFixed(1) },
          { key: "change", label: "较前周（点击 / 排名）", render: (r) => { const p = prior.get(JSON.stringify([r.page, r.query])); return p ? `${r.clicks - p.clicks >= 0 ? "+" : ""}${r.clicks - p.clicks} / ${r.position - p.position >= 0 ? "+" : ""}${(r.position - p.position).toFixed(1)}` : "—"; } },
        ]} />}
      </Card>
      {searched?.search && (
        <Card className="mt-5" title={`${searched.week} 那周的 Search Console，按栏目`} pad={false}>
          <DataTable
            rows={Object.entries(searched.search.sections).sort((a, b) => b[1].impressions - a[1].impressions || b[1].inspected - a[1].inspected)}
            rowKey={([s]) => s}
            columns={[
              { key: "section", label: "栏目", render: ([s]) => label(s) },
              { key: "impressions", label: "展示", align: "right", render: ([, x]) => num(x.impressions) },
              { key: "clicks", label: "点击", align: "right", render: ([, x]) => num(x.clicks) },
              { key: "indexed", label: "已收录 / 已检查", align: "right", className: "whitespace-nowrap", render: ([, x]) => (x.inspected ? `${num(x.indexed)} / ${num(x.inspected)}` : "—") },
              { key: "rate", label: "收录率", align: "right", render: ([, x]) => (x.inspected ? pct(x.indexed / x.inspected) : "—") },
              { key: "reasons", label: "未收录原因", render: ([, x]) => <span className="text-[12.5px] text-ink-3">{reasons(x) || "—"}</span> },
            ]}
          />
        </Card>
      )}
    </AdminPage>
  );
}
