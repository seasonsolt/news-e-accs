// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "e/acc",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "AI",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "e/acc — Daily AI Briefing, News & Trends",
  /** 首页的 h1：读者会搜的说法（行业词 + 日报/新闻/热点），首页大字标语只是装饰。 */
  homeHeading: "Today’s AI news: editorial picks and emerging stories",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "e/acc follows AI news across hundreds of sources, selects the stories that matter, groups related coverage, and delivers a daily briefing.",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "AI news at the pace of progress",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "en",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "https://e-acc.ai",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 eacc_get_latest、eacc_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "eacc",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "Built on open-source software",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "e/acc",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "EaccNewsBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `About ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["The engines never stop.", "The stories that matter are few."] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} follows {sources} sources for you: collecting, grouping, scoring, and selecting the news for a daily briefing. Free to read, with no account required.`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "We follow official blogs, news outlets, X accounts, WeChat publications, and feeds. Active sources are checked every 15 minutes.",
    store: "Coverage is stored and grouped by event. Sources that contribute only to trend signals also help shape the hot-topic ranking.",
    select: "Models check relevance and substance, then produce English headlines, summaries, and editorial recommendations. Marketing filler and duplicate reposts are filtered out.",
    publish: "Read a daily briefing, a weekly review on Mondays, and a monthly review on the first of each month. Selected stories can also be delivered to configured Feishu groups.",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} provides aggregated summaries and a reading index. Copyright remains with the original sources. If you represent a source and would like a correction, removal, or display change, please use our`,
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
