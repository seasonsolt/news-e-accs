# 手机专属壁纸第一阶段

本阶段替换 93 套壁纸的手机版与预览：ID 1–4、8–93、138–140。包括当前已发布的 4 套，以及 10 月 22–24 日排期的新作。清单与文件 SHA-256 见 `tools/art/phone-editions-2026-10/release-phase-1.json`。

每套重新制作 9:16 竖版构图，原生约 941×1672，经 Real-ESRGAN 导出 2160×3840 JPEG；不是原生 4K。双手机 AI 场景分别演示锁屏和主屏。页面增加 AI 示意说明，并保持图片原始比例。此前已完成的壁纸产品图标一并发布。

原图和场景 PNG 留在本地制作目录，生产手机文件仍写入私有 R2，1600 像素宽 WebP 预览写入 uploads。Git 保存提示词、映射、哈希与操作脚本，不重复保存大型导出图片。

数据操作：先完整备份数据库到 `/srv/eacc/backups/phone-editions-phase1-20261021/before.dump`；上传文件逐个读回校验后，再在事务中替换 `phone_file` 与 `preview_file` 并写审计。壁纸 ID、排期、标题、桌面文件、积分与下载记录均保留。操作目录为 `/srv/eacc/data/phone-editions-phase1-20261021/`，保留 `before.json` 与 `after.json`。

回滚代码使用 `deploy/update.sh --rollback`。如需回滚本批图片，按操作目录 `before.json` 恢复这 93 个 ID 的两个文件字段；旧文件保留，勿通过整库恢复覆盖后来新增的订阅或下载记录。无数据库结构迁移。

本阶段为 93/140；未纳入本批的 47 套沿用原线上版本，制作中的新文件仍保存在本地。

独立运行操作脚本时必须传入 `AIHOT_DATA_DIR=/srv/eacc/data`（生产服务通过 systemd 设置此项），并使用 `/opt/node24/bin/node --env-file=/srv/eacc/.env`。脚本按安装包入口加载 sharp，不能假设其内部文件布局。

代码版本 `9168dc950e7fbe79815c204b956b080e795228a9` 已通过发布入口检查：后端 1006 通过、3 跳过，浏览器测试 151 通过、1 跳过，全站 smoke 与 MCP 通过。
