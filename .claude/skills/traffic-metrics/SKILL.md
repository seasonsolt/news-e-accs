---
name: traffic-metrics
description: Measure e-acc.ai's real readership and growth — UV/PV, sessions, bounce, landing pages, returning readers, read-on after a story, search clicks/CTR, AI assistant and crawler fetches, feed/API/MCP reach, subscribe/share/star events. Use for 流量分析、UV/PV、增长指标、"昨天多少人看"、SEO/GEO 效果复查, or before/after comparisons of a site change.
---

# 流量与增长指标

这个站的原始请求里八成以上是机器：已验证的爬虫，加上大量冒充普通 Chrome 的爬虫（不跑 JS 的、跑 JS 但从不站内跳转的）。Cloudflare 后台的“访问量”、`sum(sampleInterval)` 和“Mozilla 开头的页面请求”都不是读者数。2026-10-13 曾经把这些当成 3.5 倍增长报出去，是错的。报数一律用下面三个来源，并且互相对照。

## 三个来源

| 来源 | 命令 | 适合回答 | 盲区 |
|---|---|---|---|
| Cloudflare 请求日志 | `node .claude/skills/traffic-metrics/cf-traffic.ts --days 7` | UV、PV、会话、跳出、落地页、读完一篇后去哪、回访、机器读者、各出口 | 没有 IP、来源站、国家、设备（当前令牌对 `clientRefererHost`、`clientAsn`、`ja4`、`clientRequestQuery` 返回 403） |
| 站内首方计数 | `deploy/update.sh --stats 7`（只读，也可 30/90） | 按路由的页面浏览、订阅/分享/外链/收藏事件 | 不分人，跑 JS 的爬虫也会计入（10-12 一天 6,047 次就是爬虫）；被广告拦截器挡掉的不计 |
| Google Search Console | 内置浏览器打开（使用者已登录），见下 | 搜索曝光、点击、CTR、排名，按页面/查询/日期 | 只有 Google 搜索；数据晚 2–3 天 |

Search Console 链接（`breakdown` 可换 `page`、`query`、`date`，`num_of_days` 可换 7/28/90）：
`https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain:e-acc.ai&num_of_days=7&breakdown=page`
用 `get_page_text` 读表格，不要截图读数。

`cf-traffic.ts` 需要 Node 24（`.data/node-v24.*/bin`）和已登录、有 Analytics Read 的 `cf` CLI。脚本只读，7 天大约 1–2 分钟（每天两次查询）。`--until YYYY-MM-DD` 指定结束日，用来和上一个周期对比；`--json` 输出原始数据。日期是 UTC+8 自然日，和站内计数同一天界。

## 脚本怎么判断“一个人”

以“当天的一个 User-Agent”为一个访客：

- 排除：已验证爬虫、UA 带 bot/crawl/spider/headless/preview/compatible 等字样的、站长本人（拿到过后台 API 200 的浏览器，整个窗口都排除）。
- 算作人：打开过页面，并且跑了页面代码（发过浏览信标 `/api/site/analytics`、加载过 `/assets/`，或有站内跳转 `.data`），并且当天整页加载不超过 15 次，超过的必须有站内跳转，并且超出 15 次的部分每 10 次至少 1 次跳转。
- PV：发过信标的用信标次数，否则用整页加载加站内跳转。
- 会话：同一访客两次浏览间隔超过 30 分钟就算新会话；只有一次浏览的会话算跳出。
- 回访：窗口内更早某天出现过的同一 UA。窗口第一天恒为 0；浏览器升级会换 UA，所以偏低。
- `disguised UAs (loads)`：长得像浏览器、但不满足上面条件的 UA 和它们的整页加载数，这是冒充浏览器的爬虫量。
- `sampling`：Cloudflare 在繁忙时段只留 1/N 行。这一列是读者浏览行的放大系数，接近 1.0 说明计数完整；明显大于 1 时，当天的数会偏低，报数时要注明。

所以 UV 是**下限**：同型号手机的同版本浏览器 UA 完全一样，会被合成一个人（10-14 就有扫描器用最常见的安卓 Chrome UA）。PV 比 UV 可靠。

## 增长指标（按 AARRR）

