# e-acc.ai 生产部署

本仓库是开源模板，通用部署方式见 `docs/deploy.md`；这里只记录我们自己的生产站。

## 架构

```
读者 ─▶ e-acc.ai（Cloudflare Worker eacc-edge，按路径分流）
          ├─▶ 新闻站：news.e-accs.com ─ Cloudflare Tunnel ─▶ DMIT 服务器 127.0.0.1:3000（本仓库）
          └─▶ 其余路径：Cloudflare Pages 静态站（仓库 seasonsolt/e-acc.ai）
```

- news.e-accs.com 只接受带 `EDGE_SECRET` 的请求（也就是经过 Worker 的），其余请求重定向到 e-acc.ai。
- 服务器的 443 端口给 sing-box 用了，所以走 Tunnel（只出站，不开端口）。
- Cloudflare Web Analytics 不会在边缘自动插入信标：页面 HTML 经 eacc-edge 和 Tunnel 回源。公开页面由网页在 `</body>` 前自己写上信标（`SITE.webAnalyticsToken`，可用 `CF_WEB_ANALYTICS_TOKEN` 覆盖）。
- 服务器上不用 Docker：PostgreSQL 17（Debian 自带）、Node 24（`/opt/node24`）、systemd。

一次发布可能涉及三个地方：

| 发布什么 | 怎么发布 | 怎么回滚 |
|---|---|---|
| 新闻站（本仓库） | `deploy/update.sh` | `deploy/update.sh --rollback` |
| 入口 Worker（`e-acc.ai/edge`） | `cd edge && cf deploy --secrets-file <含 EDGE_SECRET 的文件>` | Cloudflare 后台 Workers → eacc-edge → Deployments，或 `npx wrangler rollback <版本 ID>` |
| Pages 静态站（`e-acc.ai`） | 推送到 main 自动发布 | Cloudflare 后台 Pages → eacc → 选旧部署回滚 |

**新闻站新增顶层路由**（比如 `/products`）时，必须同时把它加进 `e-acc.ai` 仓库 `edge/src/route.mjs` 的
`NEWS_SECTIONS`（单个路径如 `/llms-full.txt` 加进 `NEWS_EXACT`）并发布 Worker，否则这个路径会落到 Pages，返回 404。先发布新闻站，再发布 Worker。

## 新闻站发布

```bash
git push                      # 只部署已推送、且 GitHub 检查通过的提交
deploy/update.sh              # 部署 origin/main
deploy/update.sh <提交>        # 部署指定提交
deploy/update.sh --status     # 当前版本、服务状态、最近几次部署
deploy/update.sh --rollback   # 切回上一个版本；--rollback <提交> 切到指定版本
```

`update.sh` 在本机运行：确认提交在 origin/main 上、GitHub 检查已通过，然后把 `deploy/remote.sh`
通过 ssh（主机别名 `dmit`，可用 `HOST=` 覆盖）交给服务器执行。紧急情况下可用 `SKIP_CI=1` 跳过检查。

服务器上的步骤：

1. 在新目录 `/srv/eacc/builds/<sha>` 里取代码、`npm ci`、构建网页。这一步失败不影响线上。
2. 把 `/srv/eacc/app` 这个链接原子地切到新目录，装上新版本的 systemd 文件，依次重启 api（启动前自动跑迁移和种子数据）、web、worker。
   worker 会等进行中的付费模型调用结束（最多 210 秒）。
3. 检查：`/api/health` 必须返回新版本的 sha，三个服务都在运行，`scripts/smoke.ts` 通过。
4. 检查不通过就自动切回上一个版本，并以非零状态退出。服务器保留最近 5 个版本，所以回滚只需要几秒。

重启 api 和 web 时会有几秒钟不可用（单机，没有做双实例）。

部署记录在服务器的 `/srv/eacc/builds/deploys.log`，每行一条（时间、deploy/failed/rollback、sha）。
有数据迁移、导入或需要人工核对的发布，另外在 `deploy/releases/` 里写一份记录（参照已有的文件）。

**迁移和回滚**：迁移只做向后兼容的增量（见 `AGENTS.md`），旧代码可以直接跑在新库上，所以回滚代码不需要回滚数据库。
如果某次发布确实需要改动已有数据，先备份：`ssh dmit 'sudo -u postgres pg_dump -Fc eacc > /srv/eacc/backups/eacc-before-<名字>.dump'`。

## 服务器布局

| 内容 | 位置 |
|---|---|
| 代码仓库 | `/srv/eacc/repo`（系统用户 `eacc`，用只读部署密钥从 GitHub 拉取，只 fetch 不改工作区） |
| 各个版本 | `/srv/eacc/builds/<sha>`，各自装好依赖并构建好网页 |
| 当前版本 | `/srv/eacc/app` → 指向其中一个版本的链接；systemd 从这里运行 |
| 配置 | `/srv/eacc/.env`（600 权限，不进仓库）；每个版本里的 `.env` 是指向它的链接 |
| 数据 | PostgreSQL 库 `eacc`；文件在 `/srv/eacc/data`；备份在 `/srv/eacc/backups` |
| 进程 | `eacc-api`（3001）、`eacc-worker`、`eacc-web`（3000），都只监听 127.0.0.1 |
| 入口 | `cloudflared-news`：Tunnel `news-e-accs` → `http://127.0.0.1:3000`；DNS `news` CNAME 到 Tunnel |

systemd 文件在 `deploy/systemd/`：三个服务共用的设置在 `eacc-.service.d/common.conf`（systemd 会把它用于所有
`eacc-*.service`），每次部署时随版本一起安装。

