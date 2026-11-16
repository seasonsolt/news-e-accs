# 部署

## 用 Docker（推荐）

需要一台装了 Docker（带 Compose）的机器。云服务器建议至少 2 核、4 GB 内存，构建镜像时要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
```

`init-env.ts` 会生成 `.env`，填好随机密钥和管理员密码，并把密码打印一次。机器上没有 Node 的话，把 `.env.example` 复制成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

启动前检查 `.env` 的 `SITE_URL`：本机试用保留 `http://localhost:3000`；部署到服务器时改成读者实际访问的地址。例如通过服务器 IP 访问时（把示例 IP 换成自己的）：

```dotenv
SITE_URL=http://192.0.2.10:3000
```

RSS、分享链接、站点地图和 Agent Markdown 中的绝对链接都使用这个值，不会随浏览器访问的地址自动改变。使用域名和 HTTPS 时按下方「配域名和 HTTPS」设置。

配置完成后启动：

```bash
docker compose up -d --build
```

启动后打开 `http://服务器地址:3000`，后台在 `/admin`，用管理员密码登录。第一次启动会导入示范信源，一两分钟后开始出现内容；第一次导入的一百多条资料大约半小时处理完（每条都要预筛、评分、结构化、写标题摘要，再归组）。

`docker compose` 会起五个容器：`db`（PostgreSQL 17）、`setup`（每次启动先跑数据库迁移和种子数据，然后退出）、`api`、`worker`（抓取、模型处理、定时任务）、`web`（网页）。`web` 只接收网站地址、API 地址等网页配置，通过 HTTP 读取 API；数据库、模型和管理员密钥，以及数据卷，只交给后端容器。

### 在中国大陆的服务器上

- 构建时 npm 走国内镜像：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然后 `docker compose up -d`。
- 拉取 Docker 镜像慢，先给 Docker 配置镜像加速。
- 海外信源抓不到时，在 `.env` 里设置 `EGRESS_PROXY_URL`：抓信源和图片时走这个代理，调用模型接口不走。
- 对外提供网站服务需要先完成 ICP 备案，备案号填在 `site/site.ts` 的 `icp`。

### 配域名和 HTTPS

先把域名解析到服务器，然后在 `.env` 里设置：

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # 3000 端口只给本机的 Caddy 用，不直接对外
TRUST_PROXY=true           # 访客地址从 Caddy 转来的请求头里读
```

再用带 HTTPS 的方式启动，Caddy 会自动申请和续期证书：

```bash
docker compose --profile https up -d --build
```

已经有 Nginx 的话，不用 Caddy，把站点反向代理到 `http://127.0.0.1:3000`，带上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` 和 `proxy_set_header X-Forwarded-Proto $scheme;`（后台登录按它判断访问是不是 HTTPS，少了它登录 cookie 会丢掉 Secure），并在 `.env` 里设 `TRUST_PROXY=true`。`SITE_URL` 一定要写成读者实际访问的地址：生成的链接、RSS、分享图和 MCP 都用它。

MCP 默认接受 `SITE_URL` 的主机以及 `localhost`、`127.0.0.1`、`[::1]`。额外主机用 `MCP_ALLOWED_HOSTS` 配置，以逗号分隔，例如 `extra.example:8443,[2001:db8::1]`。主机名不区分大小写，IPv6 必须加方括号；可带 0–65535 的十进制端口，匹配时忽略端口。包含路径、用户信息或非法端口的配置不会生效。`127.1` 等别名需要明确列入；此配置只影响 Host 校验，不扩大浏览器 Origin 许可。

前面有 Nginx、CDN 这类缓存时，要遵循应用返回的缓存期限（`Cache-Control`）：公开网页、导航数据、API、RSS、条目 Markdown、报告分享图、站点地图，以及接入说明 `/api/v1/agent` 和 `/openapi-v1.json`（五分钟到期后也要重新验证），都不要另加更长的缓存期，不要在到期后离线返回旧内容，也不要在转发旧响应时重新起算它的寿命；不要让代理和 CDN 叠加缓存动态内容。框架不代管自建站的 CDN，也不替它清缓存。

### 更新

### 文字步骤可以用 agy 模型（2026 年 11 月 16 日）

