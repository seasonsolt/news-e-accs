# 壁纸原图放到 Cloudflare R2

服务器每月只有 1 TB 流量，4K 原图会被重复下载，所以原图改放私有的 R2 存储桶。下载接口照常验 key、扣积分，然后 302 跳转到 5 分钟有效的签名链接；预览图仍在服务器上，响应加了 `s-maxage`，由入口 Worker 缓存。

新增环境变量 `WALLPAPER_STORE_ENDPOINT`、`WALLPAPER_STORE_BUCKET`、`WALLPAPER_STORE_ACCESS_KEY_ID`、`WALLPAPER_STORE_SECRET_ACCESS_KEY`，四项都填才启用；不填时和以前一样存在本机。AWS 签名从 `operations/backup.ts` 移到 `packages/backend/src/lib/s3.ts`，备份上传共用它，并加了 AWS 文档示例值的测试。没有迁移，回滚旧版本时已经放进 R2 的原图无法下载，需要重新上传到本机。

上线时生产还没有上传过壁纸，没有要搬的文件。
