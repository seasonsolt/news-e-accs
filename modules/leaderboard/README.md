# 模型榜（`/leaderboard`）

从 `dfa187f` 的模型榜移入本站模块，直接使用保留的 `lb_models`、`lb_aliases`、`lb_runs`、`lb_snapshots`、`lb_scores`、`lb_rankings`、`lb_prices`、`fx_rates` 表和历史记录，不重写既有数据。模块自己的迁移在 `migrations/`：0136–0138 是已经停用的官方价格页核对留下的表和列，0139–0141 把它们删掉。

把多家公开评测（Artificial Analysis、LMArena、LiveBench、Epoch、EQ-Bench、Vals 等）的成绩放在一起，算出一个尽量不和已知成绩冲突的完整排名，另有编程、推理、知识、专业办公分类榜。方法对读者公开：

- `/leaderboard/rules`：排名怎么算（共识方法 v16，加权不完整 Kemeny 排序）。
- `/leaderboard/sources`、`/leaderboard/sources/:key`：每个评测来源测什么、状态如何、是否参与排名。
- `/leaderboard/:slug`：公开前 30 名模型的排名、价格、稳定性与原始证据。
- `/leaderboard/category/:key`：四类专项榜。`overall` 返回 404，`aesthetics`、`writing` 临时跳转总榜；`/leaderboard/methodology` 永久跳转来源页。

保留 `/zh/leaderboard…` 镜像、`?at=YYYY-MM-DD` 的北京日边界、历史榜与实时榜的独立缓存。价格为当前价格（见下文“名录、价格与工具”），人民币标价按所读计算轮次的汇率折算；价格表有改动时，缓存的轮次在一分钟内重新读取。页面只读已发布结果，不发起采集或模型调用。

## 中英文版本

五类 `/api/site/leaderboard/*` 读取接口接受 `lang=en|zh`，省略时仍返回原有中文。英文数据在 `i18n/en.json`，按榜单、来源、分组、证据预算、状态和配置等稳定 id 覆盖中文文案；署名等动态句子在读取代码中保留双语模板。已存轮次的预算名、汇率来源、配置标签和选择说明只在读取时翻译，模型、机构和上游型号专名保留，不改数据库记录。

网页文案在 `i18n/messages.ts`，通过通用 `WebModule.messages` 插口注册中英文字典。评测状态使用模块自己的 message key，不覆盖引擎事件的同名状态。标题、描述和结构化数据使用同一套翻译，canonical 与 alternate 由引擎 `pageMeta` 生成。

运行缓存只存未翻译的轮次，每次响应独立选择文案；API 的 URL 查询参数和 ETag 均区分语言。网页与 Router data 继续遵守引擎的 `private, no-store`。测试检查全部英文条目、存储文案、双语缓存与页面，并用改动前捕获的 77 个响应 SHA-256 核对中文原始 JSON 字节（仅归一化测试生成的轮次 id）。


## 更新与配置

每天北京时间 02:05、08:05、14:05、20:05 运行 `leaderboard.round`，错过的定时执行补一次。

采集需要 `ARTIFICIAL_ANALYSIS_API_KEY`；没有时该来源抓取失败，其缺失份额不转给其他评测。可选 `GITHUB_TOKEN` 提高只读 GitHub 配额。两者通过后端的 `collectors` 凭据组读取。开发时保持 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 关闭，测试只用数据库夹具和本地假服务。

## 文件与插口

```text
modules/leaderboard/
├── package.json
├── module.ts
├── server.ts
├── web.tsx
├── contracts.ts
├── taxonomy.ts
├── i18n/                     # 英文数据覆盖、网页文案与存储文案的读取翻译
├── backend/
│   ├── admin.ts
│   ├── directory.ts
│   ├── prices.ts              # 种子价格文件的导入、OpenRouter 价格刷新
│   ├── publication.ts
│   ├── read.ts
│   ├── registry.ts
│   ├── source-registry.json
│   ├── fetch/                 # 11 个上游读取器、身份解析、配置选择、快照存储与刷新
│   └── method/                # v16、HiGHS Kemeny、输入、worker 线程与发布
├── api/leaderboard.ts
├── web/
│   ├── routes/                # 总榜与分类共用布局，模型、来源和规则页
│   ├── features/              # 表格、前三名、证据、来源状态与时间线
│   └── admin/runs.tsx
├── assets/
│   ├── leaderboard-sources/
│   └── model-providers/
├── migrations/                # 停用的价格核对的表和列，及删除它们的迁移
├── seeds/                     # 旧版本模型名录与官方价格文件
├── scripts/
│   ├── lb-round.ts
│   ├── lb-fetch-check.ts
│   └── import-leaderboard-prices.ts
└── tests/
```

