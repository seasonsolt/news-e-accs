# 计划：署名长文写作台

> 2026-11-12 起草，同日使用者确认（第 7 节）。只属于我们自己的生产站（e-acc.ai）。
> 背景：11-12 决定停下页面打磨，专心做原创内容。模型改写的新闻页太薄，10-26 起被 Google 降权；署名长文是别家抄不走、也是唯一能挣到反链的内容。[第二阶段计划](phase-two.md) 已定：长文署名 seasonsolt，注明 AI 起草、本人审定，以英文为主。

## 1. 要做的事

站长把零散的观点和片段打进后台，worker 把它们扩写成完整的文章、排好版、配好图；站长审改后，作为署名长文发布在 e-acc.ai。

## 2. 放在哪

- 新模块 `modules/essays/`（`@aihot/essays`）：自己的迁移、worker 队列、后台接口、公开读取、网页，按 `docs/architecture.md` 的“模块”接入三份清单、`site/package.json` 和 `Dockerfile`。
- 后台 `/admin/essays`（列表）和 `/admin/essays/:id`（写作台）。后台导航加“长文”，有任务失败时带数字。
- 用自己的表，不复用 story-depth 的 `editorial_reviews`：那张表是“模型出一稿、审一次”的形状，每个主题同时只能有一个进行中的请求；长文是作者主导的多轮来回（碎片、提纲、正文、单节重写、配图各有版本）。

| 表 | 内容 |
|---|---|
| `essays` | 一篇文章：slug、状态（draft / published / withdrawn）、碎片原文、当前提纲、当前正文、标题、导语、封面、乐观锁版本 |
| `essay_revisions` | 每次保存或模型产出的正文快照（来源：outline / draft / revise / manual），带回执号，可对比、回退 |
| `essay_tasks` | 交给 worker 的活（提纲、成稿、单节重写、画图）：排队 / 进行中 / 完成 / 失败、错误、回执号 |
| `essay_images` | 图位：封面或正文插图，画面描述、文件、来源（drawn / uploaded） |
| `essay_publications` | 每次发布的不可变快照；公开页只读它，编辑中的稿子不影响线上 |

迁移按 `AGENTS.md` 的规则：放在模块的 `migrations/`，从 0144 起每个文件一条语句，唯一索引用 `CONCURRENTLY IF NOT EXISTS`。

## 3. 流程

1. **碎片**：一个大文本框，中英文都可以，一段一个想法即可。可附“参考”：本站的事件页、指数页、宣言地址，worker 读它们已公开的标题和摘要，作为文中可以引用的材料。
2. **提纲**（约一分钟）：一句话核心论点、三个标题候选、分节提纲（每节要点和用到的碎片编号），以及“论证薄弱处”问题清单，提示还缺什么例子或反驳。站长直接改提纲，或补几句碎片后重跑。先出提纲，避免整篇写偏了才发现。
3. **成稿**：按改定的提纲写全文，格式是 Markdown 的一个子集：段落、小标题、引文、列表、大字论点句、图位 `![figure:1]`。同时给出导语、搜索摘要（meta description）、封面和一两张插图的画面描述。规则：不编造事实、数字和引语；碎片和参考材料以外的事实性说法用 `[[check: …]]` 标出来，发布前必须清掉。
4. **修改**：左边 Markdown 编辑，右边用公开页同一个渲染组件预览。每次保存留版本，可以对比和回退。选中一节写一句指令（“更锋利”“补一个反例”），worker 只重写这一节，结果以对比形式给站长采纳或丢弃。
5. **配图**：每个图位一张卡片，画面描述可以改。**先联网搜图**：worker 用 Codex CLI 的网页搜索找相关网页，取它们的预览图（og:image），过滤掉图标和横幅，给出几张候选，带出处网页，站长挑一张（和公众号配图的“找图”同一条路）。搜不到或不合适再点“画”，用现有的 `codexImage`（Codex CLI 的画图工具），也可以直接上传。搜图走 `codex-text` 预算，画图走 `codex` 预算，都有回执。画图的统一风格前缀放在 `industry/prompts/essay-art.md`。文件存 `uploads/essays/`（随备份），1280 宽 JPEG；网上找来的图在图下标出处，能不能转载由站长判断。
6. **中文版**：英文稿改定后，worker 按中文读者重写一份（不是逐句翻译，和宣言的做法一样），段落和图位与英文对应；站长同样可以改、可以单节重写。
7. **发布**：中英两版一起发。检查清单通过才能发：两版都没有 `[[check]]`、有封面、有标题和导语、slug 合法。发布写一份不可变快照；之后再改要点“更新发布”，`dateModified` 才变。可以撤下（页面返回 410，退出站点地图）。文末固定一行说明：根据作者笔记由 AI 起草，作者修改并审定。

