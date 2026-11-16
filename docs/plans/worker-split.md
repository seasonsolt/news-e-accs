# 计划：内容生产搬到 mini，DMIT 只做对外服务

> 2026-11-16 起草。只属于我们自己的生产站（e-acc.ai），不是模板的通用说明。

## 1. 目标与已定的决定

DMIT（1 vCPU、1.9 GB）只负责对外响应：api、web、Postgres、cloudflared。耗资源的内容生产，先从调模型的任务开始，搬到家里的 mini（10 核、在线时间不如机房），mini 成为“产生内容的后端”。长期方向是逐步过渡到 Cloudflare 原生全栈。

使用者 2026-11-16 定下：

1. **数据库留在 DMIT**，mini 上的 worker 远程连（方案 A）。家里断网时网站照常，只是暂停出新内容。不把主库搬到 mini：api 也要写库，主库在家里会让网站的写操作依赖家里的线路。
2. **worker 产出的文件改放 R2**，不在两台机器之间同步目录。这和 Cloudflare 原生的方向一致。
3. **分步走**：先量，再打通网络，先只把调模型的任务搬到 mini，稳定后再看其余任务。
4. 写作模型想从 Codex 换成 antigravity-cli（`agy`）。`agy -p` 是官方客户端一问一答，不是反代；但 Google FAQ 写着把 `agy` 包进应用“not supported under consumer plans”，属于灰色地带。先在 mini 上手动对比写作质量，再决定是否接进生产。`agy` 只装在 mini 上。

## 2. 代码现状里的卡点（2026-11-16 只读排查）

**worker 不能分角色运行**

