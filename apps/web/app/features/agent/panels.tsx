// The engine's ways in, one panel each: what it is for, the steps to connect, then the details folded away.
// Addresses are the site's configured public address (`base`); what visitors copy carries the site's tag
// (CopyTag) when it has one.
import { Fragment, useState } from "react";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
import { Link } from "react-router";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES as T, MCP_TOOLS } from "@aihot/contracts/mcp";
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { ACCESS, AGENT, EDITION_WHEN, POLICY, REPORTS, SITE, subjectAfter, withSubject } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { PillTabs } from "../../components/ui/Tabs";
import type { AgentPanelProps } from "../../modules";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "./module-parts";
import { Address, Ask, Block, Bullets, Details, Mono, PanelHead, Step, Steps, Table, Tips } from "./parts";

const V = PUBLIC_INTERFACE_VERSION;

/** Every MCP tool: the engine's and the modules'. */
export const mcpToolCount = () => MCP_TOOLS.length + AGENT_PARTS.reduce((n, a) => n + (a.tools?.length ?? 0), 0);
const link = "text-accent hover:underline";

/** An address on this site as the copy buttons copy it, with the tag. */
function addressOf({ base, tag }: AgentPanelProps, path: string): string {
  return TAG && tag ? `${base}${path}?${TAG.query}=${tag}` : `${base}${path}`;
}

const MCP_CLIENTS = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "json", label: "JSON 配置" },
  { key: "other", label: "其他客户端" },
] as const;

export function McpPanel(props: AgentPanelProps) {
  const tx = useTranslate();
  const locale = useLocale();
  const url = addressOf(props, "/api/mcp");
  const name = SITE.mcpPrefix;
  const [client, setClient] = useState<string>("claude");
  return (
    <>
      <PanelHead label={`MCP · ${V}`} title={tx("填一个地址，Agent 多出 {0} 个工具", mcpToolCount())}>
        <Text value="标准 Streamable HTTP，匿名只读，不用 token，也不读你的登录状态。适合 Claude 桌面版、Cursor、Cherry Studio 这类支持远程 MCP 的客户端。" />
      </PanelHead>
      <Steps>
        <Step n={1} title="复制服务地址">
          <Address url={url} />
          {TAG && <p className="mt-2 text-[13px] text-ink-3">{tx(TAG.mcp)}</p>}
        </Step>
        <Step n={2} title="加到你的客户端">
          <PillTabs className="mt-3" size="xs" layoutId="agent-mcp-client" label={tx("客户端")} active={client} onSelect={setClient} items={MCP_CLIENTS.map((c) => ({ key: c.key, label: tx(c.label) }))} />
          {client === "claude" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`claude mcp add --transport http ${name} '${url}'`} />}
          {client === "codex" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`codex mcp add ${name} --url '${url}'`} />}
          {client === "json" && <CodeBlock className="mb-0 mt-3" title={tx("Cursor、Cherry Studio 等用 JSON 配置的客户端")} lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />}
          {client === "other" && <p className="mt-3">{tx("在客户端的 MCP 或连接器设置里新建一项：名称填 {0}，地址填上面的网址，认证选“无”，不要填 API Key。只支持本地命令的客户端，先用它自带的远程 MCP 代理。", name)}</p>}
        </Step>
        <Step n={3} title="让 Agent 调一次">
          <Ask text={tx("请调用 {0}，传入 lang=\"{3}\"，告诉我过去 24 小时最重要的{1}，并附 {2} 链接。", T.latest, tx(subjectAfter(" 5 条", "资讯")), SITE.name, locale)} />
          <p className="mt-2 text-[13px] text-ink-3">{tx("客户端显示调用了 {0}，回答里有时间范围、所选语言的摘要和 {1} 链接，就是连上了。", T.latest, new URL(props.base).host)}</p>
        </Step>
      </Steps>

      <Block title={tx("{0} 个工具", mcpToolCount())}>
        <p className="mb-3"><Text value={'最新资讯、搜索、热点、事件和日报工具默认英文；工具参数 lang 可取 en 或 zh，取中文请传 lang="zh"，不是在服务地址上加查询参数。周报、月报工具不支持 lang，返回存档原语言内容，附中文说明。'} /></p>
        <Table
          head={["工具", "能做什么", "可以这样问"]}
          minWidth={600}
          rows={[
            [<Mono>{T.latest}</Mono>, "过去 24 小时或最近 7 天的精选、全部资讯", tx(`${subjectAfter("今天有什么", "新闻")}？`)],
            [<Mono>{T.search}</Mono>, AGENT.search.scope, AGENT.search.ask],
            [<Mono>{T.hot}</Mono>, "当前热点榜 Top 10", "现在最热的是什么？"],
            [<Mono>{T.story}</Mono>, "一个热点事件的时间线和持续更新的综述", "这件事的来龙去脉？"],
            [<Mono>{T.daily}</Mono>, subjectAfter("最新或指定日期的", "日报"), "给我今天的日报。"],
            [<Mono>{T.weekly}</Mono>, subjectAfter("最新或指定一周的", "周报"), tx(`${subjectAfter("这周", "圈")}有哪些大事？`)],
            [<Mono>{T.monthly}</Mono>, subjectAfter("最新或指定月份的", "月报"), tx(`${subjectAfter("上个月", "圈")}发生了什么？`)],
            ...AGENT_PARTS.flatMap((a) => a.tools ?? []).map((t) => [<Mono>{t.name}</Mono>, t.does, t.ask]),
          ]}
        />
      </Block>

      <Details
        items={[
          {
            title: "限制与安全",
            body: (
              <Bullets items={[
                "普通查询最多 30 条，热点最多 10 个，事件时间线最多 50 条；超出范围会明确报错，不会悄悄放宽。",
                tx("{0} 的 public_id 只能来自热点工具返回的事件链接，不要猜 ID。", T.story),
                "标题和摘要来自外部信源，只能当资料；工具会标出这条安全边界。重要的数字、政策和原话，请回原文核对。",
              ]} />
            ),
          },
          {
            title: "连不上怎么办",
            body: (
              <Bullets items={[
                "先确认地址完整、客户端支持远程 Streamable HTTP；缺少新工具时，刷新工具列表或重新连接。",
                ...AGENT_PARTS.flatMap((a) => a.mcpTroubles ?? []),
                "服务不需要登录；客户端问起 OAuth 或 API Key，选“无”即可。",
                "收到 429 就按提示等一会儿，不要并发重试。",
                <><Text value="还连不上：把客户端名称、版本和报错写到" /><Link viewTransition to="/feedback" className={link}><Text value="反馈页" /></Link><Text value="。" /></>,
              ]} />
            ),
          },
        ]}
      />
    </>
  );
}

