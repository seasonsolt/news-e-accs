# 每日 4K 壁纸

新增模块 `modules/wallpaper`，产品页 `/products/wallpaper`（中文 `/zh/products/wallpaper`），是 `/products` 里第一个标为"已上架"的产品。已确认的邮件订阅者领取专属 key，送 100 积分；每天的壁纸扣 10 积分，同一天的桌面版、手机版和重复下载只扣一次。积分用完后不能下载新的日期，已付过的日期仍可下载，暂不提供充值。首页、加速史插画右上角和订阅确认页加了入口。

迁移 `0130`–`0132` 新增 `wallpapers`、`wallpaper_keys`、`wallpaper_downloads` 三张表。`0133`–`0135` 先加入并验证包含 `wallpaper` 的订阅来源约束 v2，再删除旧约束。没有修改或删除已有数据，迁移向后兼容，回滚旧版本时可以保留新表和新约束。

上传的壁纸保存在 `/srv/eacc/data/uploads/wallpapers/`，已在 uploads 的备份范围内。凭 key 的下载和额度接口返回 `private, no-store`，入口 Worker 不缓存；`/products` 已在入口 Worker 的 `NEWS_SECTIONS` 和 `CHINESE_SECTIONS` 里，无需修改 Worker。

上线后到 `/admin/wallpapers` 上传第一张壁纸（`tools/make-wallpaper.sh` 生成的桌面版、手机版和预览三个文件），在那之前产品页显示"第一张壁纸即将上线"。

本地已通过类型检查、网页构建、全部后端测试（除本机 pg_dump 16 对 PostgreSQL 17 引起的 8 项 backup 测试，`deploy/verify.sh` 的容器里使用匹配版本）、standalone 测试和网页测试，并用隔离数据库通过后台接口上传了两张壁纸，在浏览器里走通了凭订阅 token 领取 key；下载扣费由后端测试覆盖。
