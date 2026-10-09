# 界面与内容国际化

本站保留资讯站首页，公开产品目录是独立的 `/products` 导航项（桌面和手机）。目录数据在 `industry/products.ts`，只收录已确认可公开推广的产品。`AudioStudio` / `Retake` 和私有 Legal 不在目录里。

## 语言选择

界面支持英文 `en` 和现有中文 `zh`（HTML 使用 `zh-CN`）。未设置偏好时，SSR 从浏览器发送的 `Accept-Language` 按 q 值及原有顺序选择首个支持的语言，忽略 q=0、非法 q 和不支持的语言；无法匹配则默认英文。`zh-TW`、`zh-HK` 等中文偏好使用同一份现有中文，尚未提供繁体转换。正常浏览器的此请求头反映其语言偏好（通常对应 `navigator.languages`）；本站不请求地理位置权限。

导航和页脚均有语言选择器。手动选择写入 `eacc_language=en|zh` 偏好 cookie，优先于浏览器偏好，保存一年，`Path=/; SameSite=Lax`，HTTPS 下加 `Secure`。它只包含语言选择，不包含身份信息。切换整页重载，服务器输出、HTML lang、metadata 和 hydration 从同一份 root loader 数据开始。后台保持原有中文操作界面。

文案字典在 `apps/web/app/lib/messages.ts`，检测逻辑在 `locale.ts`，纯翻译函数在 `translate.ts`，React 接入在 `i18n.tsx`。只在显式界面文案位置使用翻译函数；不遍历/改写新闻正文 HTML，不触发模型调用。新文案需要补齐英文键值，并实际检查渲染出的整句和空格。

## 当前覆盖与保留原文

首轮覆盖站内公开导航、主要新闻阅读与搜索流程、热点和事件、报告外壳、订阅、公开产品目录、关于/反馈/Agent 接入、模型榜和文明视图的主要操作文案。UI 日期保持业务定义的北京时间（UTC+8），英文数字使用现有阿拉伯数字/英文紧凑单位。英文界面显示后台已就绪的内容英文版；未就绪时明确提示保留原文。订阅文案明确邮件当前是中文。

新闻标题、摘要、推荐理由、事件综述与报告正文使用后台或离线生成、入库且 fingerprint 匹配的英文版。单纯切换界面不会现场生成译文；没有有效译文时仍为原文。来源站名、主题定义、文明时代/里程碑资料、模型评测来源说明等配置或发布内容可能保留原文；行业静态分类/标签已有英文显示映射。使用规则/隐私说明的正文保持现有用户模板，没有自行改写或声称提供英文法律文本。语言偏好 cookie 的说明已记录在本文，正式上线前应由运营者确认并同步隐私说明。

RSS、版本化公开 API（/api/v1）、MCP、Markdown 下载、llms.txt、站点地图和分享图继续使用原有发布语言，本轮没有让这些出口提供英文 edition。它们不会跟随浏览器 cookie。网站的 /api/site 读取通过同一 publication 层显式选择 lang=en|zh；缺省 zh，兼容既有消费者。

`/coding-plan`、`/pricing`、`/calculator`、`/what-is-eacc` 来自另一个静态站点仓库，此次没有翻译其正文。

## SEO 与缓存

语言不增加独立 URL，canonical 保持原路径和现有有效筛选参数，历史页面继续 noindex。HTML lang、静态页面标题/描述和 OG locale 跟随本次 SSR 的界面语言；动态新闻标题/描述使用当前读取到的英文 edition，未完成时保留原语言。没有可以单独访问的语言版本 URL，所以不添加虚构的 hreflang。

生产 web server 对公开 HTML 和 React Router `.data` 使用 `private, no-store`、`X-Accel-Expires: 0`，并保留/追加 `Vary: Cookie, Accept-Language`。**不依赖 CDN 是否尊重 Vary: Cookie**，避免不同语言用户收到同一份共享 HTML。这会取消此前的页面与导航数据共享缓存和浏览器复用，增加 SSR/API 请求量；后续可设计独立语言 URL 或明确的边缘语言缓存键恢复性能。API、RSS、图片和静态资源仍按各自原策略缓存。

部署前检查前置代理未强制覆盖个性化 HTML 的 no-store。当前已审计的 e-acc.ai Worker 转发浏览器请求头、未强制缓存新闻 HTML；其站点地图/robots/llms 的缓存不影响界面语言。

## 部署边界

2026-10-09 已部署，详见 [发布记录](../deploy/releases/2026-10-09-i18n.md)。主域名 Worker 已把 `/products` 发往新闻源站。对应的路由与测试改动已合入 `seasonsolt/e-acc.ai` 的 `edge/src/route.mjs`。没有新增 `/language` 路由。

## 验证