| 插口 | 内容 |
|---|---|
| `module.ts` 的 `pages`、`redirects`、`apiPaths` | 原网页地址与布局、旧地址跳转、API 和两组 Logo 地址 |
| `module.ts` 的 `localizedPaths` | 模块自己声明的 `/zh` 镜像，用于语言切换与链接 |
| `server.ts` 的 `http` | 五个 `/api/site/leaderboard/*` 读取接口；静态 Logo 通过引擎 `sendFile` 返回类型、ETag、缓存头与 404 |
| `schedules`、`workerStarted` | 四次每日计算与新站首次计算 |
| `admin.runs`、`alerts` | `leaderboard.fetch` 运行状态、失败来源表与超过 26 小时未成功的告警 |
| `llms`、`sitemap` | 有公开轮次才列出 llms.txt 链接；固定榜页、全部来源页与公开前 30 名模型页进入 sitemap |
| `web.tsx` 的 `sidebar`、`tools`、`admin.runs` | 主导航“模型前沿”、我的页“模型榜”、按需加载的后台运行部件 |
| `module.ts` 的 `timePaths` | 时间机器跟随榜页 |
| `darkMarks` | 复用引擎 BrandMark 的 Kimi 深色底板 |

只有 `site/modules/` 的三份清单导入模块。后台类型检查由 `modules/tsconfig.json` 覆盖，网页由 `apps/web/tsconfig.json` 覆盖。模块公开读取入口是 `backend/publication.ts`；网页只通过 HTTP 读取它。

## 名录、价格与工具

模型名录保存模型显示名、厂商、发布日期与上游别名，`backend/directory.ts` 保留按需导入能力。**不恢复 `scripts/seed.ts` 的自动名录导入**：本站生产库已经有完整目录，启用模块不导入或覆盖它。空站若要使用该目录，可显式调用 `importModelDirectory()`；名录里没有的新模型仍按旧规则自动建立。

价格最初来自 `seeds/lb-official-prices-2026-09-26.json`（厂商官方价），之后每次刷新（`leaderboard.round` 在 `COLLECT_ENABLED=true` 时）先补上种子文件里有、库里还没有的价格，再读 OpenRouter 的公开模型列表（`/api/v1/models`，不需要密钥）：

- 最新一轮的模型在列表里有标准按量价格（不含 `:batch` 等变体和 `~` 别名，按 slug 或名称的字母数字匹配）的，用它的美元价，出处记为 `https://openrouter.ai/<id>`。和现价相同只更新核对日期；不同就直接替换，不另记变动。
- 列表里没有的模型保留原价格（多为种子文件里的厂商官方价，人民币标价的照旧按汇率折算）。
- OpenRouter 的价格有时来自第三方托管商，和厂商官方价不同；价格页上写明了来源。因此智能成本指数不读这里的价格，只用种子文件的官方价和它自己的价格历史（`modules/indices/README.md`）。列表读不到时这一轮不改任何价格，结果记在这一轮的运行记录里。

要整批改写价格时，更新文件并运行（OpenRouter 列出的模型，下一次刷新会再换成它的价格）：

```bash
node --env-file=.env modules/leaderboard/scripts/import-leaderboard-prices.ts [prices.json]
node --env-file=.env modules/leaderboard/scripts/lb-round.ts --fetch
node --env-file=.env modules/leaderboard/scripts/lb-fetch-check.ts [source-key ...]
```

`lb-round.ts --force` 即使证据未变也发布新轮次。`lb-fetch-check.ts` 只抓不写，按配置逐行对比最新存储快照；这些采集脚本按显式命令访问上游，开发验证不要使用 `--fetch` 或运行 fetch-check。

## 方法与移植差异

`method/v16.ts` 里的每个常数都是方法的一部分；改了会改变读者看到的排名。改方法时同步修改规则页并提升方法版本。v16 保留编程预算 12% 的原分配：FrontierCode 4.8%、TapTap Maker 2.4%、Arena WebDev 2.4%、DeepSWE 1.2%、LiveBench 编程 1.2%。满分为 1 或 100 的评测，前 10 名相差不到 3 个百分点时本轮按一半权重计分；Elo 等无上限分数不检查饱和。权重、稳定性、协议、输入指纹和历史轮次格式均沿用旧实现。

有意跳过 `/leaderboard` 的专属 OG 图片卡：各榜页回退到本站默认分享图。另一个有意跳过项是上述自动名录种子导入。模块使用引擎现有 BrandMark；评测署名中的站名改为读取 `SITE.name`，总榜元数据原先的字面占位符也改为实际站名。后台运行 API 的模块数据位于 `modules.leaderboard`；来源表显示方式不变。采集开关按当前引擎的安全阀规则，只有 `COLLECT_ENABLED=true` 才抓取（旧版在未配置时也抓取）。旧告警级别 `digest` 对应当前引擎的 `later`，仍进入每日摘要。

其余适配是导入路径、包位置、React Router 通用参数类型，以及首次计算、导航、语言和时间机器的通用插口。`highs@1.15.3`、`hyparquet@1.31.1` 与旧版相同。移植时已有库表和 SQL 不改；之后新增的只有上面价格刷新的一张表和一列。
