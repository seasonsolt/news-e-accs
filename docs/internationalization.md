# 界面、编辑语言与公开 editions

本页描述 English-native 迁移的**本地已实现能力**。此次集成没有访问生产、调用外部模型、发送真实邮件或部署。2026-10-09 的发布记录仍是历史记录，不能作为本次能力已上线的证明；生产当前配置、数据覆盖率和质量须在后续获授权的盘点与发布中确认。实施计划见 [english-native.md](plans/english-native.md)。

## 固定语言 URL

公开无前缀 URL 固定英文，中文入口为 `/zh` 与 `/zh/...`。例如 `/all`、`/items/:id`、`/daily/:key` 对应 `/zh/all`、`/zh/items/:id`、`/zh/daily/:key`。`Accept-Language` 与 `eacc_language` cookie 不改变同一 URL 的返回语言；手动切换跳到对应地址，保留适用筛选条件与 hash，清除语言相关 cursor。cookie 仅保存选择偏好。后台仍为 `/admin` 中文界面。

SSR、浏览器分页/展开/搜索及 React Router `.data` 导航按 URL 显式传 `lang=en|zh` 到 `/api/site`。站点 API 省略 `lang` 保持中文目标；非法及重复语言参数返回 400。新闻字段按实际返回语言标记，不按网页外壳猜测。

`/what-is-eacc`、`/eacc-vs-dacc`、`/eacc-glossary` 是英文概念页（`industry/concepts.ts`），另有对应的中文版 `/zh/<同名>`（`industry/concepts-zh.ts`，与英文页同样的结构、章节锚点和术语 id，中文版内部链接指向中文版）。两个版本互为 hreflang，语言由地址决定；sitemap 仍只列无前缀地址。上线前入口 Worker 需把这三个 `/zh/` 地址及其 `.data` 发往新闻源站。`/coding-plan`、`/pricing`、`/calculator` 属于入口站工具。API、静态资源、OG、RSS、Markdown 下载及后台保持无 `/zh` 前缀，各自通过参数或版本化地址选语言。使用规则与隐私说明保留运营者模板；英文页明确披露现有中文正文，没有自行生成英文法律条款。信源、分类身份、选稿评分与全文许可规则未调整。

站点配置的公开介绍、首页与关于页以英文写作，web 字典为这些明确的 UI 文案提供中文对应项；不通过字典翻译数据库新闻。来源名、专名、文明历史材料等仍可保留原文。

## 主稿、辅助版与正文独立状态

增量迁移 `0042_editorial_language.sql` 为 analyses/publications/stories/facts/reports 增加明确编辑语言；历史记录默认 `zh`，保留旧 `*_zh` 列与内容。新分析直接从原始材料输出 `editorial_language=en` 及中立 `title/summary/reason` 列；不把英文写进中文旧列。新事件、事实与报告直接编辑英文。人工锁定的旧中文事件标题保持中文，其 digest 也使用匹配语言；旧自动事件仅在真实证据更新时转换，不因切换语言重写历史。转换只重写 title/digest/latest；历史 summary 的语言保存在 frame.summaryLanguage，facts 继续保留自己的编辑语言。混合事件不宣称整个稿件为英文，保持 unknown/pending，可通过已存的完整英文辅助版修复 summary 与全部 development 标题；不覆盖历史事实或人工字段。

统一 publication 层在可见性、撤回、释放门槛及全文许可投影之后读取已存 editions。`contentLanguage.requested` 是目标，`sourceLanguage` 是主稿语言，`language` 是**实际返回文本语言**，`status` 为 `original|translated`。原生英文返回 `original` 且 `language=en`，无需英文二次翻译即可就绪。缺少中文 edition 时返回英文并披露状态；旧中文缺少英文时诚实返回中文。严格分发出口依据实际语言决定就绪，未知信息不冒充英文。无 analysis 的原始标题回退只按明确 article.language 标记实际语言，不把默认 zh 编辑存储标签当作中文证据；unknown 原标题不能通过严格目标语言检查，但网页仍可读。来源语言不会覆盖真实分析稿的语言。手工 item prose override 没有可信语言元数据，可能与分析摘要混合，因此保守标记 unknown，严格分发等待已验证的辅助版；不凭文本字符或来源域名猜语言。人工 story 标题的既有编辑语言与锁定 digest 规则不受影响。

