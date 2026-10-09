# 持续英文补译

首页热点读取译文的修复已在 `83204c2` 发布；本次混入原文是新稿与事件编辑改变了内容 fingerprint，旧译文不能继续使用。生产公开内容重新导出后补译并验证导入 19 个 edition（10 item、9 story），2026-10-09 重扫结果为 1715 条全部就绪；这是当时快照，后续内容仍会变化。

本次修复 `content.localize` 队列：每 5 分钟运行，默认最多翻译 5 个需要补译的 edition。优先当前热点及最新公开条目，保留历史队列名额；已完成候选不消耗名额，扫描跨页且同轮回绕，断点停在实际处理条目，失败不推进。读者请求只读取已存译文，排队或版本变化期间仍可能暂时显示原文。

运营者已明确授权启用生产 `CONTENT_TRANSLATION_ENABLED=true` 并接受既有预算内费用。发布时私密备份 `/srv/eacc/.env`，仅修改此开关，重启 worker 后核对进程配置和任务运行。翻译沿用现有 API 模型 `deepseek-flash`、调用回执和按请求数量的额度熔断；不另设或声称已有货币费用上限。离线 19 条由 gpt-6-luna 生成，未伪造 provider 回执。

验证：typecheck、web build 通过；web tests 46 项（45 通过、1 个既有 skip）；新增队列测试 8 项通过，含本地 HTTP 回执复用与真实数据库公开候选校验。空库完整 backend tests 196 项，169 通过，27 个失败与关闭模型安全阀时既有基线名称完全一致，无新增失败。开发检查均保持采集、模型、推送和 IndexNow 安全阀关闭。生产发布须等待该提交 GitHub `Check` 全部通过，再运行 `deploy/update.sh` 的健康检查与 smoke。

代码回退可使用 `deploy/update.sh --rollback`；共享 `.env` 不随代码回退。如需同时停止补译，应恢复此开关为 false 并重启 worker。无需数据库迁移或数据回退。

首次生产验证：`7a72eea` 经 GitHub Check、部署健康检查与 smoke 后上线，worker 进程两个补译开关均为 true；`cron.content.localize` 注册为 `*/5 * * * *`。真实任务成功扫描 1717 条并用现有 API 补译 2 条，随后权威重扫 1717 条全部就绪。公网及本地热点五条均为英文，公网 changelog 的标题、内容与筛选标签均为英文。

该实测发现 provider 版已存库但回执尚停留 received；本次追加修正将回执完成状态与 edition 写入放在同一事务，源版本校验失败不完成回执。新增第 9 项本地 HTTP/数据库测试验证 dry-run、源变更、事务回滚和离线导入的边界，9/9 通过，typecheck 通过。已经存版的历史 received 回执可依据 provider edition 的 receipt_ids 核验后补记完成，不重新调用模型。

首次 GitHub Check 的后台测试为 196/196 通过；本地关闭模型阀门的 27 个基线失败来自既有本地 stub 依赖该阀门。追加回执修正仍须等待其提交的完整 GitHub Check 再发布。