`apps/web/tests/locale.test.ts` 覆盖 q 值、q=0、语言回退、cookie 优先级、格式化界面文案与未知新闻不被翻译。生产 SSR 的 `cache.test.ts` 验证语言首屏、手动优先、HTML/data 缓存隔离、匿名 API 读取、静态资产/feeds 原缓存和独立产品目录。原有中文 SSR 用例显式带中文请求头，继续验证原行为。

## 动态内容 editions

迁移 `0040_content_translations.sql` 增加独立译文表，不改写中文 editorial 数据。英文新闻标题、摘要、推荐理由、事件标题/摘要/综述/最新进展/时间线标题/摘录、报告标题/导语/概览/分节/引用摘要存为稳定 segment→translation 映射。原始报道的链接、ID、日期、指标和归类不翻译；前端分类与行业静态标签使用显示映射，筛选仍传原身份。选稿、评分、采集标准不变。

`packages/backend/src/publication/content-source.ts` 是公开 DTO→segment/fingerprint 的纯模块，可给离线翻译代理使用；它不连接数据库、不调用模型。item 只取 title/summary/reason，所以公开列表与详情 hash 一致；story 另含 excerpt.text 和 developments.N.title；report 取已裁剪的公开正文字符串，跳过 available=false 的撤回引用，且报告 revision 参与 hash。计数、图像签名和时间不参与正文 hash。编辑覆盖改变公开文本后旧译文不再匹配；重新发布的报告也失效。

`content-language.ts` 只在公开读取结果上覆盖 hash 匹配、文本仍匹配的字段。没有有效 edition 时返回原文本及 `contentLanguage.status=original`；网站显示 `English edition pending · Original content`。文章正文有独立 `bodyContentLanguage`，不能用标题已翻译来冒充全文已翻译。英文来源可直接显示 original 正文；其余许可全文使用独立 body edition，完整段落通过既有 shield/unshield 保护链接、媒体和 inline code，恢复后 sanitize，重新生成英文目录。site_fulltext/body_mode 的限制由原 publication detail 投影先执行，译文不扩大可见范围。X 引用在英文页使用原引用，中文译文不会被当成英文。

SSR、搜索与主阅读分页/展开请求显式传 lang，中文与英文 API URL、ETag 分开；共享 HTML 仍 no-store。筛选及 cursor 仍表示同一新闻集合，不因翻译改变选稿或排序。英文 /all 搜索同时匹配当前英文标题/摘要与原始索引，过期译文不参与搜索；英文关联性搜索使用标题优先、其次摘要/原始索引，暂未为英文翻译正文建立全文搜索索引。story 列表批量读基本字段，不为每条热点加载完整详情；报告索引校验仍需要对应报告的公开投影，英文归档首次请求会比原先多读数据库。

更新日志通过 `industry/changelog.json` 中每条的 `en` 提供英文标题与正文，网站 API 按 `lang` 返回对应版本；版本提醒、类型身份和过滤保持一致，日期、月份与类型标签随界面语言显示。未附英文版的外部行业包条目仍回退原文。

文明年表原始历史材料、法律正文和另一静态站点的正文继续原语言。来源名、专名、用户搜索串保留原文。当前公开 RSS/v1/MCP/Markdown/分享图也继续原发布语言，不能声称已全出口英文。

## 全历史离线导出、验证与导入

本次译文由 Codex `gpt-6-luna` 代理离线生成；这是译文来源记录，不是已证实可用的 OpenAI API model id，也不生成伪造的付费回执。导入只做 JSON/schema、每个 segment key 完整性、非空文本、当前公开身份与 fingerprint 验证，不调用模型。全部校验通过后 `--apply` 的批次事务写入；当前源改变则拒绝整批。source 行写入时加共享锁，实际读者仍再次验证版本。可以重复导入相同内容，表按 kind/id/lang 更新，不增加重复版本。

先在要操作的数据库执行增量迁移，再使用 Node ≥24：

```bash
# 默认只有扫描、统计和文件导出。--all 包含全部历史当前公开 editorial item，
# 包括不在内容池/不被索引的公开详情，以及可读 stories 和全部 reports。
# 排除撤回、非 editorial 信源、尚未释放的精选；body 仍由许可投影决定。
node scripts/content-translations.ts --all --limit 50 \
  --output /tmp/content-en-001.json --checkpoint /tmp/content-en-cursor.json
node scripts/content-translations.ts --all --limit 50 \
  --resume /tmp/content-en-cursor.json --output /tmp/content-en-002.json \
  --checkpoint /tmp/content-en-cursor.json
# 也支持 --cursor 'item:...'；游标按统一 C collation 排序，无页数/日期截断。
# nextCursor=null 表示结束；完整扫完后从头重扫，可发现较早 ID 的编辑和新增。
# 已完成且 hash 未变的 edition 计入 alreadyComplete，不重复导出。

node scripts/content-translations.ts --import /tmp/content-en-001.json
# 上一条默认 dry-run，仅验证。确认目标数据库和范围后才写：
node scripts/content-translations.ts --import /tmp/content-en-001.json --apply
```