第一次运行新版 `update.sh` 时，会自动把旧的原地部署目录 `/srv/eacc/app` 改成 `/srv/eacc/repo`，`.env` 复制到
`/srv/eacc/.env`。旧目录本身依赖和构建都完整，如果第一次部署检查失败，就切回它。

## 日常操作

```bash
ssh dmit journalctl -u 'eacc-*' -f                 # 看日志
ssh dmit systemctl status eacc-api eacc-worker eacc-web cloudflared-news
```

看一个页面慢在哪：响应头 `Server-Timing` 里，网页的 `api` 是读 api 的耗时（几次读取相加）、`total` 是到发出响应头为止的总耗时，
api 自己的响应带 `app`。`x-eacc-edge-cache: HIT` 时这些是缓存那一次渲染的数字。在服务器上绕开 Cloudflare 直接看：
`ssh dmit 'curl -s -o /dev/null -D - http://127.0.0.1:3000/ | grep -i server-timing'`。

改配置：编辑服务器上的 `/srv/eacc/.env`，然后 `ssh dmit systemctl restart eacc-api eacc-worker eacc-web`。

### 用外部推送代替 SocialData 采集 X

新闻站代码发布（`deploy/update.sh`，见上）之后，在服务器上改 `/srv/eacc/.env`，不需要新的数据库迁移：

1. 确认已有 `INGEST_TOKEN`（至少 16 位）。没有就生成一个写进去。外部程序请求 `POST /api/ingest/items`，头是 `Authorization: Bearer <INGEST_TOKEN>`。这是现有的 `/api/` 路径，入口 Worker 不用加新路由。载荷见 `docs/sources.md` 的“推送 X 帖子”。
2. 加上 `X_PUSH_ONLY=true`。
3. `ssh dmit systemctl restart eacc-api eacc-worker`。api 和 worker 都读这个开关：worker 不再对 X 账号调用 SocialData，RSS 照常；api 在帖子没带长文时不再去买长文。
4. 立刻让外部程序推一次，`checkedHandles` 带上全部仍启用的 X 账号（例如 `x-openai` 对应的 `OpenAI`）。这一步刷新每个账号的上次成功时间和健康状态。不推的话，停掉付费搜索之后后台会把这些账号报成抓取落后。
5. 之后按账号的抓取间隔持续推送新帖，并在每轮带上本轮看过的 `checkedHandles`。`SOCIALDATA_API_KEY` 先留着；只有后台“预览抓取”还会用它。不再预览后再从 `.env` 删掉。

回滚这个开关：把 `X_PUSH_ONLY` 改回不是 `true`（或删掉），重启 api 和 worker，付费搜索恢复。已经推入的帖子留在库里，不用迁数据。

### 打开模型调用

没有模型 key 时 `MODEL_CALLS_ENABLED=false`：只抓取不精选，首页是空的。在 `/srv/eacc/.env` 里填
`LLM_API_KEY`（需要时改 `LLM_BASE_URL`、`LLM_MODEL`），把 `MODEL_CALLS_ENABLED` 改成 `true`，然后重启 api 和 worker。
后台 `/admin` 用 Cloudflare Access 登录（Zero Trust 里保护 `e-acc.ai/api/auth/access` 的应用，只允许 `seasonsolt@gmail.com`），
同一个文件里的 `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`ADMIN_EMAILS` 是它的配置，`ADMIN_PASSWORD` 留空。步骤见 `docs/deploy.md` 的“用 Cloudflare Access 登录后台”。

### 邮件订阅（Resend）

首页第一次访问会看到订阅引导页（可以跳过），`/subscribe` 是它的独立页面。流程：填邮箱 → 中文确认邮件 →
点确认 → 每天日报生成后（08:00 起每 10 分钟检查一次）群发一封。退订由 Resend 的链接处理。

开通步骤：
1. 在 Resend 注册并建一个 **Full access** 的 API key。
2. 在 Resend 添加发信域名 `news.e-accs.com`，把它给出的 DNS 记录（DKIM、SPF 的 MX 和 TXT）加到 Cloudflare 的
   e-accs.com 区域（都在 `news` 子域名下，不影响主域名收信），等验证通过。
3. 在 Resend 建一个 segment（例如 “news.e-accs.com 日报”），记下它的 ID。
4. 在 `/srv/eacc/.env` 里填 `RESEND_API_KEY`、`RESEND_SEGMENT_ID`，把 `NEWSLETTER_ENABLED` 改成 `true`，
   然后重启 api 和 worker。

发送记录在表 `newsletter_sends`（每天一行）；状态是 `unknown` 的那天可能发出了也可能没有，去 Resend 后台核对，
不会自动重发。订阅者在表 `newsletter_subscribers`。

## 从零重建

1. `apt install postgresql`；Node 24 解压到 `/opt/node24`；建用户 `eacc`（home `/srv/eacc`），
   部署密钥放在 `~/.ssh/id_deploy`，克隆本仓库到 `/srv/eacc/repo`。
2. 建库和角色 `eacc`；在 repo 里运行 `node scripts/init-env.ts --llm-key …` 生成 `.env`，移到 `/srv/eacc/.env`（600），再加
   `SITE_URL=https://e-acc.ai`、`TRUST_PROXY=true`、`DATABASE_URL`、`API_BASE_URL=http://127.0.0.1:3001`。
3. `ln -s /srv/eacc/repo /srv/eacc/app`，再在本机运行 `deploy/update.sh`：它会构建第一个版本、装好 systemd 文件并启动服务。
   之后 `systemctl enable eacc-api eacc-worker eacc-web`。
4. 装 cloudflared（pkg.cloudflare.com 源），token 写进 `/etc/cloudflared/news-e-accs.token`（600），
   安装 `deploy/systemd/cloudflared-news.service` 并 enable。
