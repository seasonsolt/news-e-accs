# 2026-11-02：英文摘要与 X 采集恢复

英文摘要里出现原文已有的中文名称（例如“嘉立创”）时，语言检查曾把整段摘要清空，文章因此停在 unknown。
现在只允许在英文占绝大多数、且原文确实出现该名称时保留它。未在材料里出现的名称、中文正文和主体身份检查仍会拦截。
评分、精选门槛和事件日期规则没有更改。

## 已有内容恢复

`2026-11-02-restore-written-copies.ts` 默认只读，扫描这次排查的 30 天窗口。
它只处理当前修订、预筛 PASS、英文写作完成但标题或摘要被清空的内容；重用已完成的写作回执、双评分和结构化结果，
新增 replay 分析并经正常发布层更新公开投影，不修改历史分析或人工更正。等待归组的内容交回原有 worker 队列。
每条恢复写入 audit_log；重复执行会跳过已恢复的条目。执行 `--apply` 前备份 eacc 数据库。

```bash
node --env-file=/srv/eacc/.env deploy/releases/2026-11-02-restore-written-copies.ts
node --env-file=/srv/eacc/.env deploy/releases/2026-11-02-restore-written-copies.ts --apply
```

本地原始回答回放识别到 20 篇可恢复内容，其中 2 篇达到其原有精选门槛；精选仍需通过正常归组确认。
无需数据库迁移、新环境变量或重新评分。

## X 采集

使用者取消 Grok bot 订阅后，按 deploy/README.md 的原有回滚步骤，将生产 `X_PUSH_ONLY` 改为 `false`，
重启 API 和 worker。SocialData 密钥仍有效，沿用原预算：每分钟 20、每小时 150、每天 500 次。
保留现有信源、推送内容、搜索水位和去重身份，按原定时任务续采；无需改信源名单或重建采集机制。