批次严格结构：`{schemaVersion:1,targetLanguage:"en",entries:[{kind:"item"|"story"|"report"|"body",id,sourceHash,segments:[{key,text}],translations:{key:"English text"}}]}`。report id 为 `daily:YYYY-MM-DD` / `weekly:YYYY-Www` / `monthly:YYYY-MM`；body id 仍是 article id。代理只填写 translations，保持其余字段原样。JSON 字符串保留段落、引文和事实；body 字段保留 shielded inline HTML 和占位符。不得把受限原始正文另塞入批次。

全历史范围需要数据库权威导出保证完整；公开 pool 分页和 sitemap 可能漏掉 noneligible/nonindexable 的可读详情。通过旧线上 API 抓取的译文可先离线组装，但上线导入仍会按当前数据库文本复核；有变化须重导出受影响 entry。CLI 不读取自动生产连接，也不部署；DATABASE_URL 由操作者明确提供。2026-10-09 已完成生产数据库权威盘点、迁移、逐批验证导入与部署。

## 可选 provider worker

新 `content.localize` schedule 每 5 分钟运行，必须同时设置 `CONTENT_TRANSLATION_ENABLED=true` 和 `MODEL_CALLS_ENABLED=true` 才调用模型；前者的代码默认值仍为关闭。运营者现已明确授权生产开启持续英文补译，并接受既有预算内额外 API 请求费用；配置和发布由运营者执行，开发/测试仍保持全部安全阀关闭。使用已配置的 `modelFor('translate')` API 模型，chatJson→既有回执/按请求数量的预算熔断，purpose=translate_content；Codex 离线 gpt-6-luna 来源标记不等于 API model ID。旧中文全文 translatePending schedule 保持原策略。

默认每轮最多处理 5 个需要翻译的 edition，已完成候选不占名额。权威扫描每页 1000 条，跨页核验当前 fingerprint，必要时在同一轮回绕断点前的内容，避免 1700 条已完成数据拖成数十小时的重扫。先通过 publication 当前热点条和最新公开列表找 story/item 优先候选，最多占 4 个名额，至少保留 1 个历史队列名额；优先翻译不推进历史游标，重复候选不会再次购买。达到上限时游标停在实际处理的最后一条，不能直接跳到扫描页尾。失败不推进该轮游标，已存好的 edition 在重试时跳过；已收到但未提交业务结果的模型答案由含 fingerprint 的回执 subject 复用，预算熔断照常阻止继续付费。扫描仍逐条核验公开投影，规模增长会增加数据库读取负载，不承诺实时英文：排队、失败、预算停机或源内容再次编辑时，页面仍诚实显示原文和 pending 标记。

## 本轮实际验证（2026-10-09）

- Node 26.5（满足仓库 ≥24）、`npm run typecheck` 与 web build 通过。
- web tests 43：42 通过，1 个既有 feature-off skip，0 失败。
- 新 content-language 集成测试 9 全通过；覆盖真实数据库导入默认不写、来源校验、英文 API/ETag/搜索、编辑与报告 revision 失效、story/索引、正文独立状态/英文目录/许可撤销、worker opt-in 关闭及 HTML 链接/code 保护。
- 新空 `eacc_content_final_test` 应用 40 migrations 后完整 `npm test`：187 测试，160 通过，27 失败。27 个失败名称与改动前保持 MODEL_CALLS_ENABLED=false 时的基线完全相同（本次新增 9 个均通过）。代表失败 `tests/translate.test.ts:129` 的 `run.quotes >= 1`，既有模型 mock 链被关闭的模型阀门挡住；未为全绿开启安全阀。
- 另在本地 `eacc_content_preview_test` 构造真实公开 DTO 50 条，将 gpt-6-luna 实际批次 dry-run 校验后导入，重扫统计 scanned=50、alreadyComplete=50、pending=0。生产模式 SSR 的 `/all`、新闻详情标题/metadata 为真实英文，手动中文 cookie 恢复中文；运行中的完整 smoke 通过，3 个未发布的模型榜按脚本预期跳过。

以上描述的是部署前的本地验证。2026-10-09 生产发布后另完成源站和公网 smoke、浏览器语言与 cookie 优先级、英文内容/搜索/ETag 检查；权威全量重扫为 scanned=1703、alreadyComplete=1703、pending=0。

持续队列新增 `tests/content-translation-sweep.test.ts` 8 项通过，覆盖 2502 个候选跨页跳过完成项、翻译数量上限、中途断点、回绕发现编辑、热点去重与历史名额、失败不推进、真实本地 HTTP 回执复用、公开优先候选过滤及两级关闭阀门；模型/采集/推送安全阀保持关闭，未调用外部服务。`npm run typecheck` 与 diff 检查通过。本次队列修正的配置和发布由运营者另行执行。