- `apps/worker/src/schedules.ts:110-113` 启动时删掉所有不在本进程清单里的 `cron.*` 队列（连同排好的任务和定时）。第二个 worker 只跑一部分定时，启动时就会删掉另一台的定时。
- `apps/worker/src/main.ts:24-31` 无条件注册全部队列；现有开关（`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 等）都不能按机器分配队列。`MODEL_CALLS_ENABLED=false` 只会让调用报错重试，不会把任务让给另一台。
- 心跳键固定是 `heartbeat.worker`（`operations/watch.ts:28`），两个进程会互相覆盖，api 的看门狗分不出哪台停了。

**远程连库的延迟**

- 每次模型调用都经过 `paidRequest`（`providers/receipts.ts:256`）：申领事务在 `pg_advisory_xact_lock('budget:'+service)` 里顺序执行 8–10 条语句，回写再 5 条左右。150–200 ms 往返下，每次调用持锁约 1.5–2 s，**同一 service 的所有调用（两台机器都算）都要排队等这把锁**。
- `events.group`（并发 1，带行锁的约 7 个事务）和 `content.analyze`（模型调用后接 `publishArticle`，约 28 条查询）是数据库最重的两个队列，第一步不搬。

**worker 和 api 共用磁盘**

模型任务产出、由 api 对外发的文件：

| 文件 | 写入 | 读取 / 对外 |
|---|---|---|
| `uploads/essays/` | `essays.task`（画图、搜图）、api 上传和发布时的卡片 | `modules/essays/api/public.ts:29-33`、`admin.ts:34-37` |
| `uploads/wechat-illustrations/` | `wechat.illustrate`、api 上传 | `admin/wechat.ts:332,442`、`routes/wechat-video.ts:19-25` |

其余共用目录（`imgcache/`、`ogcache/`、`feedback-screenshots/`、`uploads/` 二维码和壁纸预览、`backups/`、`sitemap-last.json`）属于不调模型的任务，第一阶段跟着 DMIT 上的 worker 不动。另外：

- api 用 `codexConfigured()` 判断能不能画图（`wechat-illustrations.ts:63`、`modules/essays/backend/store.ts:106`）。Codex 只装在 mini 时，后台会显示“不能画”，要改成看有没有能跑模型任务的 worker。
- `ops.backup` 只打包本机 `uploads/`；文件进 R2 后，这部分备份要重新设计（R2 本身就是持久存储）。

**现有 R2 能力**

- `packages/backend/src/lib/s3.ts` 有自己写的 SigV4 签名和预签名，已有测试。
- 壁纸模块的 `modules/wallpaper/src/store.ts` 只有 `put` 和 5 分钟预签名 GET，配置在 `WALLPAPER_STORE_*`。
- 入口 Worker（`deploy/edge/`）绑定了 R2 桶 `e-acc`（`MEDIA`），目前只直接发 `scenes/`。

## 3. 分阶段

### 阶段 0：量

2026-11-16 晚上（北京时间 18:43–18:53）在 DMIT 上测了一次，worker 18:39 刚随发布重启：

- 整机：1 vCPU，负载 1.01 / 0.62 / 0.34；内存 1973 MB，已用 979 MB，还能用 994 MB；swap 用了 73 MB。
- 10 分钟、每 5 秒采样一次：worker 平均 CPU 1.6%，最高 17.7%；api 0.7%；web 0.7%；sing-box 平均 1.6%，最高 18.4%。worker 内存从 336 MB 涨到 550 MB。Postgres 自启动以来平均 6.5%。采样期间每 5 秒的那一刻都没有正在跑的 codex 进程，最近一小时只有 8 次 codex 文字调用，每次平均 7.5 s。
- 近 7 天花时间最多的定时任务：`content.localize`（2057 次，共 121 分钟，平均 3.5 s，最长 129 s，失败 63 次）、`seo.search-console`（一次 29 分钟）、`sources.x-renames`（28 分钟）、`content.localize-sweep`（25 分钟，失败 6 次）。精选和归组是队列任务，不记在这张表里。
- 近 7 天 codex 文字调用约 8000 次：精选和归组那一侧（打分、预筛、结构、理解、摘要、归组）约 6100 次，占 76%；`models` 角色那一侧（翻译 1223、事件简报 640、公众号、长文）约 1900 次，占 24%。
- mini 到 DMIT：ping 平均 133 ms（131–136，20 个包不丢），TCP 建连 135–140 ms，是直连，不经过家里路由器的代理。

结论：DMIT 平时不吃紧，压力是阵发的。只搬 `models` 角色，只能带走约四分之一的 codex 调用；要明显减轻 DMIT，得把精选（`content.analyze`）也搬过去，而它最依赖数据库往返。所以这次拆分的主要收益是：写作类模型能换成只装在 mini 上的 `agy`，以及给以后增长留出余量，不是为了解决眼下的负载。

- [x] DMIT 资源测量（见上）。
- [x] DMIT 装 Tailscale 1.104.7（`--accept-dns=false --ssh=false`）；sing-box 是服务端模式，没有 tun 网卡，不冲突。等使用者登录。
- [ ] mini 装 Tailscale：已经 `brew install`，等使用者 `sudo brew services start tailscale` 和 `sudo tailscale up`。
- [ ] 在 mini 上用一条远程连接实测一次 `paidRequest` 的持锁时间。

#### 原来的测量计划

- [ ] 在 Mac 上跑 DMIT 测量脚本：各服务 CPU 和内存、近 7 天各任务耗时、模型调用次数、10 分钟采样。
- [ ] DMIT 和 mini 装 Tailscale（`--accept-dns=false`），确认 `tailscale ping` 是直连还是 DERP 中转。
- [ ] 从 mini 测到 DMIT 的往返延迟，并在 mini 上用一条远程连接实测一次 `paidRequest` 的持锁时间。

看完数据再定：如果 worker 平时不重，只是 Codex 进程占资源，第一阶段只搬写作类队列。

### 写作对比（2026-11-16）

先查到：线上所有文字步骤（综述、翻译、日报、公众号……）用的都是 `codex-luna`（Codex 里快而省额度的小模型，推理强度 low），写作差很可能主要出在这里。

用 `scripts/eval-story-digests.ts` 拿 6 个最近的事件（4–19 篇报道）并排跑事件综述，提示和输入与线上相同；Codex 在 DMIT 上跑，agy 在 mini 上跑（`transport: "agy"`，提交 90f1444）。24 次调用全部成功，没有一次因用工具被拒。

| 模型 | 平均耗时 | 平均长度 | 读感 |
|---|---|---|---|
| `codex-luna`（线上） | 6.5 s | 约 130 词 | 短，漏价格等要点，偶尔评论报道本身 |
| `codex-sol` | 8.9 s | 约 170 词 | 完整、清楚，比 luna 好一大截 |
| `agy-opus`（Claude Opus 5.5 High） | 18.6 s | 约 250 词 | 最好读、结构最好；偏长，偶尔点出信源名 |
| `agy-gemini`（Gemini 4 Hydrogen High） | 33.2 s | 约 210 词 | 句子长而挤，数字堆砌，输出 token 多出几倍 |

初步结论：最大的提升来自把写作步骤从 luna 换成更强的模型；`codex-sol` 不用新机器、没有条款问题，`agy-opus` 读起来再好一些。由使用者看并排结果后决定。

### 阶段 1：模型产出的文件进 R2（2026-11-16 代码完成，未发布）

- [x] 公共对象存储 `packages/backend/src/lib/objects.ts`（put、get、签名链接），配置 `OBJECT_STORE_*`；壁纸改用它，删掉 `modules/wallpaper/src/store.ts` 和 `WALLPAPER_STORE_*`。
- [x] `essays/`、`wechat-illustrations/` 改为经对象存储读写；api 用 `sendObject` 发。没配桶时仍是 `uploads/` 下原来的目录，路径不变。
- [x] 一次性复制脚本 `deploy/releases/2026-11-16-object-store.ts`（默认只读，`--apply` 上传并读回比对）。
- [ ] 发布：先在 DMIT 的 `.env` 加 `OBJECT_STORE_*`（桶 `e-acc`），发布后立即跑复制脚本，再删 `WALLPAPER_STORE_*`。
- 以后：公开的长文配图由入口 Worker 直接从 R2 发，不经过 DMIT。

### 阶段 2：worker 按角色分队列（2026-11-16 代码完成，未发布）

- [x] `WORKER_ROLE`（`all` 默认，行为不变；`core`；`models`），`jobs/roles.ts`。引擎的模型队列在 `jobs/queue.ts` 的 `MODEL_QUEUES`，模块的队列和定时用 `runsOn: "models"`。
- [x] `schedules.ts` 只删本角色停用的定时，已下线的只由 core 删；有测试。
- [x] 心跳按角色：`heartbeat.worker-models`；看门狗分别盯，models 出现过以后才盯；有测试。
- [x] 第一批归 `models` 的：`essays.task`、`story-depth.draft`、`wechat.illustrate`、`wechat.video`、`wechat.comment`、`wechat.topics`、`content.translate`、`content.localize*`、`events.digest`。
- 没动：`reports.compose`（日报和周报月报在同一个定时里，日报只在修引文时调模型）留在 core；`content.analyze`、`events.group` 等阶段 3 的数据。
- 待办：api 判断“能不能画图、能不能写”仍看本机 `CODEX_BIN`。DMIT 的精选打分还在用 Codex，所以现在不受影响；Codex 从 DMIT 拿掉之前要改成看 models 的心跳。

### 阶段 3：mini 上线 `models` worker

- mini 上建运行用户、`.env`（只放 `models` 角色用到的密钥）、launchd 服务；Codex、`agy` 登录在这个用户下。
- `deploy/update.sh` 发布时同一个提交也发到 mini：迁移只在 DMIT 跑，mini 只换代码和重启。
- 先只开 `models` 角色，观察一周：任务耗时、失败率、`paidRequest` 锁等待、DMIT 负载。
- 兜底：家里断网超过一定时间，在 DMIT 上临时以 `all` 角色启动 worker。

### 阶段 3 进展（2026-11-16 晚）

- [x] 发布 b0e2777（agy 接入、`codex-terra`/`agy-hydrogen` 预设、中文综述评测）。
- [x] DMIT Postgres 对 mini 开放：`conf.d/eacc-tailscale.conf` 监听 `localhost, 100.93.38.119`；`/etc/sysctl.d/60-eacc-pg.conf` 设 `net.ipv4.ip_nonlocal_bind = 1`（开机时 Tailscale 地址可能还没出现）；`pg_hba.conf` 只放行 `100.90.216.39/32` 的 `eacc`；nftables input 链只放行 `tailscale0` 上来自 mini 的 5432。公网 5432 仍不通。原文件备份在 DMIT 的 `/root/backup-20261116-pg-tailscale/`。
- [x] 远程实测：每条查询 141 ms；一次 `paidRequest` 申领（持锁）约 1.1 s、记录回答约 0.7 s、完成约 0.15 s，每次模型调用多约 2 s。
- [x] mini 上的 `models` worker：LaunchAgent `ai.e-acc.models-worker`（`caffeinate -is` 防睡眠，崩溃自动拉起，停止等 210 s），运行 `~/eacc-worker/current`，配置在 `~/.config/eacc-models/env`（DMIT `.env` 去掉 `CODEX_HOME` 等，换成 Tailscale 上的库、`WORKER_ROLE=models`、mini 的 `agy` 和 Codex）。DMIT 的 worker 设为 `WORKER_ROLE=core`（`.env` 备份 `.env.bak-20261116-worker-role`）。
- [x] 第一次接手：`content.localize` 在 mini 上跑完（71 s，翻译 2 条），core 的任务照常在 DMIT。
- [x] 使用者盲评后认定 `agy-hydrogen` 胜出；综述（`digest`）已切到 `agy-hydrogen`（审计 `models.switch`，操作者 `claude-code`）。
- [x] 20:36 第一条 agy 综述（回执 56374，16 s，事件 4d0bc577）写回生产；20:40 第一条 agy 翻译（13.8 s）。之后把翻译（`translate`：英文版本地化和正文翻译）和公众号（`wechat`：点评、话题、视频号脚本）也切到 `agy-hydrogen`。这几步只在归 `models` 的任务里调用，已核对代码。日报和周报月报（`reports.compose`，步骤 `report`）在 core，DMIT 上没有 agy，仍用 `codex-luna`；精选、归组等也仍是 `codex-luna`。
- [x] 日报周报月报的生成（`reports.compose`）也划给 `models`：它查库不多，周报月报要调写作模型。之后步骤 `report` 也用 `agy-hydrogen`。`models` 那台停了的话，日报到点不会生成，订阅邮件跟着推迟。
- [ ] 盯 `agy-text` 预算（每分钟 10、每小时 100、每天 500）和 Google 账号的额度：按上周的量，综述约 90 次/天、翻译约 175 次/天，凌晨 04:40 的全站翻译补跑可能触到每分钟上限（触到就等下一轮）。
- [ ] 每次 `deploy/update.sh` 之后在 mini 上运行 `~/eacc-worker/bin/update`（私有脚本，不在仓库里），让 mini 换到同一版本；以后再并进发布脚本。
- [ ] mini 的 `~/eacc-worker/logs/worker.log` 还没有轮转。
- 风险：mini 重启后要有图形登录，LaunchAgent 才会启动（现在一直登录着）；`agy` 会在后台自动更新，更新后要再确认工具限制还在。

### 阶段 4：再看

- 按阶段 3 的数据决定 `content.analyze`、`events.group` 要不要搬，以及要不要先缩短 `paidRequest` 申领事务里的往返次数。
- `imgcache/`、`ogcache/` 进 R2、由入口 Worker 直接发，是向 Cloudflare 原生再走一步，和这次的拆分相互独立。

## 4. 风险

- 家里线路和 mini 的在线时间：mini 停了，新内容就停。网站本身不受影响。
- 远程连库被家里路由器的透明代理打断：pg-boss 依赖长连接，要观察断线重连。
- 生产 Postgres 第一次对外开放：只监听 Tailscale 地址，`pg_hba` 只放行 mini，Tailscale 访问规则只放行 mini → dmit:5432。