没有迁移。`site/models.ts` 的模型预设多了一种 `transport: "agy"`：worker 调用所在机器上登录了 Google 账号的 Antigravity CLI（`agy`）来回答，用账号的额度，不需要 API 密钥（见下方 [文字步骤用 agy 模型](#文字步骤用-agy-模型)）。示例站加了 `agy-opus`（Claude Opus 5.5 High）和 `agy-hydrogen`（Gemini 4 Hydrogen Low）两个预设，默认哪一步都不用。种子数据会给后台预算加一行 `agy-text`（每分钟 10、每小时 100、每天 500 次），已有的不覆盖。启动 Codex CLI 的代码移到了 `providers/cli.ts`，两种 CLI 共用，Codex 的行为不变。

### worker 可以分到两台机器（2026 年 11 月 16 日）

没有数据库迁移。新的可选环境变量 `WORKER_ROLE`（`all`、`core`、`models`，默认 `all`）：不设时一个 worker 照旧做全部的活，行为不变。

想把耗资源的模型活挪到另一台机器时，那台机器跑一个 `WORKER_ROLE=models` 的 worker，原来的改成 `WORKER_ROLE=core`。两台连同一个数据库，都要配对象存储 `OBJECT_STORE_*`（配图要在两台之间共用），并且运行同一个版本。`models` 负责数据库用得不多的模型活：英文版翻译（`content.translate`、`content.localize`、`content.localize-sweep`）、公众号点评和话题（`wechat.comment`、`wechat.topics`）、事件简报（`events.digest`）、公众号配图和视频号脚本（`wechat.illustrate`、`wechat.video`）、长文（`essays.task`）、事件深度稿（`story-depth.draft`）和日报周报月报的生成（`reports.compose`）；精选、归组、采集、订阅邮件和运维都留在 `core`。`models` 那台停了的话，日报到点不会生成，订阅邮件也就等它恢复后再发。模块的队列和定时用 `runsOn: "models"` 声明归属，不写的算 `core`。

- 每个 worker 只删自己角色里停用的定时；已经下线的定时由 `core`（或 `all`）删。两台的 `.env` 里控制定时的开关（如 `CONTENT_TRANSLATION_ENABLED`）按各自负责的活来配。
- `models` worker 写自己的心跳 `heartbeat.worker-models`，后台“运行”页单独显示一行；api 的看门狗在它出现过以后单独盯，停了半小时会告警“模型处理服务停了”。以后不再分开跑时，在 `settings` 里删掉 `heartbeat.worker-models` 和 `watchdog.worker-models` 两行，否则会一直告警。
- `models` 那台停了，网站和精选照常，翻译、点评、配图等排着队等它恢复；也可以临时把 `core` 改回 `all` 顶上。

### 配图和壁纸原图放进对象存储（2026 年 11 月 16 日）

没有数据库迁移。长文配图、公众号配图和壁纸 4K 原图改由一个公共的对象存储读写（`packages/backend/src/lib/objects.ts`），这样 api 和 worker 不必共用一块磁盘。环境变量 `WALLPAPER_STORE_*` 改名为 `OBJECT_STORE_*`（见 `.env.example`），桶里按前缀分开：`essays/`、`wechat-illustrations/`、`wallpapers/`。

- **没配过 `WALLPAPER_STORE_*` 的站**：什么都不用做。不配 `OBJECT_STORE_*` 时文件仍在 `dataDir/uploads/` 下原来的目录里，路径不变，照旧在 uploads 备份里。
- **配过 `WALLPAPER_STORE_*` 的站**：升级前把四项改名为 `OBJECT_STORE_*`。原来 `WALLPAPER_STORE_BUCKET` 填的是“桶名/前缀”（例如 `e-acc/wallpapers`）的，`OBJECT_STORE_BUCKET` 只填桶名（`e-acc`），壁纸原图仍在 `wallpapers/` 下，不用搬；原来只填桶名的，桶里已有的原图要挪到 `wallpapers/` 前缀下。不改名的话，升级后壁纸下载找不到原图。
- **启用对象存储后**，本机 `uploads/essays/` 和 `uploads/wechat-illustrations/` 里已有的图要复制进桶：升级后立即在后端环境运行 `node --env-file=.env deploy/releases/2026-11-16-object-store.ts` 预览，再加 `--apply` 上传并逐个读回比对（只读本机文件、只写桶，重复运行无害）。复制完成前，已发布长文的配图和公众号配图会 404。本机文件不删，确认无误后可以自己删。
- 桶里的文件不在本机的 uploads 备份里，由存储桶保存。回滚到旧版本时，启用对象存储后新存的配图在本机没有，旧版本读不到。

### 每日请求预算排除明确未计费的失败

每日预算和后台“近 24 小时预算”不再计入供应商明确拒绝、未计费的失败；分钟、小时仍按全部尝试限速。已返回但不可用的答案、处理中和结果未知的请求继续占预算。自动或人工放行未知回执不代表未计费，旧尝试仍计入；只有人工确认未计费才释放。无需数据库迁移，不删除回执。

旧版把已放行的未知尝试也记成失败。先备份 `receipt_attempts`，再在后端环境运行 `node --env-file=.env scripts/repair-released-receipt-attempts.ts` 只读预览；确认后加 `--apply`，每批最多修正 200 行，逐批重复直到为 0。脚本只把带旧放行标记、未确认免费且有对应放行审计的失败尝试恢复为 `unknown`，保留错误、用量和回执记录。回滚代码不需撤销修正，旧版预算本来就统计全部尝试。

### 加速史场景模块

`/chronicle` 首屏改为聚焦布局：桌面端只放插画、三个读数和时间轴，全部读数、此刻附近和时代画卷收进侧栏；手机端照旧依次排列。桌面端的插画由纵深隧道绘制（按需加载 three.js），停在有场景的里程碑上可以「走进工坊」。新模块 `modules/scenes` 的贴图不在 git 里，也不随程序发布：先按 `modules/scenes/README.md` 构建，再放到读者能访问的 `/media/scenes/` 下（我们用 R2 和入口 Worker，见 `deploy/README.md`；自己部署可以把 `apps/web/public/media/scenes/` 的构建结果放进镜像或交给 CDN）。没有贴图时场景页显示载入失败，加速史页面不受影响。不需要迁移。

### 模型价格改用 OpenRouter

模型榜的价格不再读各家官方价格页，改为每次刷新（`leaderboard.round`，需要 `COLLECT_ENABLED=true`）取 OpenRouter 公开模型列表的价格，不调用模型；OpenRouter 上没有的模型保留原价格。迁移 0139 删除 `lb_price_checks`（2026-10-19 起每日核对的读数记录，删除后不可恢复），0140 删除 `lb_prices.since`（价格生效日），0141 删除 `lb_prices.unlisted_on`。定时任务 `leaderboard.prices` 和模型步骤 `priceCheck`（`PRICE_CHECK_MODEL`）随之移除，worker 启动时自动清掉旧的定时任务。第一次刷新会把 OpenRouter 列出的模型（包括原来以人民币标价的）换成它的美元价。智能成本指数不再读 `lb_prices`，当前价改读模型榜的官方价种子文件；种子文件之后才有官方价的模型，要在 `modules/indices/seeds/price-history.json` 加一条才会计入。

### 每日 4K 壁纸模块

迁移 0130–0135 新增 `wallpapers`、`wallpaper_keys`、`wallpaper_downloads`，并先添加、验证订阅来源约束 v2 后删除旧约束，允许 `wallpaper` 来源；不会删除已有订阅数据。配置了对象存储 `OBJECT_STORE_*`（2026-11-16 前叫 `WALLPAPER_STORE_*`，见 `.env.example`）时，桌面和手机原图上传到那个私有存储桶的 `wallpapers/` 下，下载在验 key、扣积分后 302 跳转到 5 分钟有效的签名链接，原图流量不经过服务器；这些原图不在本机 uploads 备份里，由存储桶保存。没配置时原图和预览都在 `dataDir/uploads/wallpapers/`，已在 uploads 备份范围内。预览始终在本机，响应带 `s-maxage`，由入口 Worker 缓存。配置存储桶前已经上传到本机的原图不会自动搬走，需要重新上传那几天。

凭 key 的响应返回 `private, no-store`，前面的代理或 CDN 不要缓存它们。发布后在 `/admin/wallpapers` 上传第一张生产壁纸的桌面、手机和预览文件；服务器不调用模型或放大图片。回滚旧程序不会删除这三张表或上传文件。

**本站 2026-11-03 合并补充**：本次新增 `0090_source_selection_class.sql`、`0091_feedback_kind.sql`、`0092_feedback_idea.sql`、`0105_source_uses.sql` 及两个公众号文章查询索引。`selection_class` 默认 NULL，不自动分配类别；`uses` 默认空数组，原新闻流程保持不变。`0121_articles_wechat_post_idx.sql` 与本站 `0121_wechat_topics.sql`、`0122_articles_wechat_short_url_idx.sql` 与本站 `0122_site_events_daily.sql` 按完整文件名分别执行，均不删除数据。本站 `browseFloor: 0`，暂不开启全部动态的分数过滤，开启需使用者决定门槛。新增告警 webhook 和自动处理服务配置均留空。

**2026 年 10 月 31 日的引擎同步**有三个数据库迁移（`0090`–`0092`），照下面的命令更新时 setup 会跑它们：信源多一列可选的类别 `selection_class`，反馈多了 `kind`（类型）和 `idea`（归入的建议）两列，都可以为空，旧数据不用改。没有必填的新环境变量。要注意的变化：

- **`industry/selection.ts` 多了 `classes` 和 `browseFloor`**，见 [精选与校准](selection.md#门槛industryselectionts)；自己改过这个文件的，合并时补上这两项，不补通不过类型检查。
  - `classes`：信源类别和它的门槛下限。后台“信源”页可以给官方信源选一个类别，门槛抬到不低于类别的数，只抬不降；不选类别的信源和原来一样。
  - `browseFloor`（上游默认 40；本站为 0，暂不开启，开启需使用者决定门槛）：浏览“全部动态”（网页列表，`/api/v1/items` 和 `/api/v1/agent/latest` 的 `mode=all`，MCP 最新列表的 `all`，“全部动态”RSS）只出平均分不低于它的资料，没评上分的照常出；带搜索词时仍搜全部。想和原来一样全部列出，设成 `0`。
- **告警**：
  - 新增“大量信源抓取失败”：开着采集时，最近一次抓取失败的信源不少于 50 个、且占最近抓取过的信源 15% 以上，按“读者受影响”一级告警，多半是服务器连外网的线路或代理断了。
  - 选填的 `WEBHOOK_HUB_URL`、`WEBHOOK_HUB_KEY`（协议见 `.env.example`）：配好后（还要 `FEISHU_INTERNAL_ENABLED=true`），“读者受影响”和“今天要处理”两级的告警先交给你自己的自动处理服务，交出去 1 小时（读者受影响）或 3 小时（今天要处理）后还没恢复，或者同一个问题一天里第三次交出去，才发给你；只有你能处理的（比如模型服务拒绝调用、要核对账号或额度）照常立刻发。09:00 的系统日报被它收下就不再发给你。发给你本人的消息也先交给它的 `/tell`，没收下再走飞书。超过 30 分钟送不出去，会告警“自动处理暂时接不到任务”，这期间告警直接发给你。不配置就和原来一样。以前代码里读过、没写进文档的 `AGENT_WEBHOOK_URL`、`AGENT_WEBHOOK_KEY` 不再读取，请求格式也换了，用过的照 `.env.example` 改。
  - 告警群机器人（`FEISHU_ALERT_WEBHOOK_URL`）一次只发一条，等上一条有答复或失败后再隔 600 毫秒发下一条，不会超过飞书自定义机器人的频率限制。
- **模型服务拒绝调用后的暂停**：拒绝之前已经发出的请求后来成功了，不再解除暂停（它可能用掉了最后的额度），只有拒绝之后发出的请求成功才解除。拒绝时也不再顺手删掉其他模型一天前已经过期的暂停记录：两个模型同时被拒会互相等对方的行锁，死锁后丢掉那次拒绝；过期的暂停本就不再生效，留在 `settings` 里，等那个模型下一次调用成功时删掉。
- **图片**：网页上的图片先给 AVIF（`<picture>`，不支持的浏览器照旧用原来的格式）。AVIF 版本由 worker 在后台按需生成，比原来的格式小一成以上才保留，生成好之前先返回原来的格式；图片缓存会多占一些空间。源站拒绝或已删除（401、403、404、410）的图片，失败结果缓存 6 小时，不再每分钟回源。
- **备份**：每个文件只上传一次，放在一个前缀下（见下方 [备份](#备份)）；原来每天都传一份到 `daily/`、周日和每月 1 日再各多传一份。按前缀设过过期规则的，核对一下。没有附件时只传 `.dump`，不再生成空的文件包。
- **反馈后台**：反馈可以标类型（BUG、建议、提问、其他）；建议可以归入一个建议名，同一个需求用同一个名字，“建议池”按提出人数排序。

新增选填的 `PRIVATE_FEED_HOSTS`：信源订阅或列表地址用自建在内网的服务（比如 RSSHub）时，把它的主机名写进去，不必再打开整站的 `ALLOW_PRIVATE_NETWORK_FETCH`，用法见 [信源](sources.md)。不设置时行为不变；无需数据库迁移。

周报、月报的周期内，应有日报齐全且原始正文条目全部为空时，自动跳过该期，避免每半小时重复报错；归档里不会新增空周报或月报。首个周期从全站最早日报开始检查；没有可汇总条目时，若缺失日报、原有条目后来无法公开或正在人工更正，仍保留原有错误。无需数据库迁移或配置修改，升级后下次定时检查生效。

正文原生视频修复会为已有可用视频补播放控件，并去掉空播放器，不写回文章、不调用模型。旧版清洗时已经丢弃的媒体地址无法从存档恢复；升级不批量重新抽取，已有成功正文会跳过抽取，内容哈希相同时重新抽取也可能保留原 HTML。后续新正文按[信源说明](sources.md)保留原生视频，文件继续由浏览器直连原站，签名地址可能过期。

正文插图里的内嵌 SVG 图改为保留原站写的文字说明（见[信源说明](sources.md)），只作用于之后抽取的正文；已存的正文不变，升级不批量重新抽取。

先按下方 [备份](#备份) 一节备份。构建完成后停止旧服务，再运行迁移和新版服务：

```bash
git pull
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

### 文字步骤用 agy 模型

在 worker 所在的机器上装好 Antigravity CLI，用运行 worker 的系统用户交互运行一次 `agy` 登录 Google 账号，然后在 `.env` 里设 `AGY_BIN=<agy 的绝对路径>`，重启 worker。`site/models.ts` 里 `transport: "agy"` 的预设就能在后台“模型与评测”页选给文字步骤；`model` 写 `agy models` 列出的名字，名字里带着推理强度（例如 `claude-opus-5-5-high`）。还要 `MODEL_CALLS_ENABLED=true`。

- 这不是 API 网关：每次调用跑一次官方的 `agy`，提示从标准输入传入，在空的临时目录里运行，不留下可续接的对话。但 Google 的常见问题写着，把 `agy` 包进别的应用“在个人订阅下不受支持”，这种用法有没有问题由你自己判断，风险在你的 Google 账号上。
- 文件、网页、命令和 MCP 操作全部拒绝（只对这一次运行生效的设置，不写进 `agy` 的配置文件）。`agy` 的网页搜索不受权限规则管，所以用过任何工具的回答一律当作失败，这一步等下一轮再试。读的是不可信的文章原文，有文件或命令工具时就能读到这台机器上的文件（包括 `.env`）。
- 每次另带约一万 token 的 `agy` 自身提示，一次十秒左右，比接口慢。`agy` 会在后台自动更新，更新后要留意上面这些限制还在不在。
- 每次都记回执，受后台预算里预设的 `service` 那一行限制（示例是 `agy-text`），填 0 就停。

### 文字步骤用 Codex 模型

配好上一节的 `CODEX_BIN`（`codex login` 用 ChatGPT 账号登录）以后，`site/models.ts` 里 `transport: "codex"` 的预设就能在后台“模型与评测”页选给任意文字步骤。这是 OpenAI 认可的用法：官方客户端、本人账号、本人额度；不要把订阅换成 API 网关（sub2api、CLIProxyAPI 这类）给别的程序用，那会被 OpenAI 的风控标记。

- 每次调用跑一次 `codex exec`：提示从标准输入传入，在空的临时目录里只读运行，不留会话；Shell、代码执行、浏览器、多 Agent 等工具全部关掉，工具调用直接失败。读的是不可信的文章原文，有 Shell 时即使只读沙箱也能读到这台机器上的文件（包括 `.env`）。
- 每次另带约一万多 token 的 Codex 自身提示（大部分命中缓存），比直接调接口多耗额度；一次几秒，比接口慢。
- 每次都记回执，受后台预算里预设的 `service` 那一行限制（示例是 `codex-text`），填 0 就停。额度用完时 Codex 报错，回执记为失败，这一步等下一轮再试；需要时在“模型与评测”页把这一步切回 API 模型。
- 不看图：需要看图的步骤不能选它。

迁移成功后再启动服务；迁移失败时先查看错误，不要继续启动。使用 HTTPS 配置的站点继续保留 `--profile https`。旧的 API 和 worker 要在迁移前停下：迁移可能删表删列，旧代码还在跑会出错；正常关闭 worker 会等进行中的付费调用收尾（最长三分多钟）。非 Docker 部署也按“备份、构建、停止 API/worker/web、迁移（`scripts/migrate.ts`）、种子数据（`scripts/seed.ts`）、启动”的顺序更新。

新迁移遇到长期占锁会报出文件名和等待超时，先处理占锁事务，再重跑 setup，不要跳过迁移或改写迁移账本。并发索引创建中断可能留下无效索引：核实报错中的对象后，用 `DROP INDEX CONCURRENTLY <索引名>` 清理该失败索引再重跑；有效但定义不同的同名索引须先核对差异。这些保护不改变上述 Docker 更新顺序，跨旧版本升级仍可能执行历史上的破坏性迁移。

下面按时间从新到旧列出每次更新要注意的事。

#### 百度主动推送（2026 年 11 月 8 日）

没有迁移。新增两个可选的环境变量 `BAIDU_PUSH_ENABLED` 和 `BAIDU_PUSH_TOKEN`：站点在百度搜索资源平台验证后，把「普通收录 · API提交」推送地址末尾的 token 填进 `BAIDU_PUSH_TOKEN`，开关设成 `true`，worker 每小时把新出现的页面推给百度。第一次只记下已有页面、不推送（它们靠站点地图），之后每个地址只推一次，不超过百度当天给的配额；连续失败一天会出现在每天的跟进清单里。不用就不填，什么都不会发出去。

#### 站长平台的网站验证（2026 年 11 月 8 日）

没有迁移，没有新的环境变量。`site/site.ts` 新增 `SITE.siteVerification`：百度、必应、360、搜狗、神马、头条等站长平台给的 HTML 标签验证码按“meta 名 → 验证码”填进去，就会出现在首页的 head 里；验证通过后也要留着。自己维护 `site/site.ts` 的站，合并时加上这一行，用不到就写 `siteVerification: {}`；不加的话构建会报找不到 `siteVerification`。

#### 页脚的“由 AIHOT 驱动”（2026 年 11 月 8 日）

没有迁移，没有新的环境变量。`site/site.ts` 新增 `SITE.poweredBy`：填了就在侧栏底部和“我的”页底部显示“由 X 驱动”并链到它的网址，模板默认链回 AIHOT。自己维护 `site/site.ts` 的站，合并时把这一行加上；不想显示就写 `poweredBy: null`。不加这一行构建会报找不到 `poweredBy`。

#### 搜索结果里的标题（2026 年 11 月 8 日）

没有迁移，没有新的环境变量。`site/site.ts` 新增必填的 `SEO_TITLES`：热点榜、全部动态、Agent 接入页、关于页、日报周报月报的最新一期和主题页在搜索结果里的标题，读者会搜的词在前，页面自动在最后接上“ · 站名”；首页仍用 `SITE.homeTitle`。自己维护 `site/site.ts` 的站，合并时把模板里的这一段复制过去，再换成你行业的说法；不加的话构建会报找不到 `SEO_TITLES`。

#### 钉钉内容推送（2026 年 11 月 6 日）

新增一个可选的推送渠道：精选卡片可以推到钉钉群（自定义机器人，markdown 消息，支持加签）。没有迁移必做事项，`setup` 启动时自动执行；已有的飞书推送部署升级后行为不变。要用的话在 `.env` 里设 `DINGTALK_CONTENT_PUSH_ENABLED=true` 和 `DINGTALK_PUSH_WEBHOOK_URL`（机器人开了加签再设 `DINGTALK_PUSH_SECRET`），然后到后台“设置 → 通知目的地”启用“钉钉内容群”，与飞书内容推送互相独立、可同时开。详见 `.env.example` 里的说明。

#### 条目页不再因为精选自动收录（2026 年 11 月 1 日）

条目详情页（`/items/<id>`）一律 noindex，精选的也一样，只有编辑在后台条目页“标记为可收录”的才收录、进站点地图。原因是成千上万篇转述别家报道的条目会拖低搜索引擎对整站的判断；事件页、日报、概念页和模型榜照旧收录。没有迁移。新规则在条目下次重新发布时生效，已经因为精选而可收录的条目要在发布后执行一次下面这条语句（只改没有人工标记的条目，不碰后台的人工决定）：

```sql
UPDATE publications SET indexable = false WHERE indexable AND seo_indexed_at IS NULL;
```

执行后站点地图在 5 分钟内去掉这些条目，Search Console 周读数里条目页的收录数会在几周内随 Google 重新抓取下降。

#### 读者会话与增长看板（2026 年 10 月 28 日）

发布会执行 `0138_site_salts.sql` 到 `0142_site_sessions_last_at_idx.sql`，新增三张表和两个并发索引，不改动已有数据；无需新环境变量。后台“周读数”和“访问统计”合并成“增长”（`/admin/metrics`），旧的 `/admin/analytics` 跳转到它的“出口”页。会话数据从发布那天开始，之前的日子不回填；按天的页面浏览和操作次数照旧累计。站长打开过后台的浏览器从此不计入读者，按天的页面浏览也一样，所以和发布前比会略少。隐私说明第 1、4 节已按新的采集改写，上线前请核对。国家/地区由入口 Worker 传给源站（`x-eacc-country`），自建站没有这层时这一列为空。口径见 [读者统计](analytics.md)。

#### MCP 使用统计（2026 年 10 月 18 日）

发布会执行 `0129_mcp_usage_daily.sql`，新增匿名按天聚合表；无需新环境变量。后台“访问统计”新增 MCP 工具调用、成功率、趋势、工具排行和错误分类。上线前没有的数据不回填；初始化不等于工具使用，自带检查流量单独排除。每日清理保留近 90 天的这张新表。指标定义与隐私边界见 [架构](architecture.md#mcp-使用统计)。

#### 订阅来源与首次确认口径（2026 年 10 月 18 日）

迁移 0126–0128 给 `newsletter_subscribers` 加可空的 `signup_source` 和取值约束，升级时自动执行，无需人工操作，不改动已有数据；旧记录为 NULL，后台显示为“未知”。

- 订阅表单把入口（首页、订阅页、日报、单条、事件页、概念页等）随请求提交，同一邮箱只记第一次的入口，重订不覆盖。
- 后台每周“首次确认”只按 `confirmed_at` 计，不再要求当前仍是已确认状态；另按入口分组显示。有效订阅存量口径不变。
- 确认接口返回是否首次确认、语言和入口；客户端只在首次确认时上报 `subscribe_confirmed`，重开确认链接不再重复计。
- 后台互动和订阅漏斗标出每个事件在日汇总里最早有数据的日期，更早的日期显示“未采集”，不再显示为 0。
- `share_click` 从本次发布起只计分享或复制完成，之前的数字包含取消，跨这次发布比较时注意口径变化。
- 事件页加内嵌订阅；概念页的订阅按钮带入口，并链接最近一期日报；确认成功页展示所选语言的最近一期日报。
- `robots.txt` 额外允许智能成本指数的 CSV（Dataset 的下载地址），其余 `/api/site/` 仍禁止；Agent 页列出指数的 MCP 工具和接口。

#### 媒体重计算逐步移到 worker（2026 年 10 月 18 日）

没有数据库迁移或新增必填环境变量。API 和 worker 必须运行同一版本，并共享同一个 `AIHOT_DATA_DIR`（Docker 已共享 data 卷）；单独启动 API 只能读取已准备的媒体缓存，冷图片、分享图、手机海报和公众号封面需要 worker。本站通过 `deploy/update.sh` 一起更新，通用本机验证也要同时启动 `npm run dev:api`、`npm run dev:worker` 和网页。

- 公开图片的下载/解码/转码，以及分享图、手机海报和后台公众号封面的渲染均在 worker 完成。热缓存直接读取；冷请求提交 `media.image` / `media.render`，轮询任务结果最多 30 秒，队满或未等到结果时返回 `503`、`Retry-After: 5`、`Cache-Control: no-store`，不会退回 API 计算。签名、公开范围、语言指纹及撤回仍在 API 读取层检查，通过后才提交任务。
- `media.image` 与 `media.render` 在整个数据库中合计最多接纳 12 个未完成任务，同内容的 created/active 任务合并；入队事务串行检查数量，避免多个 API 进程一起突破上限。worker 的四个图片消费者与两个成图消费者各自每半秒检查任务，网络等待不占用成图消费者；每个 worker 进程的解码/渲染仍共用两个重处理名额，已经过期、尚未开始的请求跳过计算。待处理总量有上限；慢源站仍受下面的下载与像素预算约束。队列只携带 URL/模式或成图文案，不传原图、PNG、字体或凭据。
- 原有缓存路径、模板版本和内容指纹保留。成图文案以原 JSON 文本过队列，避免 PostgreSQL JSONB 重排字段改变缓存键。旧 GIF 首次由 worker 补一份 `.animation` 元数据，跨文件替换时类型不匹配的旧缓存也由 worker 修复 MIME，API 据此读取动画状态，不加载图像库；侧文件随原有 30 天缓存清理一起删除。
- 图像库按需加载，API 启动及上述媒体读取请求（包括后台封面）不加载 sharp/libvips、satori 或字体缓存。资源日志新增 `media.requests.pending`，原图缓存和解码队列的增长应集中看 worker；本批保留反馈截图、后台上传校验及信源试抓的同步处理，这些低频写操作后续单独迁移，不能把本批理解为 API 所有图像处理已经移除。

worker 停止时已准备的图片仍可读取；冷图片可能超时，恢复 worker 后会继续准备有效任务。30 秒是等待任务结果的预算，不包含数据库连接/查询本身可能消耗的时间，也不是整个站点请求的统一超时。磁盘缓存的每模式体积和 30 天清理边界仍按下面说明执行。没有生产发布或生产内存收益结论，应比较相同负载下两个进程的 CPU、RSS、队列和端到端冷请求延迟。

#### API 内存观测与媒体预算（2026 年 10 月 18 日）

没有数据库迁移，没有新增必填环境变量，升级后重启 API 和 worker 即生效（本站使用 `deploy/update.sh`）。

- API 和 worker 启动时及每分钟输出一条 `process resources` JSON 日志，同时把最新样本写入原来的 `settings.heartbeat.<role>`，不积累历史行。`memory` 的单位为字节，含 RSS、JS 堆、external 和 arrayBuffers（arrayBuffers 已包含在 external 中）；`cpu` 是本次采样间隔的用户态/内核态微秒与间隔毫秒；另有事件循环利用率、转码运行数/等待数/拒绝数、原图任务队列、原图预留字节数与已下载处理中字节数、原图缓存字节与条数、在途图片及下载数。日志不含请求内容和凭据；数据库不可用时仍能从进程日志看样本。
- 每个进程的图片解码/转码、动画转换和分享图冷渲染共用两个处理名额，最多八个等待，等待超过三秒或队列已满时 HTTP 返回 `503`、`Retry-After: 5`、`Cache-Control: no-store`。冷图另有四个原图任务名额、八个等待名额（最多等待 20 秒），下载网络等待不占转码名额。20 秒只是原图名额排队上限，不是整个请求的截止时间；之后还可能下载 20 秒、等待转码名额三秒，再加实际转码和磁盘读写时间。排队已满会立即拒绝；这比尽快返回 503 更偏向让短时积压完成，应结合实际冷图延迟和入口代理超时观察。每个原图任务在下载前预留最多 15 MiB，直到处理完才释放，因此已下载、等待转码和转码中的原图合计至多 60 MiB；另有原本的 32 MiB 原图缓存，以及流式下载拼接等瞬时开销，不是 RSS 硬上限。相同图片仍共享一次工作，已准备的磁盘图片和分享图可直接读取。API 和 worker 各有自己的上限。
- 静态图片解码上限为 1600 万输入像素；超过预算时，经元数据验证的浏览器可显示格式（JPEG、PNG、WebP、AVIF、SVG）原样返回并缓存，不在服务端解码，也不缓存成 502，响应大小仍受 15 MiB 下载上限约束。需要位图的内部消费者继续遵守解码上限。动画转码上限从 2 亿降为 800 万总帧像素，约相当于 31 MiB 原始 RGBA，编码器另有开销。超过动画预算的 GIF 继续原样展示，不压成静帧，也不反复排队转码。已有编码缓存保留，不删除数据。超限原图也按 `(模式, URL)` 写入 `imgcache`，每个模式可能各占最多 15 MiB，不能按整张图只存一份估算；原有每日清理会移除写入超过 30 天的图片/分享图缓存，但没有总字节上限，需要同时观察缓存增长及磁盘剩余空间。
- `media.prepare` 遇到容量不足会抛给已有队列策略，最多重试一次（120 秒后）；真实源站或磁盘错误仍按原来的尽力预热处理。分享图容量不足时，在第一次实际推送之前最多延后重试三次，每次至少等待五秒；超过次数后继续原推送流程并记日志，不无限阻塞新闻，也不因预热重复发送。
- 事件分享图保留公开范围和多语言指纹校验，只读成图所需的规范文案、来源/报道计数和排名，跳过热度曲线、相关事件、主题和模块页面详情。

排查增长时对比同一 PID 的多个样本，区分 GC 后 JS 堆增长、Buffer/external 增长和 RSS 单独增长；资源上限不等同于整机 RSS 保证。用相同请求组合比较修改前后的延迟、队列和内存平台值，不能仅凭一次 RSS 降低认定泄漏已解决。

### 2026-10-18：移除旧站配置生成器

新闻站移除旧站 Coding Plan 配置生成器的导航入口和翻译文案；配套入口静态站同时移除页面、脚本、套餐注册表、生成模板及站点地图链接。静态页旧 Buttondown 周订阅表单改为链接到现有 `/subscribe` 日报订阅；不迁移或删除外部订阅名单。两仓库需要分别发布，才能完成入口与页面的退役。此功能只有静态公开数据，没有后端接口、数据库表、定时任务、settings 或环境变量，无须迁移，不删除读者数据。

#### X 账号可以改为外部推送（2026 年 10 月 14 日）

没有迁移，也没有必填的新环境变量。`POST /api/ingest/items` 可以接收 X 帖子，记到已有的 `x_search` 信源上，字段和付费采集一致。不设置 `X_PUSH_ONLY` 时，SocialData 搜索照旧。

要用外部程序代替 SocialData：

1. 确认 `.env` 里有 `INGEST_TOKEN`（至少 16 位）。外部程序用 `Authorization: Bearer <INGEST_TOKEN>` 调用 `POST /api/ingest/items`。载荷和字段见 [信源](sources.md#推送-x-帖子)。
2. 在 `.env` 写入 `X_PUSH_ONLY=true`，重启 **api** 和 **worker**。worker 停止定时和手动的 X 搜索；api 在长文没有随帖子推来时不再去买 SocialData 的长文。RSS、网页列表、JSON 不受影响。
3. 外部程序开始推送后，先对所有仍启用的 X 账号送一次 `checkedHandles`（没有新帖也要），否则这些账号的“上次成功”还停在切换前，后台会把它们看成抓取落后。之后每轮检查都带上看过的账号。
4. `SOCIALDATA_API_KEY` 可以留着：后台“预览抓取”仍会用它，预览是付费的。确认不再预览后可以删掉这个 key。

Docker 改完 `.env` 后执行 `docker compose up -d api worker`。本站服务器的步骤见 `deploy/README.md`。

日报缺期告警按北京时间的具体日期跟踪，跨午夜不会自动恢复；只有对应日报存在才发恢复通知。新缺期检查最近 7 个日历日（含今天），不早于最早的日报或 reports.compose 运行记录；没有历史记录时只检查今天。已告警的日期在这 7 天里持续跟踪；超出 7 天仍没有日报的，发一条“没能补出、停止提醒”后不再提醒。关闭采集/模型或 worker 启动宽限期也不会把缺期当成恢复。旧的 report.daily 状态自动按首次告警时间迁移，保留提醒间隔。出刊后两小时告警、每小时提醒及飞书开关保持不变；无需数据库迁移。自定义 responder 若按旧 `report.daily` 精确匹配，需改为识别 `report.daily:YYYY-MM-DD` 日期键。

#### 视频号视频改版（2026 年 10 月 15 日）

不需要数据库迁移。口播稿改成“一个重点 + 五条快讯 + 一个彩蛋”：第 1 条（工作台里排在最前的）作重点，80–110 字讲清发生了什么、为什么重要、接下来看什么，另写 2–3 个显示在画面上的要点；其余 5 条各一句话；最后从视频没讲的其余条目里挑一条本身就荒诞的 AI 新闻，写一句冷幽默当彩蛋（普通的发布新闻不算，没有合适的就不放，多数日子没有；模型挑了视频里已经讲过的条目时直接丢掉）。每段都要讲标题那件事，难念的型号和缩写换成中文说法，并逐条核对没有编造的名字和数字。开场改为“今天重点说一件事，再快速过 N 条消息”。工作台“视频号”一栏相应分成重点（带要点）、快讯和彩蛋，彩蛋可以删掉。已经写好的口播稿不会重写，Mac 会按新版式合成（第 1 条当重点、没有要点和彩蛋），要新写法就在工作台里点「重新生成」。读口播稿的接口多了 `site`（片尾显示的站点域名）、`points` 和 `egg` 字段，Mac 上的脚本要和服务器一起更新。

Mac 上的合成换了做法：画面改用 HyperFrames（`npx hyperframes@0.8.162`，第一次运行会下载它和它用的 Chrome，要联网）做成动画——重点一张卡（要点随口播逐条出现），快讯共用一张列表卡（念到哪条亮哪条），彩蛋一张卡；字幕按 Qwen3-ForcedAligner 对出的每个词出现并逐词点亮；配上脚本自己合成的背景音乐，人声说话时自动压低；合成后用 Qwen3-ASR 把每段配音听写一遍，念错的名字和对不上的句子写进 `check.txt`，另出一张每张卡片的缩略图 `contact-sheet.jpg`。两个听写模型要先下载到 Mac 上（见下方 [视频号视频](#视频号视频)）。

#### 公众号配图先找后画，点评换口气（2026 年 10 月 14 日）

迁移 `0120` 给 `wechat_illustrations` 加一列 `credit`，只加不删。工作台每条多了「找配图」，工作台顶上多了「没图的都找一张」：worker 先从这条的原文、再从同一事件的其他报道里取第一张够大的图，没有就读这些网页的预览图（og:image），再没有就让 Codex CLI 搜网页（记回执，算在后台预算 `codex-text` 一行里），取搜到的网页的预览图。找来的图在正文里注明“图源”。原文里找图不需要 `CODEX_BIN`；搜网页和 AI 绘图需要它和 `MODEL_CALLS_ENABLED=true`。「公众号点评」的提示词换成了口语、先下判断的写法，并把编辑最近在工作台里改写过的点评（最多 12 条）作为例子一起交给模型；一条点评最长从 60 字放宽到 90 字，提到的公司和产品名只要在当天任何一条里出现过即可。已经写好的点评不会重写。

同一天还有：迁移 `0121` 新建表 `wechat_topics`，只加不删。worker 在早报中文版就绪后（和点评同一时段，每天一次，用“公众号点评”那一步的模型，记回执；要 `MODEL_CALLS_ENABLED=true`）把当天条目按方向归成最多 4 个主题，每个主题一句判断式标题，正文里同一主题的条目排在一起、标题在前，不归主题的条目排在后面的“其他消息”下；之前早报报道过的事件，再写一句“这次新在哪”，印在标题下。主题标题、条目归哪个主题、跟进说明都能在工作台里改；编辑最近改过的主题标题（最多 12 条）会作为例子交给模型。点评现在还会读每条原文的开头（最多 1200 字），可以拎原文里的细节来评，并按中国读者的角度说能不能用、贵不贵、有什么风险。AI 画的配图在正文里注明“AI 绘制”和画面描述，找来的图注明“图源”。

#### 视频号版「AI 早报」（2026 年 10 月 13 日）

迁移 `0119` 新建表 `wechat_videos`，只加不删。后台“公众号”工作台多了“视频号”一栏：点「生成口播稿」，worker 按这一期现在的顺序和改动，取前 6 条写成 60–90 秒的口播稿（用“公众号点评”那一步的模型，记回执，受预算限制；要 `MODEL_CALLS_ENABLED=true`），稿子可以在工作台里改。视频在编辑自己的 Mac 上合成，服务器只多一个凭 `WECHAT_VIDEO_TOKEN` 读口播稿的接口，不配这个变量就不开放（见下方 [视频号视频](#视频号视频)）。

#### 文字步骤可以用 Codex 模型（2026 年 10 月 12 日）

没有迁移，没有必填的新环境变量。`site/models.ts` 的模型预设多了一种：`transport: "codex"`，由 worker 调用那台机器上用 ChatGPT 账号登录的官方 Codex CLI 来回答，用订阅里的额度，不需要 API 密钥（见下方 [文字步骤用 Codex 模型](#文字步骤用-codex-模型)）。示例站加了 `codex-luna` 和 `codex-sol` 两个预设，默认哪一步都不用；在后台“模型与评测”页逐步改选。种子数据会给后台预算加一行 `codex-text`（每分钟 20、每小时 300、每天 3000 次），已有的不覆盖。自己的 `site/models.ts` 里 `ModelPreset` 现在是两种预设的联合类型，原有的 HTTP 预设不用改。

#### 公众号配图与工作台改版（2026 年 10 月 11 日）

迁移 `0113` 新建表 `wechat_illustrations`，只加不删。后台“公众号”工作台改了布局，每条可以配一张图：上传，或在选填的 `CODEX_BIN` 配好后由 worker 用那台机器上的 Codex CLI 画（见下方 [公众号配图](#公众号配图)）。不配就只能上传，其余照旧。种子数据会给后台预算加一行 `codex`（每分钟 2、每小时 20、每天 60 张），已有的不覆盖。图片存在 `AIHOT_DATA_DIR/uploads/wechat-illustrations/`，备份时随 `uploads/` 一起打包。

#### 读者文字的改用词（2026 年 10 月 9 日）

没有迁移，没有必填的新环境变量。行业包多了 `industry/wording.ts`（读者文字里不用的词，模板里是空的）和提示词 `mend-wording.md`；合并时这两个文件随更新带进来，自己的行业包没有冲突。词表空着就不查、不多调用模型；写了词以后，用了这些词的标题、摘要、推荐理由会多一次模型调用（模型步骤“改用词”，可用选填的 `WORDING_MODEL` 单独选模型）。说明见 [把它改成你的行业](customize.md)。

#### 导航里可以不放某些入口

没有迁移，没有新环境变量。`site/site.ts` 多了 `NAV.hidden`（目前只支持热点榜 `"/hot"` 和主题 `"/topics"`，见 [把它改成你的行业](customize.md)）；框架从 `@aihot/site` 读它，**自己维护 `site/site.ts` 的站，合并时照模板加上 `NAV`**，不加通不过类型检查。模板里是空的，导航和原来一样；隐藏入口不会关闭页面或公开接口。

#### 原帖展示与引擎同步（2026 年 10 月 6 日）

没有新增必填环境变量或数据库迁移。自己维护 `site/site.ts` 的站点需补上 `REPORTS.quiet`，可对照示范配置：日报时段内有资料经过评判、但没有新大事时照常出刊，用这两句做标题与导语；导语的 `{start}`、`{end}` 是时段起止。没有任何资料经过评判仍算采集或判断失败，不伪装成平静的一天。

空正文、纯链接的 X 帖子保留原来的链接、图片和引用，不调用写作或翻译模型；来源允许展示全文时，纯图片帖子也可以显示，现有展示与再分发许可继续生效。已取得实际正文的 X 长文照常处理。旧译文也不会再出现在这些原帖的公开页面里。已生成过错误标题摘要的帖子，可在更新后用 `packages/backend/src/publication/publish.ts` 的 `publishArticle(id)` 重建公开内容，不需要重新调用模型。

MCP 的 `subscriptions/listen` 现在立即返回 HTTP 404 和 JSON-RPC `-32601 Method not found`。服务从不推送变更，普通工具调用照常使用；客户端收到这个回答后不应重试建立常驻订阅。

无需数据库的测试改为 `*.standalone.test.ts`；`npm test` 仍运行全部后端测试，只给需要数据库的文件建副本。可用 `npm run test:standalone` 单独运行这些测试。

#### 社区修复、时间规则与读取优化（2026 年 10 月 4 日）

公开接口版本仍是 4.0.0。没有必填的新环境变量；新增一个选填的 `LLM_REASONING_TOKENS`，见下面 `site/models.ts` 一条。

**开关只认 `true`**：`.env` 里所有 `*_ENABLED` 开关（`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED` 等）只有写成小写的 `true` 才打开。以前写 `1` 或 `TRUE` 也算打开，现在都当作关闭；升级前检查 `.env`，改成 `true`。

**迁移**：新增七个迁移，按上面的步骤等 setup 跑完即可。它们都不删数据，不重写文章或已有向量，也不调用模型；迁移按完整文件名记账，编号相同的不同文件各自执行。

- `0055_publication_selected_published_idx.sql`、`0056_analyses_composite_id_idx.sql`、`0056_publications_pool_category_timeline_idx.sql`、`0057_publications_pool_channel_timeline_idx.sql`：并发建立查询索引，不阻塞正常读写。
- `0056_publication_release_selection_stats.sql`、`0057_analyze_publication_release_selection.sql`：为公开列表创建并收集查询统计。
- `0083_publications_selected_source_idx.sql`：并发建立按信源统计精选的覆盖索引，减少后台统计时的读取。

这次连同这些索引一起减少了公开读取与事件召回的数据库开销，接口内容、搜索权重和事件候选范围不变。

**自己改过这些文件的站，合并时对照新文件**：

- `site/site.ts` 多了几项：
  - `EDITION_TIMES`、`EDITION_WHEN`：日报、周报、月报的出刊时间，原来写死在代码里；排程、日报的时间窗口、缺期告警和提到时间的文案都读它。`public/` 里的文件用占位 `{{dailyTime}}`、`{{weeklyTime}}`、`{{monthlyTime}}`。
  - `ITEM_COPY`：推荐理由叫什么，网页和分享图上显示不显示评分。
  - `REPORTS.descriptions`、`entry`、`metricUnits`、`shareUnit`：报告页面的描述和版面上的说法。
  - `ABOUT`、`CARDS` 里提到出刊时间和推荐理由的文案改成引用上面几项。
  - `DEPLOYMENT.directImageHosts` 改名为 `directFetchHosts`，采集和图片共用这份直连名单。
  - `SITE.feedbackLead`、`SITE.feedbackEmailHint`：反馈页标题下的一句话和邮箱框提示，原来写死在代码里。
  - `SITE.psb`：可选的公安备案号，未办理或不适用时填 `null`。
  - `ABOUT.lead` 里 `{sources}` 两边不再写空格，页面会自动加。
- `site/models.ts`：评分调用参数现在由具名预设的 `scoreCall` 配置；保留 `glm-5.3-flash-selection` 时同步示例中的温度、输出额度和超时。已有自定义模型没写这一项时沿用引擎默认值。
- `site/models.ts` 的 `ModelPreset` 和 `site/site.ts` 的 `Founder` 类型统一从 `@aihot/contracts/site-config` 导入，原有站点配置值保留；自定义过这两个文件时同步类型导入，避免漏掉引擎新增的可选字段。
- 数据库迁移遇到正在导出的 `pg_dump` 会先等待，最长与 worker 排空时间相同；超时后在执行这条迁移前退出，等导出结束后重跑更新命令。其他占锁仍快速报错。
- 迁移会删除已停用的 `translation_attempts.request_tag` 列；翻译正文、尝试记录和付费回执保留。来源发布时间的原始精度另行保存，旧资料无法确定的精度保持未知，不把零点自动当作来源只写了日期。
- `site/models.ts`：推理模型的额度改成明确配置。默认模型设 `LLM_REASONING_TOKENS`，具名模型写 `reasoningTokens`。原来只有名字以 `-think` 结尾的具名模型会多给 4000，这个做法去掉了；自己加过这类模型的，补上 `reasoningTokens: 4000` 才保持原来的额度。推理模型把额度用光时，报错会写明 `finish_reason=length` 和该改哪一项。
- `industry/prompts/story-digest.md`：事件概览换了写法，第一句讲清核心变化和目前的结论，再补必要背景，分成短段，不按日期复述下方的时间线，不评论报道本身，也不再写死行业。已有综述不会被批量重写，随新报道逐步换成新写法；想让某几个事件立即重写，见 [综述评测](story-digest-evaluation.md) 的最后一节（`rewriteStoryDigest`，每个事件一次模型调用）。
- 自己维护的 Compose 文件可以删去 `LOCAL_ROUTER_URL`：分享图预热现在直接复用后端渲染器，不再请求固定的本机端口，没有代码再读这一项，自带的 `docker-compose.yml` 已经去掉。分享图地址、格式和缓存约定不变。

**采集与发布时间**：

- **首次导入之后不再收信源的存档**：以前新信源首次导入后，第二次抓取会把订阅里剩下的旧条目全部当历史内容收进来，逐条付费分析（示范源一次就有上千条）。现在之后的抓取只收发布时间在信源第一次导入前 48 小时以内或之后的条目；没有日期的照收，X 账号不受影响，见 [信源](sources.md#规则旧文不刷屏) 的“旧文不刷屏”。升级前已经收进来的旧条目按原文时间归档，不进“今天”和日报，分析也早已跑完，不用处理。
- **没有可信发布时间的新资料先不公开**：先不进公开列表、精选、报告、热点和推送，从原信源或原文页读到日期后再判断新旧。日期未知时，文章页、结构化数据和 Agent Markdown 标“收录时间”，RSS 不写 `pubDate`；OpenAPI 注明事件时间线和日报快讯的 `publishedAt` 这时是收录时间。
- **JSON 接口里不带时区的时间**（如 `2026-09-30 17:43:58`）按信源的 `publishedAtUtcOffset` 读，默认 `+08:00`。以前按服务器时区读，Docker 里是 UTC，所以已有这类信源的新条目时间会提前 8 小时，变成正确值。
- **文章页日期使用同一来源时区**：详情页补日期与正文提取先用 `detail.publishedAtUtcOffset`，未设则继承信源的 `publishedAtUtcOffset`，再默认 `+08:00`。只作用于之后的采集和补日期，不批量重写已有发布时间。
- **详情补全**：失败或超出本轮次数限制的日期、标题、摘要会在后续采集中补齐，已确认的正文保持原样；信源请求成功却漏掉日期、标题或正文时也会补全，并记进信源健康。Jina 详情规则要与实际返回格式匹配；固定采集起点、Intercom 日期章节及视频描述的配置见 [信源](sources.md)。
- **视频播放页不当正文**：对所有信源生效，YouTube、Vimeo 播放页不再作为文章正文抓取，YouTube 视频页也不再被当成图片。RSS 的视频描述只作摘要，订阅直接提供的真实文字保留。升级不会批量删除或重新分析已有正文；旧视频记录混入播放器导航的，先逐条核实，可在后台“内容诊断”的详情页设为仅摘要，停止展示错误正文。
- **RSS**：确认摘要就是全文的文字订阅可以设 `summaryIsBody`（Atom 的 `summary` 也算）。没有网页的播客单集，原文链接改为音频或视频文件，不再去抓网页。
- **预览和正式采集用同一组过滤**：后台“预览抓取”也套用地址前缀、分类、噪声词、地址改写和 `publishedAfter`，预览里看到的条目就是正式采集会存下的。
- **关掉采集后不再取信源图标**：`COLLECT_ENABLED` 不是 `true` 时，每天 04:40 取信源图标的任务也停下，不再访问信源网站。
- **已核实的历史日期可以纠正**：运维脚本先调用 `admin/content.ts` 的 `previewPublicationDateCorrection`，再按预览给出的版本和校验值调用 `correctPublicationDate`，并记录操作者与理由。只接受新旧日期都早于七天窗口的明确更正；保留材料修订、选稿与归组，不重跑模型。材料或日期已变化，或这次纠正会改变其他公开决定时，会拒绝操作并要求重新核对；没有批量回填，也没有新增公开接口。
- **公开评分可以人工更正或撤销**：后台内容详情支持“按模型”“撤销评分”“人工评分”。人工评分接受 0–100，撤销评分使公开值为 `null`；清除评分覆盖后恢复已保存的模型分数。更正要填写理由并核对版本，保留原始分析和审计记录，同步更新网页、API、RSS、Agent Markdown 与 MCP，不重跑模型。既有文章不会因升级而批量改分或重新入选。

**公开出口**：

- **按类别筛选按 `PUBLIC_CATEGORIES` 走**：API、RSS 和 MCP 的 `category` 取所有在公开接口里算作这一类的类别。不合并分类的站（默认就是），按 `tip` 查不再带出观点；没有 `tip` 类别的行业也能通过类型检查。
- **往期报告仍需重新验证**：日期、周和月份确定的是哪一期，不代表内容永久不变。报告保留出刊时写下的标题和摘要，来源名和引用时间跟随当前公开资料；已撤回的引用及依赖它的导读、封面不再分发。保留报告副本的客户端在 `Cache-Control` 到期后带 `If-None-Match` 重新请求。
- **自行配置过 Nginx 或 CDN 缓存的站点要检查规则**：按 [配域名和 HTTPS](#配域名和-https) 末尾的要求核对，并在更新时清理这些路径已有的代理和 CDN 缓存，包括接入说明 `/api/v1/agent` 和 `/openapi-v1.json`。
- **站点地图重建失败时不再无限沿用旧文件**：进程、磁盘副本和 HTTP 响应共用原来的五分钟期限，过期且无法重建时返回 `503` 和 `Retry-After`。MCP 继续使用 `no-store`；API 和 Agent 内容到期后重新验证。

**工具与修复**：

- **综述评测**：`scripts/eval-story-digests.ts` 从库里导出真实事件，在同一批事件上把现有提示词和候选提示词并排跑，见 [综述评测](story-digest-evaluation.md)。三个评测脚本共用 `scripts/eval-tools.ts`；`eval-selection.ts` 的 `--n`、`--concurrency` 和模型名写错时直接报错。
- **迁移不阻塞读写**：新迁移每个文件只放一条允许在线执行的语句，不整表回填或重写，建索引用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`；发布前本地验证用 `scripts/check-migrations.ts` 检查。统计维护只针对明确的表和列，规则见 [架构](architecture.md#数据库迁移)。
- MCP 请求有大小上限，错误日志去掉凭据。
- 桌面侧栏放大后显示细滚动条。
- 测试按每一步实际的提示词认请求、从 `industry/selection.ts` 读门槛，换行业改写提示词和门槛后不再误报；架构测试不再受路径分隔符影响。

#### 站点文件搬进 `site/`（2026 年 10 月 4 日）

公开接口没有变化，版本仍是 4.0.0。

- **站点自己的文件从 `industry/` 搬到了 `site/`**：`site.ts`、`models.ts`、`brand/`、`pages/`、`public/`、`changelog.json`。`industry/` 只留行业知识：`taxonomy.ts`、`topics.json`、`sources.json`、`prompts/`、`selection.ts`。自己改过这些文件的，合并时把改动挪到 `site/` 下的同名文件。
- **`site.ts` 多了几项**，都可以不填：`SITE.github`、`SITE.llmsIntro`、`SITE.rootIcons`，`POLICY.terms.license`、`POLICY.terms.headers`，`ABOUT.termsAnchor`（二维码卡片可以写 `alias`），以及 `ACCESS`、`ADMIN`、`DEPLOYMENT`、`FEED_COPY`、`PUBLIC_CATEGORIES`，说明见 [把它改成你的行业](customize.md)。`PUBLIC_CATEGORIES` 取代了 4.0.0 时的 `publicAs`：原来在类别上写 `publicAs: "tip"` 的，改在 `PUBLIC_CATEGORIES.merge` 里写（键是这个类别的 key，值是 `"tip"`）。
- **`DEPLOYMENT.requiredSecrets`** 是生产 API 启动时额外检查的凭据清单，默认空；基本会话、图片签名和管理员登录校验仍然生效。只有你的部署要求某个可选集成必须配置时才填写。
- **只属于你这个站的功能可以做成模块**：放进 `modules/<名字>/`，在 `site/modules/` 的清单里启用，见 [架构](architecture.md) 的“模块”。框架本身不带模块。
- **Agent 接入页默认打开 MCP**，页面列出 MCP、RSS 和 API 三种接入方式。Agent Markdown 接口仍在 `/api/v1/agent`，可从页面下方“Agent 使用说明”进入。
- **图片代理可以设流量上限**：`IMGPROXY_UPSTREAM_MB_PER_MINUTE`、`IMGPROXY_UPSTREAM_GB_PER_DAY`（或 `site.ts` 的 `DEPLOYMENT.imageUpstreamBudget`），默认不设。
- **修复**：同样的数据每次给出同样的字节（排序遇到并列时补上唯一的次序，API 和 RSS 的 ETag 不再无故变化）；网页转给 api 的请求不再带上逐跳头，`Connection: close` 不再让下一个 POST 失败；`llms.txt` 的接入方式按实际数，不再写成四种。

#### 升级到公开接口 4.0.0（2026 年 10 月 3 日）

- **模型榜、Codex 重置监控和主题页的大事记不再是框架的一部分**，只留在 AIHOT 上。页面（`/leaderboard`、`/codex-reset`）、接口（`/api/v1/codex-resets`、`/api/v1/codex-resets/recent`、`/api/v1/agent/codex-resets`）和 MCP 工具 `<前缀>_get_codex_resets` 都去掉了，MCP 和 `/openapi-v1.json` 的版本号升到 4.0.0。迁移 `0053` 删掉它们的表（`lb_*`、`monitor_*`、`fx_rates`）和设置，定时任务及其执行队列在 worker 启动时自动撤掉，后台运行记录继续保留；要留这些数据的，升级前先备份。公司主题页的标志改成公司名的首字母。

本站没有合入上述删表迁移，保留数据与旧版本回滚能力；模型榜现已恢复为 `modules/leaderboard/`，详情见[模块说明](../modules/leaderboard/README.md)与[本站合并记录](../deploy/releases/2026-10-10-upstream-4.0.md)。启用模块不需要迁移或重新导入生产模型名录，不能执行上游的 DROP。

- **行业包有几处变化**，自己改过 `industry/` 的站，合并时对照新文件补上：
  - `site.ts` 多了 `topicsTitle`、`feedbackExample`、`keywords`、`since`、`interfaceVersion`、`POLICY`（使用规则和隐私说明两页的名字与简介、X 帖子算不算全文）、`ABOUT.description`、`ABOUT.sourcesFallback`、`AGENT`、`REPORTS`、`ALERTS`、`SOURCE_DEFAULTS`、`COMMUNITY_FEEDS`、`CARDS`；作者块的两张二维码卡片加了 `kind`，`ABOUT.copyright` 改成反馈页链接前后的两段。
  - 新增 `models.ts`：具名的模型和每一步默认用哪个，原来写在代码里。
  - 网页左上角的标志从 `apps/web/app/components/Logo.tsx` 搬到 `industry/brand/Logo.tsx`（后来搬到 `site/` 下，见上方）。
  - 新增 `public/`：`robots.txt`、`manifest.webmanifest` 原来在代码里生成，OpenAPI 说明原来在 `reference/`，现在都是这里的文件。原来填了 `contactEmail` 就会生成的 `/.well-known/security.txt`，现在要自己放一份 `public/.well-known/security.txt`（后来搬到 `site/` 下，见上方）。
  - 删掉了 `features.ts`、`chronicle.ts` 和 `chronicles/`；`topics.json` 里的 `orgNames`、`leaderboardProvider`、`chronicleTerms` 不再使用，可以删掉。
  - `taxonomy.ts` 的类别可以写 `feedLabel`（分类 RSS 标题里的名字，示例站用“AI 模型”这样的说法）；`ENTITIES` 加了几家公司。当时类别上还可以写 `publicAs`，让它在公开接口里并进另一类；这个字段后来删掉了，改成 `site/site.ts` 的 `PUBLIC_CATEGORIES.merge`（见上方），再写 `publicAs` 通不过类型检查。
- **推送接口的限流可以设置**：`/api/ingest/items` 每个客户端每分钟最多推几次由 `INGEST_RATE_LIMIT` 决定，`docker compose` 默认 10，和以前一样；不用 Docker 时默认不限，前面没有代理限流的话在 `.env` 里设上。
- **不再使用的环境变量**：`MONITOR_MODEL`，可以从 `.env` 删掉。本站恢复的模型榜仍读取 `ARTIFICIAL_ANALYSIS_API_KEY`。

#### 升级到公开接口 3.0.0（2026 年 10 月 3 日）

- **安全阀默认关**：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 只有写成 `true` 才打开，没写就是关。用 `scripts/init-env.ts` 生成的 `.env` 已经有这两行；自己写的 `.env` 没有的话要补上，否则升级后不再采集、不再调用模型。
- **周报月报接口换了形状**：`/api/v1/weeklies`、`/api/v1/monthlies` 的列表和每一期都带 `periodStart`、`periodEnd`，正文改成 `sections[]`（每栏 `label`、`summary`、`items`），不再有 `title`、`themes`，列表的 `limit` 最多 60。读这两个接口的程序要跟着改；MCP 和 `/openapi-v1.json` 的版本号随之升到 3.0.0。
- **精选的机器出口每条新闻一条**：API 的 `mode=selected`、同步接口和精选 RSS 里，同一条新闻只留代表报道，其他报道以 `remove` 出现在同步的变更里（`mode=all` 里还在）。升级前已经入选的旧报道不会被重新整理，等这条新闻再有报道发布时才归并。
- **精选要等去重确认**：分数够了的资料，要等归组确认它不是精选里已有新闻的重复、带来了新信息，才进精选；确认之前只在“全部动态”。归组用的模型回答不合格式时会停在那里，后台“运行”页能看到。
- **一手只看分级**：`T1` 就是一手，`first_party` 不再单独设置；以前单独标成一手的 `T1_5`、`T2` 信源不再算一手，要算就改成 `T1`。
- **行业包多了几项**：`taxonomy.ts` 新增 `RELEASE`、`PLAIN_TERMS`，评论类的类别标 `commentary: true`，`ENTITIES` 可以写 `otherNames`，`CATEGORY_BY_ITEM_TYPE` 不再使用。已经换成别的行业的站，合并时对照 [把它改成你的行业](customize.md) 补上。
- **主题只读 `industry/topics.json`**：迁移会删掉数据库里的 `topics` 表。只改过数据库、没改文件的主题，升级前先写进文件。公司主题只看 `entityId`，`related` 不再使用。
- **日报不再调用模型**：日报按规则编排，周报月报从日报汇编，模型只写总述和栏目导读；已经出过的各期不重写。
- **提示词有改动**：`industry/prompts/` 里的 `structure.md`、`group-*.md`、`story-digest.md`、`report-period.md` 换成了新的写法，`report-daily-lead.md` 删掉了，新加了 `report-period-sections.md`。改过这些提示词的，对照着把自己的改动搬过去。
- **删掉的脚本**：`scripts/delete-sources.ts`、`scripts/regroup-events.ts`、`scripts/enqueue-analysis.ts`。不要的信源在后台暂停；单篇的重新评估、重新归组在后台“内容诊断”里打开这一篇操作。
- **管理员会话绑定登录方式**（迁移 `0041`）：从还没有会话绑定的版本升级后，未绑定的旧会话需要重新登录。此前已试用会话绑定迁移的数据库可直接升级，已有列和绑定会被保留，无需手动修改迁移记录。之后的规则见下方“管理员会话与配置变更”。
- **3.x 的 `/agent` 默认打开 Agent Markdown**，MCP 的接入说明在 `/agent?tab=mcp`；当前接入页见上方“站点文件搬进 `site/`”。
- **飞书内容群只推 `T1`、`T1_5` 信源的精选。**

### 备份

在 `.env` 里配置 `DB_BACKUP_STORE_*`（任何 S3 兼容的对象存储），每天 04:10 自动备份到那里。`DB_BACKUP_STORE_SECRET_ID`、`DB_BACKUP_STORE_SECRET_KEY`、`DB_BACKUP_STORE_BUCKET`、`DB_BACKUP_STORE_REGION` 四项都要填；不填 `DB_BACKUP_STORE_DOMAIN` 时按腾讯云 COS 拼地址（`<桶名>.cos.<地域>.myqcloud.com`），用其他 S3 兼容存储时，把这个存储桶的访问域名（含桶名，例如 AWS S3 的 `<桶名>.s3.<地域>.amazonaws.com`）填进 `DB_BACKUP_STORE_DOMAIN`。

一次完整备份包含同一时间戳的数据库 `.dump` 和文件包 `.tar.gz`，文件名取自数据库名：Docker 里数据库叫 `aihot`，所以是 `aihot-<时间>.dump` 和 `aihot-files-<时间>.tar.gz`。文件包保留 `uploads/` 以及仍存本地的 `feedback-screenshots/`，不包含图片缓存或本地备份目录；配置了对象存储 `OBJECT_STORE_*` 时，长文配图、公众号配图和壁纸原图在存储桶里，不在文件包中；这些目录里没有文件时只有 `.dump`。已经转发到飞书的图片只保留数据库中的外部引用，文件包不保存飞书上的图片。

每个文件只上传一次，放在一个前缀下：每月 1 日放 `monthly/`，周日放 `weekly/`，其他日子放 `daily/`。可以在对象存储里按前缀设不同的过期时间。

恢复时同时取回这一对文件（只有 `.dump` 的就只恢复数据库）：使用与数据库版本兼容的 `pg_restore` 将 `.dump` 恢复到空数据库，再把文件包解压到数据目录根目录（Docker 中为 `/data`，非 Docker 使用 `AIHOT_DATA_DIR`，默认 `.data`），保留包内的子目录结构，并确保运行进程可读取这些文件。只恢复数据库不能找回仍由 `local:` 引用的反馈截图；旧备份中没有包含的文件也无法凭数据库引用恢复。

下面的手动导出只包含数据库，不包含上述附件目录：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

数据都在三个 Docker 卷里：`db`（数据库）、`data`（上传的图片、图片缓存、本地备份）、`caddy`（证书）。`docker compose down` 不会删除它们；`docker compose down -v` 会。

### 看日志

```bash
docker compose logs -f --tail 100 api worker web
```

后台的“运行”页能看到每个定时任务最近的结果，“信源”页能看到每个信源的抓取状况。

### 管理员会话与配置变更

会话绑定登录方式、登录时的管理员凭据、飞书身份或 Cloudflare Access 邮箱。修改管理员密码、飞书或邮箱管理员名单、Access 配置或会话密钥后，应重启所有 API 进程，使它们加载相同的新配置；只编辑配置文件不代表正在运行的进程已生效，混用旧代码或旧配置的进程不能提供统一撤权。

有效配置改变后，密码会话不再接受旧密码的授权，飞书会话按登录时实际取得的 union ID 或邮箱检查当前名单（两者任一仍获授权即可）。停用飞书登录应用或更换应用 ID 会使飞书会话失效；只轮换同一应用的 secret 不会使仍获授权的飞书会话退出。Access 会话在 Access 凭证到期时结束（不超过 30 天），邮箱移出 `ADMIN_EMAILS`、更换 `CF_ACCESS_TEAM_DOMAIN` 或 `CF_ACCESS_AUD` 会使它失效。轮换或移除 `SESSION_SECRET` 会使所有会话都失效。

鉴权时确认失效的会话会被删除，恢复旧配置也不会让它复活。系统不记录全局凭据变更历史：某次配置变化若从未被进程加载，或在恢复前从未被会话检查观察到，不能据此追溯撤销会话。

### 用 Cloudflare Access 登录后台

站点在 Cloudflare 后面时，可以让 Cloudflare Access 负责后台登录，不再用密码：

1. Cloudflare Zero Trust → Access → Applications 新建一个 Self-hosted 应用，域名填站点域名，路径填 `api/auth/access`；策略 Allow，Include → Emails 填管理员邮箱。登录方式可以用一次性验证码（One-time PIN）或 Google 等身份提供方。
2. 在应用的 Overview 里复制 Application Audience (AUD) Tag；团队域名在 Zero Trust → Settings → Custom Pages（形如 `<team>.cloudflareaccess.com`）。
3. `.env` 里设置 `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`，`ADMIN_EMAILS` 填同样的管理员邮箱；不再要密码登录就清空 `ADMIN_PASSWORD`（已有的密码会话随之失效）。重启 API。

之后打开 `/admin` 会先跳到 Cloudflare 登录，回来时 API 用团队公钥校验 Access 签发的凭证（签名、签发方、AUD、有效期），邮箱在 `ADMIN_EMAILS` 里才建立后台会话。退出后台时也会退出 Access。

## 花多少钱

- **模型**：每条新资料先预筛一次；过了预筛的再评两次分、做一次结构化、写一次标题摘要，然后归组（有相近的报道时才调用），另外还有事件综述、周报月报的总述、精选的全文翻译，以及公众号栏目「AI 早报」的点评和主题（每天各一次：给当天每条写一句点评，把条目归成几个主题）。空正文、纯链接的 X 帖子不调用写作或翻译模型。日报按规则编排，不调用模型。我们用示范信源在本地试跑，第一次导入的 152 条资料一共用了大约 930 次模型调用。之后每天用多少，取决于你的信源每天更新多少条。后台“模型与评测”页能看到每一步的调用次数和输入输出 token 数。
- **付费采集**（X、公众号、Jina）：按请求计费，默认不启用，填了 key 才会用。
- 所有付费服务都有每分钟、每小时、每天的调用上限（后台“设置 → 付费请求上限”），超过就暂停，不会一夜之间刷爆账单。填 0 表示立即停用这个服务。

想省钱，按这个顺序来：

1. 先看后台“模型与评测”页，每一步的调用次数和输入输出 token 都在那里，找出大头再动手。
2. 确认关了思考模式：思考过程按输出 token 计费，`.env.example` 里的 `LLM_EXTRA_JSON` 写了怎么关。
3. 量大的步骤换便宜的模型：`.env` 里可以每一步单独选（`PREFILTER_MODEL`、`SCORE_MODEL`、`STRUCTURE_MODEL`……），也能在“模型与评测”页改。换评分模型之前，用 `scripts/eval-selection.ts` 在同一批样本上比一比，别省了钱却选不准。
4. 少放进无关的资料：花费基本跟每天进来的条数成正比。综合新闻站尽量只订和你方向相关的栏目，在“信源”页调低更新频率，暂停量大却很少入选的信源。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17，系统用 Linux 或 macOS；Windows 上请在 WSL2 里运行，或者用上面的 Docker 方式。

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
```

在 `.env` 里加上：

```bash
DATABASE_URL=postgres://你的用户名@127.0.0.1:5432/myhot
API_BASE_URL=http://127.0.0.1:3001
```

然后：

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

NODE_ENV=production node --env-file=.env apps/api/src/main.ts          # 接口，3001 端口
NODE_ENV=production node --env-file=.env apps/worker/src/main.ts       # 后台任务
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 网页，3000 端口
```

三个进程都要带 `NODE_ENV=production`。api 和 worker 不带它就按开发环境运行：启动时不检查生产密钥和管理员密码，`DEV_AUTH_ROLE` 免登录也会生效。

三个进程要一直运行，生产环境用 systemd 或 pm2 守护（守护配置里同样设 `NODE_ENV=production`）。停止 worker 时给它 515 秒（systemd 的 `TimeoutStopSec=515`、pm2 的 `kill_timeout: 515000` 和 `treekill: false`），覆盖队列的 470 秒排空和数据库清理；systemd 还需设 `KillMode=mixed`，只先通知主进程停止接任务，让正在备份的 `pg_dump`、`tar` 自然完成。被提前杀掉的调用结果不明，要等至少半小时自动放行后才会重试。

开发时用带热更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。开发时想免登录进后台，在 `.env` 里设 `DEV_AUTH_ROLE=admin`（生产环境会拒绝启动）。

### 英文分发、邮件与报告时区

新版分发使用已存储的 publication edition，不在阅读请求中调用模型。英文 RSS 地址为
`/feed/v2/picks.xml`、`/feed/v2/full.xml`、`/feed/v2/all.xml`、`/feed/v2/daily.xml`；中文地址在
`/feed/v2/zh/` 下。分类地址为 `/feed/v2/category/<稳定分类 key>.xml`，全文分类在 `full/category/` 下。
旧 `/feed/*.xml` 保持兼容。缺失目标语言的稿件暂不进入新版 feed；许可全文缺少目标语言正文时只提供摘要。
MCP 3.0.0 的工具参数 `lang=en|zh` 默认 `en`，所需 edition 不完整时返回 `edition_unavailable`。
v1 默认目标语言仍为中文；英文主稿缺少有效中文 edition 时诚实返回实际语言与回退状态，不宣称始终返回中文。显式 `?lang=en|zh` 返回所选 edition 和实际语言状态；快照的语言绑定到分页及增量 cursor。
分享图 `?lang=en|zh` 默认英文。Markdown helper 默认英文，缺失正文 edition 会明确提示而不是混入其他语言。

新邮件订阅的 `language` 只接受 `en` 或 `zh`，来自页面：表单提交 JSON 的 `language`，省略时按无前缀页面记为英文。不读 `Accept-Language`。
迁移 `0043_newsletter_languages.sql` 给已有行补上 `language`：当时没有记下注册页面，所以既有地址补成 `zh`，`language_preference_known=false`，只表示这是补上的默认，不是读者选过中文。
同一地址再次从另一种语言的页面订阅，把这次的语言记在 `pending_language`，并另发一封该语言的确认信。点开这封信之前，`language` 和 Resend 分组都不变，下一封日报仍按原来的语言；点确认之后才改 `language`、记为已知偏好、加入新分组并移出另一个分组。移出失败时只撤销这一步新加入的分组（读者原本就在的分组不动），数据库不改；清掉退订标记失败时把分组恢复成记录里的语言。已经退订的地址同样要等这次确认：确认成功后才清掉退订并只留在新分组，提交表单不会在 Resend 里重新订阅。同一语言在 10 分钟内再提交不另发确认信。
迁移 `0123_newsletter_pending_language.sql` 只增加可空列 `pending_language`，不改已有行。`0124` 给它加上 `NOT VALID` 检查（只允许 `en` 或 `zh`），`0125` 再验证这条检查。
确认信的主题、正文、按钮和链接（`/subscribe` 或 `/zh/subscribe`）使用这次请求的语言。确认页就是这封信打开的订阅页，语言跟链接走。没有单独的欢迎信，也没有站内偏好页；退订仍是每封日报里 Resend 的一键退订链接，链接文字随这封日报的语言。worker 每天读一次 Resend 的联系人，把退订的地址记到 `newsletter_subscribers.unsubscribed_at`，后台的订阅数不再算它们；读者重新确认或在 Resend 里恢复订阅时清掉。

`RESEND_SEGMENT_ID` 保留为中文分组；英文必须单独设置 `RESEND_SEGMENT_ID_EN`。两个 ID 必须不同，缺失
英文分组时不回退到中文分组。启用前必须在 Resend 核对分组成员互斥，旧联系人没有误入英文分组；本迁移不访问或更改
线上分组。`NEWSLETTER_ENABLED=false` 时不发送任何邮件。某一语言的日报只有完整目标 edition 可用时才领取发送权。
英文版缺失或正文仍是中文时跳过这一期的英文，打一条 `newsletter edition skipped` 日志，不改发中文、也不在信里夹一句说明；中文缺失同样跳过，不改发英文。当天稍后的检查（08:00 起每 10 分钟）会再试，直到窗口结束。原 `newsletter_sends` 记录阻止同一期任何语言重发；新增
`newsletter_language_sends` 按期号和语言去重，`unknown` 状态保留人工核查，不自动重试。后台旧发送统计仍只读
原发送表，语言分组统计需要后续接入新表。上线英文主稿后必须保留兼容新语言与新 claim 表的回滚版本，不并行运行旧邮件 worker。

`REPORT_TIME_ZONE=Asia/Shanghai` 是兼容默认值。可在明确切换方案完成后选择
`REPORT_TIME_ZONE=America/New_York`：报告和 newsletter 的 cron 独立使用此 IANA 时区，日报 cron 为本地 08:00，
周报为周一 10:00，月报为每月 1 日 10:30；夏令时由 IANA 规则处理，不使用固定 UTC-5。
其他运维、采集、热点与 time-machine 日历继续使用既有北京时间定义。

报告 compose/catch-up 与 schedule 回调已同步采用
`zonedDate(instant, timeZone)`、`zonedMidnight(date, timeZone)`、`zonedTime(instant, timeZone)` 和
`zonedDateTime(date, "HH:mm", timeZone)`（contracts/time）；日终仍用 `calendarDayEnd`。
`calendarDate`/`calendarMidnight` 与对应 zoned 名称兼容。发布时间必须用 `zonedDateTime(date, "08:00", zone)` 转换，
不能用午夜加 8 小时：纽约 2026-03-08 的 08:00 为 12:00Z，2026-11-01 为 13:00Z。
不存在的本地时间抛出 RangeError；重复时间确定选择较早的 UTC 时刻。
新报告保存业务时区，公开 DTO/UI 披露存储的报告日历；旧报告默认为上海，重生成保持原期号/窗口。当前默认行为仍为北京时间；启用美东配置前必须明确切换日期、key 冲突和新旧边界去重方案。语言和报告日历独立，本变量不修改公共 time-machine/新闻历史筛选或提供浏览器本地显示时区。

### 公众号草稿箱

后台“公众号”工作台可以把当天的「AI 早报」（标题、摘要、正文、封面、阅读原文）推进公众号的草稿箱，发表仍在公众号后台点。个人订阅号也能用草稿箱接口，但不能用发布接口。要打开：

1. 公众号后台“设置与开发 → 开发接口管理”拿到 AppID 和 AppSecret；
2. 把服务器的出口 IP 加进同一页的 IP 白名单（这些请求直连，不走 `EGRESS_PROXY_URL`）；
3. `.env` 里设 `WECHAT_APPID`、`WECHAT_APPSECRET` 和 `WECHAT_DRAFT_ENABLED=true`，重启 api。

同一期再推送会更新同一篇草稿；那篇草稿已经发表或删掉时，会新建一篇。

### 公众号配图

工作台里每条可以配一张图，印在这条标题下方；推送时图片先传到公众号（`media/uploadimg`），正文里用公众号给的地址，每张只传一次。「复制正文」不带配图，手动发时要在公众号编辑器里另外插入。

图可以让 worker 找：点「找配图」（或「没图的都找一张」），worker 依次试这条的原文和同一事件其他报道里的图（宽至少 480、不过扁过长）、这些网页的预览图（og:image），都没有时让 Codex CLI 搜网页，取搜到的网页的预览图；再点一次换下一张。找来的图记下所在网页，正文里在图下注明“图源：网站”；转载前确认可以使用，不行就换一张、上传或画。搜网页的要求在 `industry/prompts/wechat-image-search.md`，算在后台预算 `codex-text` 一行里。

图也可以上传（PNG、JPEG、WebP），或者让 worker 画：worker 所在的机器装好 Codex CLI，用运行 worker 的系统用户 `codex login`，然后在 `.env` 里设 `CODEX_BIN=<codex 的绝对路径>`（配置目录不在这个用户的主目录时，再设 `CODEX_HOME`），重启 api 和 worker。还要 `MODEL_CALLS_ENABLED=true`。每张图跑一次 `codex exec`（用它的图片生成，一到四分钟），消耗 Codex 登录账号的额度；每次都记回执，受后台预算里 `codex` 一行限制，填 0 就停。画的要求在 `industry/prompts/wechat-illustration.md`。

### 视频号视频

视频号没有发布视频的接口，服务器上也没有配音模型，所以分两步：服务器上的 worker 写口播稿，编辑的电脑合成视频，编辑再手动发表。合成可以在 Apple 芯片的 Mac 上跑（mlx-audio），也可以在带 NVIDIA 显卡的 Linux 机器上跑（voxcpm 和 qwen-asr 两个包，8 GB 显存够用），脚本按系统选模型。

1. 服务器 `.env` 里设 `WECHAT_VIDEO_TOKEN`（至少 16 个字符的随机串，比如 `openssl rand -hex 24`），重启 api。
2. Mac 上装好 ffmpeg（带 libx264）、Node.js，和一个装了 mlx-audio 与 soundfile 的 Python venv。第一次运行前，用 venv 里的 `hf download <模型>` 把三个模型下载好：配音 `mlx-community/VoxCPM2-bf16`，对字幕 `mlx-community/Qwen3-ForcedAligner-0.6B-8bit`，听写自检 `mlx-community/Qwen3-ASR-1.7B-8bit`（运行时不联网取模型）。画面用 `npx hyperframes@0.8.162` 渲染，第一次运行会下载它和一个 Chrome，脚本已关掉它的匿名统计。
   用 NVIDIA 显卡的 Linux 机器时，venv 里装 `voxcpm`、`qwen-asr`、soundfile 和 scipy（带 CUDA 的 PyTorch），模型换成原版：`openbmb/VoxCPM2`、`Qwen/Qwen3-ForcedAligner-0.6B`、`Qwen/Qwen3-ASR-1.7B`。
3. 在合成用的机器上仓库目录的 `.env` 里写同一个 `WECHAT_VIDEO_TOKEN`；venv 不在 `~/.local/share/voxcpm2-mlx/venv` 时设 `VOXCPM_PYTHON=<venv 里 python 的路径>`；用参考录音时把录音也放到那台机器上。
   合成放在另一台机器上、在 Mac 上发起时，那台机器按上面装好、仓库克隆好（git 能拉 origin），Mac 的 `.env` 设 `WECHAT_VIDEO_HOST=<ssh 主机名>`（仓库不在它主目录的 `news-e-accs` 时再设 `WECHAT_VIDEO_HOST_DIR`），或者每次加 `--on <ssh 主机名>`：脚本在那台机器上把仓库更新到 origin/main、用它自己的 `.env` 合成，再把成片拷回 Mac 的输出目录（配音的中间文件不拷）。
4. 在工作台“视频号”一栏生成并改好口播稿。重点自动取这一期里热榜排名最高的那条（热榜上一条都没有时，取工作台里排在最前的），其余按工作台的顺序。然后运行 `npm run wechat-video -- <日期>`。三四分钟后，`~/Movies/e-acc-daily/<日期>/` 里会有 mp4（1080×1920，一分钟出头）、视频号描述 `caption.txt`、封面 `cover.png`、每张卡片的缩略图 `contact-sheet.jpg` 和自检结果 `check.txt`。
5. 看一眼自检：配音把名字念错了（比如把一个英文名念成别的词），或者某段听写出来和稿子对不上，脚本会先把这段重配，最多再配两次，留下听写最准的一次；还不对的列在 `check.txt` 和终端里。在工作台把那段改成好念的说法（国内公司用中文名），再合成一次。
6. 在视频号助手（channels.weixin.qq.com）或手机上上传 mp4，粘贴描述。

背景音乐由 `scripts/wechat-video-music.py` 现场合成（同一天的视频用同一段旋律），不涉及版权；人声说话时它自动压低，句子之间再回来。

声音默认按 `VOICE_DESCRIPTION` 的文字描述生成（VoxCPM2 的声音设计），不需要参考录音。要换成某个人的声音，就设 `VOICE_REF_AUDIO=<10–30 秒的清晰录音>` 和 `VOICE_REF_TEXT=<录音的逐字文本>`，而且只能用本人同意使用的录音，不要克隆公众人物或配音演员的声音。克隆的声音连录音里的语速也一起学去，录音念得慢时设 `VOICE_TEMPO`（例如 `1.15`）整体提速，音高不变。其他选填项：`WECHAT_VIDEO_BASE_URL`（默认站点地址）、`VOXCPM_MODEL`、`VOXCPM_TIMESTEPS`（默认 10）。配音约需成片时长的 1.5 倍，画面渲染一分多钟。

### Search Console 周读数

后台“增长”页的“周报”把每周的页面访问、订阅和 Search Console 放在一张表里。Search Console 一栏由 worker 每周三上午读上一周（周一到周日）：展示和点击，以及 sitemap 里每个网址是否已被 Google 收录，按栏目（事件、条目、日报、指数……）分开记。要打开：

1. 在 Google Cloud 建一个项目，启用 “Google Search Console API”，建一个服务账号，下载它的 JSON 密钥，放到服务器上只有运行 worker 的用户能读的位置；
2. Search Console 的“设置 → 用户和权限”里，把服务账号的邮箱加为该资源的用户（“受限”权限就够）；
3. `.env` 里设 `SEARCH_CONSOLE_PROPERTY`（网域资源写 `sc-domain:example.com`，网址前缀资源写 `https://example.com/`）、`SEARCH_CONSOLE_KEY_FILE=<密钥文件路径>` 和 `SEARCH_CONSOLE_ENABLED=true`，重启 worker。

收录检查每个资源每天限 2,000 次，每周最多检查 1,800 个网址；超出配额时这一周只记已检查的部分。Google 偶尔对单个网址的检查返回 500，这个网址就记作未检查，当周的展示和点击照样保存；累计失败 20 次就当 Google 出了故障，停止检查，同样保留已检查的部分。读数不花钱。