正文的 `bodyContentLanguage` 与标题摘要独立。明确标记的英文原文可直接显示，状态为 `original-english`；中文、法文与 unknown 原文保留各自真实状态。标题翻译完成不代表正文完成。新英文主稿的非英文许可正文直接从原始正文生成英文版，不经中文译文中转。链接、媒体、代码与引文使用既有 shield/unshield 保护；错误 markup 回退许可原文。`site_fulltext`、`body_mode`、syndication 和撤回仍优先，edition 不扩展许可。Unknown 正文显示 `lang=und` 及未验证提示。

辅助 editions 支持 en、zh，保存 source language、target language、公开 segment、fingerprint、provenance、model 和 receipt IDs。指纹包含编辑语言、当前文本及报告 revision；编辑、正文或 revision 改动使相应译文失效，标题与正文分别失效。导入与读取就绪判断都会检查目标 prose：普通英文不能回显为中文，保护后的 code、原始引文、短专名/缩写/版本标签可保留。正文丢失链接、代码或媒体保护标记仍拒绝；无效存储行和回显英文的旧中文正文不能通过就绪检查。该确定性检查不是完整语言识别器，短专名与标题存在歧义，英文 Latin-script 语言识别仍有限；真实模型质量须另行验收。兼容既有英文 edition 的旧指纹，不重写历史 hash；旧正文指纹缺少可靠原文语言时只兼容其已有身份，不补造语言声明。

## 英文报告与日历

报告候选始终来自相同公共选稿投影。先应用原有容量规则：日报每分类最多 8 条及全局最多 12 条快讯，周/月报告输入最多 40/60 条，主题与引用仍遵守既有摘要容量与选择语义。国际化不改变选稿数量或排名，也不要求模型引用每条 period 输入。

在这些规则选出的输入中，不因缺失英文版额外丢稿。有效已存英文直接使用，缺失的旧中文或未定语言人工 override 标题/摘要可在**既有受回执与预算管控的报告请求**中修复。修复必须覆盖请求的精确 ID 集合、完整英文 prose 与原数字；不完整、错误 ID、未知引用或混合语言答案拒绝整次成刊，保留旧报告等待重试。不会覆盖原 publication，不另设未管控模型调用。

`config.reportTimeZone` 来自经 IANA 校验的 `REPORT_TIME_ZONE`，默认仍为 `Asia/Shanghai`。`America/New_York` 是可选能力，未在此次启用生产配置。日报窗口是当地 `[D-1 08:00,D 08:00)`，周/月为当地日界线。当地时间按真实 DST offset 解析，不用午夜加 8 小时；纽约春/秋转换的日报可为 23/25 小时。schedule timezone、日报/周报/月报回调 key、catch-up 和邮件当前日期使用相同配置。日报当地 08:00，周一 10:00 周报，月初 10:30 月报。

每份新报告在 content 中保存 reportTimeZone；公开报告 DTO 与相关 v1 详情暴露该值。UI 的报告 masthead、元数据和 today/yesterday 使用存储日历，不对可选纽约报告宣称 UTC+8。旧报告缺省解释为上海；重生成使用已有 window/timezone，revision snapshot 保留原窗口、编辑语言和时区。切换日期、旧 key 冲突、选稿窗口交叠及监控须由运营者落实；新数据不能回滚给仅理解旧中文列的版本。

**公共 time-machine 的 `at`、历史新闻筛选、热点切片及 Codex monitor 继续使用原北京时间语义。** reportTimeZone 不是全站显示时区开关，也没有新增读者本地时间模式。

## 公开分发与兼容性

