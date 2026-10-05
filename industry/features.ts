// 可选模块。它们只对 AI 行业有意义：做别的行业时两项都设为 false，或者按 docs/customize.md 整块删掉。
// 关掉以后：导航里不再出现入口，对应的定时任务不再运行，页面与接口返回 404。

export const FEATURES = {
  /** 模型榜：汇总公开评测，按公开方法 v15 计算共识排名（/leaderboard）。每天抓 4 次评测来源。 */
  leaderboard: true,
  /**
   * Codex 重置监控：盯 OpenAI Codex 负责人在 X 上的额度重置公告（/codex-reset）。需要 SocialData。
   * 关闭（2026-10-01）：它每分钟搜一次 X，约每月 $34，而这个站不再需要它。
   */
  codexResetMonitor: false,
  /**
   * 时光机（四维视角）：/chronicle 的文明时间轴（数据在 industry/chronicle/，换行业时换成你的或关掉），
   * 以及全站 ?at=日期：精选、热点榜、模型榜、日报回到那一天。不调用模型，不产生费用。
   */
  timeMachine: true,
} as const;