## 4. 模型

模块通过 `models` 插口注册四个步骤，`site/models.ts` 的 `DEFAULTS` 给默认值，后台“模型与评测”页和环境变量可以逐步改选：

| 步骤 | 环境变量 | 默认 | 理由 |
|---|---|---|---|
| `essayOutline` 提纲 | `ESSAY_OUTLINE_MODEL` | `codex-sol` | 订阅额度，结构化输出稳 |
| `essayDraft` 成稿 | `ESSAY_DRAFT_MODEL` | 新预设 `codex-sol-write`（gpt-6.1-sol，reasoning medium） | 长文需要多想一步；仍走订阅额度 |
| `essayRevise` 单节重写 | `ESSAY_REVISE_MODEL` | `codex-sol` | 短任务 |
| `essayLocalize` 中文版 | `ESSAY_LOCALIZE_MODEL` | `codex-sol-write` | 整篇重写，要求和成稿相同 |

都经 `chatJson`，有回执和预算熔断。提示词放 `industry/prompts/essay-outline.md`、`essay-draft.md`、`essay-revise.md`、`essay-localize.md`，只管结构和规则，不管语气。

**文风 skill**：语气和声音由使用者提供的写作风格 skill 决定。每个 skill 一个文件夹 `industry/essay-styles/<名字>/`，里面一份 `SKILL.md`（开头的 `name`、`description`，正文是写作要求），文件夹里其他 `.md` 作为参考材料一并读入。写作台每篇文章选一个文风，提纲、成稿、重写、中文版都把它放进系统提示；每次模型产出记下所用文风的名字和内容指纹，事后能查是哪一版文风写的。先带一个中性的 `plain` 文风；使用者的 skill 在后台“文风”卡片里上传（文件夹、`.zip` / `.skill` 包或单份 SKILL.md），存进 `essay_styles` 表，传上去马上能选，同名再传即替换，没有文章在用时可以删除。只读其中的 Markdown 文字，不执行脚本。

画图用 Codex CLI 的画图工具，搜图用 Codex CLI 的网页搜索。

## 5. 公开页

- `/essays` 列表，`/essays/<slug>` 文章；中文版 `/zh/essays`、`/zh/essays/<slug>`，两版用 hreflang 互指。排版沿用宣言页：大标题、导语、署名和日期、封面、正文、文末说明、相关事件和指数链接。
- 公开读取在模块的 `backend/publication.ts`，只读 `essay_publications`，和 story-depth、模型榜的做法一致。读者打开页面不触发模型。
- **JSON-LD**：文章页一个 `Article`（headline、description、image、datePublished、dateModified、author `Person`（name、url 指向 `/about`）、publisher `Organization`（name、url、logo）、mainEntityOfPage、inLanguage、wordCount）加 `BreadcrumbList`；列表页 `BreadcrumbList` 和只含网址的 `ItemList`。测试断言每个带 `@type` 的对象字段齐全、非空。
- **发现清单**：模块的 `sitemap.pages` 列 `/essays`，`sitemap.entries` 列每篇已发布文章，`lastmod` 取该篇最近一次发布的时间，不取编辑时间。中文版总有 hreflang 链过去，所以也列。IndexNow 自动跟随。另加 `/feed/essays.xml` 和 `llms.txt` 里的条目。
- **入口**（第 7 节）：顶部导航加「长文 / Essays」一栏（手机底栏同步）；首页加“最新长文”一块；「更多 → 了解 e/acc」里加一项，宣言页底部列出文章；`/feed/essays.xml`，新文章发布后第一封日报邮件带上它。

## 6. 约束

- 模型只在 worker 任务里调用；`MODEL_CALLS_ENABLED` 开发时关着，后台会提示“模型调用没有打开”。
- 付费调用都经过 `providers/receipts.ts` 和预算熔断。
- 测试用本地假模型服务；画图在测试里用假的 `CODEX_BIN` 脚本。
- 交付前跑 `npm run typecheck`、`_test` 库的测试、web 构建和浏览器测试。

## 7. 使用者的决定（2026-11-12）

- 方案同意，配图改为**先联网搜图，再自己画**。
- **语气和声音**由使用者另行提供写作风格 skill，写作台要能选。
- **中英同时**出。
- **入口**：顶部导航一栏、首页一块、宣言和「更多」菜单、RSS 和日报邮件，四处都要。
