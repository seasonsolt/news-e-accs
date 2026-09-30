# news.e-accs.com 部署

**架构**：Cloudflare（DNS、HTTPS、CDN、Tunnel，全部免费套餐）在前，DMIT 服务器跑后端。
不用 Docker：PostgreSQL 17（Debian 自带）+ Node 24（`/opt/node24`）+ systemd。
服务器的 443 端口给 sing-box 用了，所以流量走 Cloudflare Tunnel（只出站，不开端口）。

| 组件 | 位置 |
|---|---|
| 代码 | `/srv/eacc/app`（系统用户 `eacc`，只读部署密钥拉取本仓库） |
| 配置 | `/srv/eacc/app/.env`（600 权限，不进仓库） |
| 数据 | PostgreSQL 库 `eacc`，文件在 `/srv/eacc/data` |
| 进程 | `eacc-api`（3001）、`eacc-worker`、`eacc-web`（3000），都只听 127.0.0.1 |
| 入口 | `cloudflared-news`：Tunnel `news-e-accs` → `http://127.0.0.1:3000`；DNS `news` CNAME 到 tunnel |

## 常用操作

```bash
deploy/update.sh                                   # 拉 main、装依赖、构建、重启
ssh dmit journalctl -u 'eacc-*' -f                 # 看日志
ssh dmit systemctl status eacc-api eacc-worker eacc-web cloudflared-news
```

## 打开模型调用

没有模型 key 时 `MODEL_CALLS_ENABLED=false`：只抓取不精选，首页是空的。在服务器上编辑
`/srv/eacc/app/.env`，填 `LLM_API_KEY`（需要时改 `LLM_BASE_URL`、`LLM_MODEL`），把
`MODEL_CALLS_ENABLED` 改成 `true`，然后 `systemctl restart eacc-api eacc-worker`。
后台 `/admin` 的管理员密码在同一个文件的 `ADMIN_PASSWORD`。

## 从零重建

1. `apt install postgresql`；Node 24 解压到 `/opt/node24`；建用户 `eacc`（home `/srv/eacc`），克隆到 `~/app`。
2. 建库和角色 `eacc`；`node scripts/init-env.ts --llm-key …` 生成 `.env`，再加
   `SITE_URL=https://news.e-accs.com`、`TRUST_PROXY=true`、`DATABASE_URL`、`API_BASE_URL=http://127.0.0.1:3001`。
3. `npm ci && npm run build -w @aihot/web`；把 `deploy/systemd/*.service` 装进 `/etc/systemd/system/` 并 enable。
4. 装 cloudflared（pkg.cloudflare.com 源），token 写进 `/etc/cloudflared/news-e-accs.token`（600）。
