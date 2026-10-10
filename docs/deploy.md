# 部署

## 用 Docker（推荐）

需要一台装了 Docker（带 Compose）的机器。云服务器建议至少 2 核、4 GB 内存，构建镜像时要用到。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

`init-env.ts` 会生成 `.env`，填好随机密钥和管理员密码，并把密码打印一次。机器上没有 Node 的话，把 `.env.example` 复制成 `.env`，自己填 `ADMIN_PASSWORD`（至少 12 位）、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`POSTGRES_PASSWORD`（各用 `openssl rand -hex 32` 生成）和 `LLM_API_KEY`。

启动后打开 `http://服务器地址:3000`，后台在 `/admin`，用管理员密码登录。第一次启动会导入示范信源，一两分钟后开始出现内容；第一次导入的一百多条资料大约半小时处理完（每条都要预筛、评分，入选的还要写标题摘要）。

`docker compose` 会起五个容器：`db`（PostgreSQL 17）、`setup`（每次启动先跑数据库迁移和种子数据，然后退出）、`api`、`worker`（抓取、模型处理、定时任务）、`web`（网页）。

### 在中国大陆的服务器上

- 构建时 npm 走国内镜像：`docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`，然后 `docker compose up -d`。
- 拉取 Docker 镜像慢，先给 Docker 配置镜像加速。
- 海外信源抓不到时，在 `.env` 里设置 `EGRESS_PROXY_URL`：抓信源、图片和模型榜数据时走这个代理，调用模型接口不走。
- 对外提供网站服务需要先完成 ICP 备案，备案号填在 `industry/site.ts` 的 `icp`。

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

已经有 Nginx 的话，不用 Caddy，把站点反向代理到 `http://127.0.0.1:3000`，带上 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`，并在 `.env` 里设 `TRUST_PROXY=true`。`SITE_URL` 一定要写成读者实际访问的地址：生成的链接、RSS、分享图和 MCP 都用它。

### 更新

```bash
git pull
docker compose up -d --build
```

数据库迁移只做向后兼容的增量，更新时自动执行。

### 备份

在 `.env` 里配置 `DB_BACKUP_STORE_*`（任何 S3 兼容的对象存储），每天 04:10 自动备份到那里。也可以手动导出：

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

数据都在三个 Docker 卷里：`db`（数据库）、`data`（上传的图片、图片缓存、本地备份）、`caddy`（证书）。`docker compose down` 不会删除它们；`docker compose down -v` 会。

### 看日志

```bash
docker compose logs -f --tail 100 api worker web
```

后台的“运行”页能看到每个定时任务最近的结果，“信源”页能看到每个信源的抓取状况。

## 花多少钱

- **模型**：每条新资料至少预筛一次；可能入选的再评分两次，入选的还要写标题摘要、打标签、归组，另外还有日报和事件综述。我们用示范信源在本地试跑，第一次导入的 152 条资料一共用了大约 930 次模型调用。之后每天用多少，取决于你的信源每天更新多少条。后台“模型与评测”页能看到每一步的调用次数和输入输出 token 数。
- **付费采集**（X、公众号、Jina）：按请求计费，默认不启用，填了 key 才会用。
- 所有付费服务都有每分钟、每小时、每天的调用上限（后台“设置 → 预算”），超过就暂停，不会一夜之间刷爆账单。填 0 表示立即停用这个服务。

## 不用 Docker

需要 Node.js 24.11 以上和 PostgreSQL 16 或 17。

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

node --env-file=.env apps/api/src/main.ts          # 接口，3001 端口
node --env-file=.env apps/worker/src/main.ts       # 后台任务
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 网页，3000 端口
```

三个进程要一直运行，生产环境用 systemd 或 pm2 守护。

开发时用带热更新的方式：`npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。开发时想免登录进后台，在 `.env` 里设 `DEV_AUTH_ROLE=admin`（生产环境会拒绝启动）。

### 英文分发、邮件与报告时区

新版分发使用已存储的 publication edition，不在阅读请求中调用模型。英文 RSS 地址为
`/feed/v2/picks.xml`、`/feed/v2/full.xml`、`/feed/v2/all.xml`、`/feed/v2/daily.xml`；中文地址在
`/feed/v2/zh/` 下。分类地址为 `/feed/v2/category/<稳定分类 key>.xml`，全文分类在 `full/category/` 下。
旧 `/feed/*.xml` 保持兼容。缺失目标语言的稿件暂不进入新版 feed；许可全文缺少目标语言正文时只提供摘要。
MCP 3.0.0 的工具参数 `lang=en|zh` 默认 `en`，所需 edition 不完整时返回 `edition_unavailable`。
v1 默认目标语言仍为中文；英文主稿缺少有效中文 edition 时诚实返回实际语言与回退状态，不宣称始终返回中文。显式 `?lang=en|zh` 返回所选 edition 和实际语言状态；快照的语言绑定到分页及增量 cursor。
分享图 `?lang=en|zh` 默认英文。Markdown helper 默认英文，缺失正文 edition 会明确提示而不是混入其他语言。
新增 `/feed/v2/` 或其他顶层入口发布前需要核对入口仓库 `edge/src/route.mjs` 的转发配置。

新邮件订阅默认英文，可提交 `language=zh`（JSON 字段）选择中文。既有订阅记录保持中文发送，
`language_preference_known=false` 仅表示兼容策略，不表示读者已选择中文。再次订阅和重试保持原记录语言；
目前不通过重复订阅变更偏好，避免同一联系人进入两个分组。需要偏好变更时，应单独实现经过确认的分组迁移流程。
确认链接和邮件内容使用记录中的语言，退订继续由 Resend 的一键退订链接处理。

`RESEND_SEGMENT_ID` 保留为中文分组；英文必须单独设置 `RESEND_SEGMENT_ID_EN`。两个 ID 必须不同，缺失
英文分组时不回退到中文分组。启用前必须在 Resend 核对分组成员互斥，旧联系人没有误入英文分组；本迁移不访问或更改
线上分组。`NEWSLETTER_ENABLED=false` 时不发送任何邮件。英文日报只有完整目标 edition 可用时才领取发送权；
缺失或混合版本等待之后的定时检查。原 `newsletter_sends` 记录阻止同一期任何语言重发；新增
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
