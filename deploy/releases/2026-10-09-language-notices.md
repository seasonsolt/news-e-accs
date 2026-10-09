# 阅读页语言提示

英文界面不再常驻“English editions appear when available”说明。已就绪的译文正常阅读；文章和事件详情真正缺少有效英文版时，保留逐条 ContentLanguage 提示，放在 Deck 标题区后，避免 Deck 的负上边距遮住提示。

用户截图中的 OpenAI Intelligent UI 事件（`1ac43f48-6a97-4ae0-85da-3e4789431427`）已在生产保存有效英文版：当前公开 DTO、存储版与详情 API 的源 fingerprint 一致，英文标题、事件综述和进展标题均已就绪。本轮修正显示提示和布局，不再次调用模型或改动新闻内容。

本地浏览器确认英文详情和顶部正常布局。typecheck、web build 通过；网页测试 46 项，45 通过、1 个既有 skip。空库完整后台测试 197 项，模型安全阀关闭时 170 通过、27 个既有基线失败，无新增失败。部署须等待本提交 GitHub Check 通过，再运行 deploy/update.sh 的版本健康检查与完整 smoke。无迁移、配置或生产数据修改。