| 出口 | 默认与语言选择 | edition 缺失行为 |
|---|---|---|
| 网站 | 无前缀 en，`/zh` zh；site API 省略仍 zh | 显示原稿并披露实际语言/状态；不调用模型 |
| 新 RSS | `/feed/v2/{picks,full,all,daily}.xml` en；`/feed/v2/zh/...` zh；分类地址保持稳定分类 ID | 严格版仅输出目标语言就绪条目，全文另校验许可与正文语言 |
| 旧 RSS | `/feed/picks.xml`、`/feed/full.xml`、`/feed/all.xml`、`/feed/daily.xml` 等保持 zh 目标与历史 GUID | 未就绪目标条目不会悄悄混入英文；未知 query 不选语言 |
| v1 API | 显式 `lang=en|zh`；**省略仍以 zh 为目标** | 新英文稿缺少中文时披露 native en fallback；旧 cursor 格式兼容，显式语言 cursor 不能换语言 |
| MCP 3.0.0 | 工具 `lang` 默认 en，可 zh；cache key 含语言 | 必需目标版缺失/混合时 `edition_unavailable` |
| Markdown | `/items/:id/markdown?lang=en|zh`，默认 en | 标题版未就绪 503 `edition_unavailable`；正文未就绪给明确提示与原文链接；引用帖子保留 attribution、原始 URL 及已验证译文，未验证/失效时明确标记原文语言 unknown 或请求版未就绪 |
| OG/poster | 无前缀 endpoint，`?lang=en|zh` 默认 en | 目标版未就绪 404；读取已存稿件，不触发模型 |
| llms.txt | 英文说明并列出语言与兼容入口 | 不随 cookie 变化 |
| llms-full.txt | 英文标题；日报和热点用已存稿件的语言 | 不随 cookie 变化，不调用模型 |

web RSS discovery、页脚、More 与 Agent RSS 地址使用真实 versioned endpoint，不能用旧 feed 上被忽略的 `?lang=en` 冒充英文。v1 旧字段保持，语言/时区为兼容附加字段；将 v1 默认切换英文仍需独立版本或公告，不包含在本次实施。

## 邮件

迁移 `0043_newsletter_languages.sql` 保存订阅 language 和 `language_preference_known`。新订阅默认 en；既有记录 zh 且 preference unknown，不能据此推断本人选择。确认邮件、确认链接与加入 Resend segment 使用已存语言；重复注册保留原 token、语言与 cooldown，不充当偏好修改。

`RESEND_SEGMENT_ID` 用于中文，英文需独立 `RESEND_SEGMENT_ID_EN`，两者不得相同；缺少/相同配置失败关闭，不退回旧中文名单。每种语言独立确认目标报告就绪，再按 `(report_key,language)` claim 发送；旧 `newsletter_sends` 的任何 claim 阻止两种语言再发该期。未就绪语言不 claim，可稍后重查；失败/unknown 保持既有不自动重发保障，迟到的历史报告不发邮件。英文原稿可先发送，中文等待自己的完整 edition；不发送混合报告。report citations 是经过许可/撤回投影的报告快照，其语言继承完整报告的已验证状态，不与当前 story/article 文案比较；关联事件改名或报告编辑摘要不同不会阻止就绪报告发送。

生产必须确认两个 segment 的成员隔离、旧订阅迁移选择、域名/from 配置以及防止旧 newsletter worker 并行运行。当前没有偏好更新 UI；旧后台 newsletter 统计尚未聚合新的 language send 表。Newsletter 开关在普通本地验证关闭，仅本地 HTTP stub 测试按需启用。

## 已收录英文 URL 的发布硬门槛