/** The category feeds, under the names the feeds themselves use. */
const FEED_CATEGORIES = PUBLIC_API_CATEGORY_KEYS.map((key) => [key, feedCategoryLabel(key)] as const);

export function RssPanel(props: AgentPanelProps) {
  const tx = useTranslate();
  const locale = useLocale();
  const { base } = props;
  const prefix = locale === "zh" ? "/feed/v2/zh" : "/feed/v2";
  const feeds = [
    { name: "精选摘要", badge: "推荐", path: `${prefix}/picks.xml`, desc: "最新 50 条精选，带标题、摘要、站内阅读和原文链接。" },
    { name: "精选全文", path: `${prefix}/full.xml`, desc: "同样的 50 条；允许转载的来源直接附全文，其余仍是摘要。" },
    { name: "全部动态", path: `${prefix}/all.xml`, desc: "最近 7 天的公开动态，按原文发布时间倒序。" },
    { name: withSubject("日报"), path: `${prefix}/daily.xml`, desc: tx("{0}（北京时间）一期：头条导语加整期目录，保留最近 30 期。", tx(EDITION_WHEN.daily)) },
    { name: withSubject("周报"), path: `${prefix}/weekly.xml`, desc: tx("{0}（北京时间）一期：总述加按栏目分好的{1}，保留最近 12 期。", tx(EDITION_WHEN.weekly), tx(REPORTS.entry.noun)) },
    { name: withSubject("月报"), path: `${prefix}/monthly.xml`, desc: tx("{0}（北京时间）一期：总述加按栏目分好的{1}，保留最近 12 期。", tx(EDITION_WHEN.monthly), tx(REPORTS.entry.noun)) },
  ];
  const lead = `${["兼容主流 RSS 2.0 阅读器，也能接 n8n、Zapier 这类自动化工具。地址长期不变", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? [])].map((message) => tx(message)).join(tx("；"))}${tx("。")}`;
  return (
    <>
      <PanelHead label="RSS" title="复制地址，用阅读器订阅">
        {lead}
      </PanelHead>
      <p className="mt-3 text-[13px] text-ink-3"><Text value="下列地址随页面语言切换：/feed/v2/… 为英文，/feed/v2/zh/… 为中文，包含精选、全文、全部动态、日报、周报、月报和分类订阅。旧 /feed.xml 与 /feed/… 保留中文兼容版；RSS 不通过 lang 查询参数切换语言。" /></p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {feeds.map((f) => (
          <div key={f.path} className="card flex flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{tx(f.name)}</span>
              {f.badge && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{tx(f.badge)}</span>}
            </div>
            <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{tx(f.desc)}</p>
            <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{f.path}</code>
              <CopyButton text={addressOf(props, f.path)} label="复制地址" className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      {TAG && <p className="mt-3 text-[12.5px] text-ink-4">{tx(TAG.rss)}</p>}

      <Block title="按分类订阅">
        <Table
          head={["分类", "摘要", "全文"]}
          minWidth={420}
          rows={FEED_CATEGORIES.map(([slug, label]) => [
            <span className="font-medium text-ink">{tx(label)}</span>,
            <span className="inline-flex items-center gap-2"><Mono>{`${prefix}/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `${prefix}/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
            <span className="inline-flex items-center gap-2"><Mono>{`${prefix}/full/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `${prefix}/full/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
          ])}
        />
      </Block>

      <Block title="刷新多快合适">
        <p><Text value="阅读器会带着上次的 ETag 来问，内容没变时只回一个很小的 304，不重复下载。30 分钟刷新一次就够，更快也拿不到新的内容。" /></p>
        <p className="mt-3 text-[13px] text-ink-3">{tx("条目链接指向站内阅读页，原文链接在摘要里。能匿名订阅不等于所有用途都获许可{0}，见", POLICY.terms.notes ? tx("：{0}", tx(POLICY.terms.notes.rss)) : "")}<Link viewTransition to="/terms" className={link}>{tx(POLICY.terms.name)}</Link><Text value="。" /></p>
      </Block>
    </>
  );
}

const RECIPES = [
  { key: "latest", label: "盯最新资讯" },
  { key: "sync", label: "同步全部精选" },
];

export function ApiPanel(props: AgentPanelProps) {
  const tx = useTranslate();
  const locale = useLocale();
  const { base, tag } = props;
  const userAgent = [ACCESS.userAgent, TAG && tag ? TAG.userAgent(tag) : null].filter(Boolean).join(" ");
  const curl = `curl --compressed${userAgent ? ` -A '${userAgent}'` : ""}`;
  let pace = tx("内容多久变一次：新资讯全天陆续进来，精选每天变几次到几十次，日报{0}、周报{1}、月报{2}（北京时间）各一期。", tx(EDITION_WHEN.daily), tx(EDITION_WHEN.weekly), tx(EDITION_WHEN.monthly));
  if (ACCESS.ratePerMinute) pace += tx("同一个 IP 每分钟超过约 {0} 次会收到 429，请按 Retry-After 等待，不要并发重试。", ACCESS.ratePerMinute);
  const [recipe, setRecipe] = useState<string>("latest");
  const recipes = AGENT_PARTS.flatMap((a) => a.recipes ?? []);
  const items = `${base}/api/v1/items?mode=selected&window=24h&limit=20&lang=${locale}`;
  return (
    <>
      <PanelHead label={`REST API · ${V}`} title="匿名 GET，拿来就能用">
        <Text value="不用 token；浏览器跨域、curl 和各语言默认的 HTTP 客户端都能直接调。路径是 /api/v1，字段和错误码以 " /><a href="/openapi-v1.json" className={link}>OpenAPI</a><Text value=" 为准。" />
      </PanelHead>
      <Block title="内容语言">
        <p><Text value="本站内容以英文原生发布，但 v1 JSON 保留中文兼容默认：items、hot-topics、stories、dailies、selected/snapshot 和 selected/changes 支持 lang=en 或 lang=zh；省略时请求中文，译文未就绪可能回退原语言，请检查 contentLanguage。下方示例显式选择当前页面语言，同步和翻页需保持同一语言。" /></p>
        <p className="mt-3"><Text value="weeklies、monthlies 的索引与详情不接受 lang，返回存档原语言；需要中文版可订阅 /feed/v2/zh/weekly.xml 或 /feed/v2/zh/monthly.xml。" /></p>
        <p className="mt-3"><Text value="单篇 Markdown 导出 /items/{id}/markdown 默认英文，中文加 ?lang=zh（也支持 lang=en）；它不同于下表中的 /api/v1/agent 中文说明接口。" /></p>
      </Block>
      <CodeBlock className="mt-6" title={tx("第一个请求")} lang="bash" code={`${curl} '${items}'`} />

      <Block title="按分类筛选">
        <p><Text value="在资讯请求中加上 " /><Mono>category</Mono><Text value="，只取对应分类；不传则包含全部分类。返回条目的 " /><Mono>category</Mono><Text value=" 也使用下表中的值。" /></p>
        <Table head={["分类", "请求参数"]} rows={FEED_CATEGORIES.map(([key, name]) => [name, <Mono>{`category=${key}`}</Mono>])} />
      </Block>

      <Block title="用得省，也更快">
        <Tips
          items={[
            { title: "开压缩", text: <><Text value="curl 加 " /><Mono>--compressed</Mono><Text value="，其他客户端打开 gzip 或 br。JSON 压缩后只有原来的 1/4 到 1/8。" /></> },
            { title: "带上 ETag", text: <><Text value="保存响应里的 ETag，下次带 " /><Mono>If-None-Match</Mono><Text value="；内容没变时返回 304，不传正文。" /></> },
            { title: "按节奏取", text: tx("资讯和热点最快一分钟一次；日报{0} 后取一次，周报、月报出刊后取一次；往回翻页翻到已有的那条就停。", tx(EDITION_WHEN.daily)) },
          ]}
        />
        <p className="mt-3 text-[13px] leading-[1.75] text-ink-3">{pace}</p>
      </Block>

      <Block title="接口一览">
        <Table
          head={["路径", "用来做什么", "多久取一次"]}
          minWidth={640}
          rows={[
            { group: "资讯" },
            [<Mono>/api/v1/items</Mono>, "精选或最近 7 天全部动态，可按分类、时间窗、关键词筛", "最快 1 分钟一次"],
            { group: "热点与事件" },
            [<Mono>/api/v1/hot-topics</Mono>, "当前热点榜 Top 10", "最快 1 分钟一次"],
            [<Mono>{"/api/v1/stories/{publicId}"}</Mono>, "一个事件的报道时间线、AI 综述和关联事件", "需要时"],
            { group: "日报" },
            [<Mono>/api/v1/dailies/latest</Mono>, "最新一期日报", tx("{0} 后一次", tx(EDITION_WHEN.daily))],
            [<Mono>{"/api/v1/dailies/{date}"}</Mono>, "指定日期日报；撤稿会移除引用", "缓存过期后使用前验证 ETag"],
            [<Mono>/api/v1/dailies</Mono>, "日报日期索引", "每天一次"],
            { group: "周报与月报" },
            [<Mono>/api/v1/weeklies/latest</Mono>, "最新一期周报：头条、总述和一周重点，按栏目分好", tx("{0} 后一次", tx(EDITION_WHEN.weekly))],
            [<Mono>{"/api/v1/weeklies/{week}"}</Mono>, "指定一周，ISO 周如 2026-W39；撤稿会移除引用", "缓存过期后使用前验证 ETag"],
            [<Mono>/api/v1/weeklies</Mono>, "周报索引", "每周一次"],
            [<Mono>/api/v1/monthlies/latest</Mono>, "最新一期月报", tx("{0} 后一次", tx(EDITION_WHEN.monthly))],
            [<Mono>{"/api/v1/monthlies/{month}"}</Mono>, "指定月份，如 2026-09", "缓存过期后使用前验证 ETag"],
            [<Mono>/api/v1/monthlies</Mono>, "月报索引", "每月一次"],
            ...AGENT_PARTS.flatMap((a) => (a.api ? [{ group: a.api.group }, ...a.api.rows.map(([path, does, often]) => [<Mono>{path}</Mono>, does, often])] : [])),
            { group: "给 AI 助手" },
            [<Mono>/api/v1/agent</Mono>, tx("给 Agent 的中文使用说明，列出的地址使用中文 Markdown 模板，内容取自兼容版或存档原语言；这些地址不接受 lang{0}", GUIDE_CLIENTS ? tx("；{0} 用的就是它们", GUIDE_CLIENTS) : ""), "需要时"],
            { group: "完整精选同步" },
            [<Mono>/api/v1/selected/snapshot</Mono>, "当前全部精选，分页一次拿全", "只在第一次"],
            [<Mono>/api/v1/selected/changes</Mono>, "之后的新增、修改和撤选", "几分钟一次"],
          ]}
        />
      </Block>

      <Block title="常见用法">
        <PillTabs size="xs" layoutId="agent-api-recipe" label={tx("用法")} active={recipe} onSelect={setRecipe} items={[...RECIPES, ...recipes].map((r) => ({ key: r.key, label: tx(r.label) }))} />
        {recipe === "latest" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# ${tx("第一次：保存响应头里的 ETag")}\n${curl} -i '${items}'\n# ${tx("之后最快每分钟一次，带上 ETag；返回 304 就是没变化")}\n${curl} -i -H 'If-None-Match: <${tx("上次的 ETag")}>' '${items}'`} />
            <p><Text value="需要往回翻页时，把 " /><Mono>page.nextCursor</Mono><Text value=" 作为 cursor 传回去，翻到已经有的那条就停，不要每次把 7 天重翻一遍。" /></p>
          </>
        )}
        {recipe === "sync" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# ${tx("第一次：分页拿全。保存第一页响应里的 cursor（每页都一样）")}\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&lang=${locale}'\n# ${tx("hasMore 为 true 就带上 nextPage 继续翻，直到翻完")}\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<${tx("上一页的 nextPage")}>&lang=${locale}'\n# ${tx("之后：原样传回 cursor，只拿新增、修改和撤选")}\n${curl} '${base}/api/v1/selected/changes?cursor=<${tx("第一页的 cursor")}>&limit=100&lang=${locale}'`} />
            <p><Text value="每页成功写进本地后再保存新的 cursor。cursor 是流水账水位，放多久都不会过期；返回 409 " /><Mono>snapshot_required</Mono><Text value=" 时重新取一次快照，不会悄悄漏数据。" /></p>
          </>
        )}
        {recipes.map((r) => recipe === r.key && <r.Body key={r.key} base={base} curl={curl} />)}
      </Block>

      <Block title="出错了怎么办" id="agent-api-recovery">
        <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          <dt className="mono text-[13px] text-ink">400</dt>
          <dd><Text value="参数不对：按 OpenAPI 和返回的 code 修正，不要自动换成更宽的查询。cursor 无效或滑出时间窗返回 invalid_cursor，从第一页重来。" /></dd>
          <dt className="mono text-[13px] text-ink">409</dt>
          <dd><Text value="snapshot_required：增量没法安全续上，重新取一次完整快照。" /></dd>
          <dt className="mono text-[13px] text-ink">429</dt>
          <dd><Text value="请求太密：按 Retry-After 等待，不要并发重试。" /></dd>
          <dt className="mono text-[13px] text-ink">5xx</dt>
          <dd><Text value="指数退避，先用上次成功的结果；公开服务不承诺 SLA。" /></dd>
          {AGENT_PARTS.flatMap((a) => a.apiErrors ?? []).map(([status, what]) => (
            <Fragment key={status}>
              <dt className="mono text-[13px] text-ink">{status}</dt>
              <dd>{typeof what === "string" ? tx(what) : what}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-ink-3">{tx("能匿名调用不等于所有用途都获许可{0}，见", POLICY.terms.notes ? tx("：{0}", tx(POLICY.terms.notes.api)) : "")}<Link viewTransition to="/terms" className={link}>{tx(POLICY.terms.name)}</Link><Text value="。" /></p>
      </Block>

    </>
  );
}
