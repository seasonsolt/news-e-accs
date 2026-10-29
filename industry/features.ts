// 可选模块：关掉以后，导航里不再出现入口，对应页面返回 404。

export const FEATURES = {
  /**
   * 时光机（四维视角）：/chronicle 的文明时间轴（数据在 industry/chronicle/，换行业时换成你的或关掉），
   * 以及全站 ?at=日期：精选、热点榜、模型榜、日报回到那一天。不调用模型，不产生费用。
   */
  timeMachine: true,
  /**
   * e/acc 概念页：/what-is-eacc、/eacc-vs-dacc、/eacc-vs-ea、/eacc-glossary（内容在 industry/concepts.ts，
   * 中文版在 concepts-zh.ts）。/eacc-vs-ea 是本站新写的，其余三页从 e-acc.ai 的静态工具站搬来，网址和正文不变；别的站点设为 false。
   */
  eaccConcepts: true,
} as const;