- 原有无前缀英文路径继续使用原地址，不迁移到 `/en`，不因语言 cookie、Accept-Language 或 IP 自动重定向到 `/zh`。
- 已有英文页面的 canonical 保持原生产域名和原路径；中文版本自引用 `/zh`，不得让英文 canonical 指向中文。新增 hreflang 只声明实际可访问、已验证的版本。
- 不因辅助译文未就绪撤下原英文 URL、改变公开身份或新增 noindex；撤回、合并及原有历史筛选规则继续按既有规则处理。
- sitemap 中保留现有英文路径，新增中文入口不得替换或删掉已收录英文地址。导航、RSS、分享图和结构化数据的英文链接仍使用无前缀路径。
- 发布前获取线上 sitemap 和已知收录 URL 清单，对照候选版本逐一核验 HTTP 状态、重定向链、英文正文就绪、canonical、robots、结构化数据及菜单 `.data`。新闻、事件、报告的 ID/期号及已有合并重定向必须保持一致。
- Worker 修改应增加中文分流，不改变既有英文新闻及入口静态工具的归属；上线后从公网复核上述地址。发现原英文 URL 新增 404、错误语言重定向、错误 canonical/noindex 或正文缺失时阻止发布或回滚。

2026-10-10 本地空库检查 `/`、`/all`、`/what-is-eacc` 返回英文、自引用原 canonical；`/zh`、`/zh/all`、`/zh/about` 使用中文及自身 canonical，sitemap 保留无前缀地址。此检查不等于生产 Google 收录清单或历史详情 URL 已完成验证。

## SEO、缓存与入口 Worker

canonical 对应当前 edition URL；存在真实有效双语版本时提供 reciprocal en/zh-CN 与英文 x-default。item/story/report loader 最多用一次带 1 秒超时的匿名对侧 edition 读取验证 alternate；失败只抑制 alternate。正文回退的 lang/OG/NewsArticle 描述实际内容，不随 UI 偏好冒充英文。英文概念与中文法律正文不虚构对侧版本。

公开 HTML 和 Router `.data` 由 `apps/web/server.ts` 的 `pageResponse` 统一写缓存头：成功的匿名 GET/HEAD 使用路由 `cachedPage`/`edgeTtl` 声明的期限，返回 `public, max-age=min(ttl,300), s-maxage=ttl, must-revalidate` 和 `X-Accel-Expires`，不按 Cookie 或 `Accept-Language` 设置 Vary。上游绝对截止时间不能重新起算。后台、非 GET/HEAD、非 200、带 `Set-Cookie`、未声明缓存策略及明确 `private`/`no-store` 的页面仍为 `private, no-store`、`X-Accel-Expires: 0`。

共享缓存的前提是服务端渲染只按 URL 选择语言和筛选，不读取 cookie、`Accept-Language` 或用户代理来改变输出；用户代理只决定 bot 的 `onAllReady` 与普通请求的 `onShellReady` 发送时机。语言提示、外观、onboarding、收藏和反馈草稿在浏览器应用；`/starred` 的空壳、`/feedback` 的空白表单与 `/subscribe` 的初始表单按同一 URL 渲染相同内容，保留 300 秒期限。搜索繁忙页明确 `no-store`，`/products` 未声明策略，仍不缓存。`apps/web/tests/cache.test.ts` 冻结服务端时间，检查代表性 HTML/`.data` 在无偏好、cookie、中文 Accept-Language 和 Googlebot 请求下字节一致。API、RSS、图片、资源保留各自策略。

入口仓库 `seasonsolt/e-acc.ai` 本次不可用，**未编辑/发布其 `edge/src/route.mjs`**，是上线前置依赖。分类匹配须识别 `/zh` 与全部公开中文路由，以及对应 `.data`，转发原 path/query/method/body 不变。用于分类时可剥去末尾 `.data`、把 `/_` 映射为 `/`、`/zh/_` 映射为 `/zh`；覆盖 `/_.data`、`/zh.data`、`/zh/_.data`、`/zh/all.data`、中文 item/original/story/report/topic 分页与所有菜单 data 地址。无前缀英文菜单与三个英文概念 `.data` 也须通往新闻源站。API/assets/media/OG/feed/admin 与入口工具继续原策略；不要创造中文 API/资源前缀或让另一 origin 去剥 `_routes`。中文概念镜像按设计 404。代理必须尊重 HTML/data 响应的缓存期限及 no-store。

## 离线导出与 worker

Node ≥24 下，CLI 默认只读扫描/export，`--lang en|zh` 选择辅助 edition；只有明确 `--apply` 才事务写入：