| 阶段 | 指标 | 从哪看 |
|---|---|---|
| 获客 Acquisition | 搜索曝光、点击、CTR、平均排名；按页面和查询拆 | Search Console |
| | 新访客数（UV − 回访） | cf-traffic |
| | 落地页分布：哪些路由、哪些具体页面带来会话 | cf-traffic「Landing routes / Top landing pages」 |
| | AI 助手代人取页（ChatGPT-User、Claude-User、Perplexity-User、MistralAI-User）：有人正在问 AI 时去读了我们 | cf-traffic「Machine readers」里“asked by a person”为 yes 的行 |
| | 搜索与 AI 索引覆盖：Googlebot、bingbot、OAI-SearchBot、Claude-SearchBot、PerplexityBot 等的抓取量 | 同上 |
| 激活 Activation | 跳出率、每会话页数、PV/UV | cf-traffic 日表 |
| | 从文章页落地后继续读的比例，以及下一页去了哪里（衡量文末「继续阅读」） | cf-traffic「After landing on a story or item」 |
| 留存 Retention | 回访访客占比 | cf-traffic `returning` / `UV` |
| | RSS 订阅：读者在 UA 里报告的订阅数；订阅源被多少个客户端拉取 | cf-traffic「Feed subscribers」「Machine outlets: feed」 |
| | 收藏过内容的设备累计数（first_star）、订阅点击与提交 | `deploy/update.sh --stats` |
| 推荐 Referral | 分享点击（share_click） | `deploy/update.sh --stats` |
| 分发 Distribution | 公开 API、MCP、Agent Markdown（llms.txt、`.md`）被多少个客户端调用 | cf-traffic「Machine outlets」 |
| 变现 Revenue | 目前没有 | — |

可以当北极星指标的是**周活跃读者**：一周内至少读了两页的访客数。它同时反映搜索获客和文末导流，又不会被只看一眼就走的流量抬高。

## 做一次分析的步骤

1. 跑 `cf-traffic.ts --days 7`，再跑一次 `--until <上周最后一天> --days 7` 取上一周期。
2. 跑 `deploy/update.sh --stats 7`，用来核对 PV 量级。两边量级不一致时，先查是不是某天有 JS 爬虫灌数（某一天高出平常几十倍，集中在 `/items/:id`、`/all` 这类路由）。
3. 打开 Search Console 读 7 天和 28 天的日期、页面、查询三张表。搜索点击是最干净的“人”信号。
4. 报告先给结论：读者有没有增长、从哪来、留住了多少，再列数字。每个数都要写清来源和口径（下限/上限/抽样）。增长只有在 Search Console 点击和 cf-traffic PV 方向一致时才下结论。
5. 评估某次改动（标题、文末导流、新页面）时，用改动前后相同天数对比，并在 memory 里记下基线和复查日期。

## 已知的干扰源

- 不跑 JS 的冒充浏览器：Chrome/142 Mac（一天打同一篇日报 294 次）、iPhone OS 13_2_3。
- 跑 JS 但从不站内跳转：Chrome/130、Chrome/133，以及 10-12 灌了 6,000 多次信标的那一批。
- 跑 JS、偶尔站内跳转：Chrome/145 Mac（`Chrome/145.0.0.0 Safari/537.36`），间歇爆发，10-13 整页加载 68 次，10-18 整页加载 278 次、信标 280 次而只有 2 次跳转，还取了 12 次 `/llms.txt`；当天曾把 PV 从约 87 抬到 367。
- 监控类：Chrome/94.0.4606.81 只打首页；Chrome/135.1.0 反复打一篇文章。
- 未验证的 PerplexityBot：10-08 到 10-11 一周约 15.5 万次请求。
- 扫描器：用最常见的安卓 Chrome UA 扫 `/forgot-password`、`/.env` 之类，返回 404，不计入 PV，但会和真实读者共用一个 UA。

脚本已经按规则排除这些，新出现的模式会落在 `disguised UAs` 里。如果这一列突然暴涨，或者 UV 突然翻倍而 Search Console 点击没动，先怀疑新爬虫。

## 想要更准的数据

- 给 `cf` 令牌加上 `clientRefererHost`、`clientAsn` 的读取权限，就能拆来源站（Google、X、Reddit、AI 助手的跳转）和网络（区分机房和家庭宽带）。
- 或者在 Cloudflare 开 Web Analytics：浏览器信标、不用 cookie，直接给出访问数、来源、国家和 Core Web Vitals。这需要改页面，属于站点改动，要先问使用者。
