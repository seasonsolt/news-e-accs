// 可选模块：关掉 timeMachine 或 eaccConcepts 以后，导航里不再出现入口，对应页面返回 404。
// cosmos3d 只关掉加速史里的三维航行，页面本身还在。

export const FEATURES = {
  /**
   * 时光机（四维视角）：/chronicle 的文明时间轴（数据在 industry/chronicle/，换行业时换成你的或关掉），
   * 以及全站 ?at=日期：精选、热点榜、模型榜、日报回到那一天。不调用模型，不产生费用。
   */
  timeMachine: true,
  /**
   * 加速史观测舱里的三维航行。关掉以后 /chronicle 仍是平面时间轴，不返回 404。
   * 桌面且有 WebGL2、未要求减少动效时默认打开；手机、无 WebGL2 或减少动效时保持平面。
   * 三维脚本按需加载，不进首屏。
   */
  cosmos3d: true,
  /**
   * e/acc 概念页：/what-is-eacc、/eacc-vs-dacc、/eacc-glossary（内容在 industry/concepts.ts，英文正文）。
   * 从 e-acc.ai 的静态工具站搬来，网址和正文不变；别的站点设为 false。
   */
  eaccConcepts: true,
} as const;