```bash
node scripts/content-translations.ts --all --lang zh --limit 50 \
  --output /tmp/content-zh-001.json --checkpoint /tmp/content-zh-cursor.json
node scripts/content-translations.ts --all --lang zh --limit 50 \
  --resume /tmp/content-zh-cursor.json --output /tmp/content-zh-002.json
node scripts/content-translations.ts --import /tmp/content-zh-001.json
# 确认目标数据库与范围后才执行 --apply
```

批次保存 targetLanguage，每条保存 sourceLanguage/targetLanguage，report 使用 sourceRevision。source segments、fingerprint、精确翻译 keys、非空 prose、当前可见身份与 body markup 全部验证；不伪造离线 paid receipts。权威扫描包含全部当前可读 publication，不以 pool/sitemap 替代历史完整性；正文范围仍受许可限制。checkpoint/cursor 与目标语言一致。

`content.localize` 仅在 `CONTENT_TRANSLATION_ENABLED` 和 `MODEL_CALLS_ENABLED` 同时启用时调用既有 translate 模型，经 receipt/按请求数量的预算熔断；默认关闭。en/zh 使用独立 cursor，开始扫描前持久化下一轮目标；语言 lane 失败后仍允许另一 lane 在剩余额度内推进，最终记录失败。失败 lane 不推进游标；部分完成后失败会预留整段 allowance，不突破合并额度，单条额度的轮次通过下次轮换保证公平。不可用 prose/markup 将已收到回执标记 failed，允许受预算管控的重试；unknown outcome 保持阻断，不再次请求。回执 subject、prompt version 与语言方向身份保持现有规则。`translatePending` 保留既有中文全文流程，native en 的许可英文正文不多买中文中转。队列/预算/错误可能导致辅助版延迟，不承诺实时双语。

## 验证与上线前置

此次本地使用现代 Node、全新空 `_test` 数据库应用全部增量迁移，collection/model/Feishu/IndexNow 关闭，真实 provider 路径不启用。执行 workspace typecheck、web build/tests、显式 `--experimental-test-module-mocks` 的 editorial/report/队列/分发/邮件/日历集成测试，以及 `buildApp()`（无 heartbeat/provider startup）与 built web 的本地 smoke 和 `/zh`/`.data` 请求。

完整 `npm test` 包含显式开启 MODEL/COLLECT 阀门的既有测试，不能原样安全执行。安全广泛测试排除 `tests/analyze-shutdown.test.ts`、`tests/translate-shutdown.test.ts`、`tests/alerts.test.ts`、`tests/receipts.test.ts`，其余保留 model=false；已有依赖 enabled local-model stub 的失败另以 base checkout/独立空测试库复现。fixture module-mock 测试必须带 experimental flag，否则会 skip。精确次数、日志、基线差异与清理记录见本次集成报告，不以组件单独运行结果替代整体验收。

2026-10-10 首轮 review 修复使用新的本地空 eacc_review_fixes_final_20261010_test 数据库，全部 40 迁移已应用；95 focused backend 全通过，web 65 通过/1 既有 skip，typecheck/build、34 whole-site smoke、23 中文 HTML/data/RSS 与 3 英文概念镜像 404、4 mixed-story/More HTTP 检查通过。真实模型阀门始终关闭；provider 仅使用模块 fixture，邮件只指向本地 Resend stub。七项 finding 的回归、确切命令、清理和限制见 fixes/first-pass.md；既有 25 个 closed-model 广泛测试基线失败未重跑。本地 SSR 确认 unknown mixed story 也显示 pending edition 提示。

上线尚需获授权的生产盘点与模型质量/预算观察、入口 Worker 路由发布、Resend 英文名单配置、明确报告日历 cutover、兼容 rollback 版本及浏览器验收。2026-10-10 独立 reviewer 已复查七项 finding 的修复，结论为 OK with notes，未发现新的证据支持的 P0/P1/P2 问题；此结论不代表已验证生产或真实 provider。新闻站仅用 `deploy/update.sh` 发布；本次没有执行生产动作。
