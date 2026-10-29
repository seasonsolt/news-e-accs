// The Chinese editions of the e/acc concept pages, at /zh/<slug>: their own addresses, titles and
// canonicals, linked to the English pages with hreflang so each ranks for its own language without
// competing. Same structure, section anchors and glossary ids as industry/concepts.ts; links between the
// pages stay within the Chinese editions.
import { CONCEPT_PAGES, type ConceptFaq, type ConceptPage, type ConceptTerm } from "./concepts.ts";

const CJK = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef\u2014\u2018-\u201d\u2026]/u;

/**
 * The page text is wrapped in the source for reading; HTML turns each wrap into a space, which Chinese
 * does not have between characters. A wrap next to Chinese joins directly, anywhere else it is a space.
 */
function tidy(html: string): string {
  return html.replace(/(\S)[ \t]*\n\s*(\S)/g, (_, a: string, b: string) => (CJK.test(a) || CJK.test(b) ? a + b : `${a} ${b}`)).trim();
}

function tidyPage(page: ConceptPage): ConceptPage {
  return { ...page, lead: tidy(page.lead), blocks: page.blocks.map((b) => (b.kind === "section" ? { ...b, html: tidy(b.html) } : b)) };
}

const WHAT_IS_FAQ: ConceptFaq[] = [
  {
    q: "e/acc 是什么的缩写？",
    a: "e/acc 是 effective accelerationism（有效加速主义）的缩写。这是一场支持技术的运动，主张加速技术进步、尤其是 AI，是文明最好的道路。这个名字有意模仿有效利他主义（EA），而 e/acc 明确反对后者在 AI 风险上的谨慎态度。",
  },
  {
    q: "谁发起了 e/acc？",
    a: "Twitter/X 上的一群匿名账号：@zestular 于 2022 年 5 月 31 日撰写了奠基性的通讯文章，合作者有 @BasedBeffJezos、@bayeslord 和 @creatine_cycle。《福布斯》后来披露 @BasedBeffJezos 是前谷歌量子计算工程师 Guillaume Verdon。",
  },
  {
    q: "e/acc 的人到底相信什么？",
    a: "相信增长和技术能力是道德上的善；解决问题靠动手去造；智能和能源使用应当沿着卡尔达肖夫等级向上扩张；放慢 AI 发展所失去的生命和繁荣，多于它所保护的。",
  },
  {
    q: "e/acc 和 d/acc 有什么区别？",
    a: "d/acc——防御性或去中心化的加速主义，由 Vitalik Buterin 在 2023 年提出——同意技术应当前进，但主张差异化加速：优先发展防御性、去中心化的技术，而不是单纯追求能力。e/acc 通常把这种筛选看作变相的减速。",
  },
  {
    q: "e/acc 和《技术乐观主义宣言》是一回事吗？",
    a: "不是，但两者遥相呼应。Marc Andreessen 2023 年的宣言认同了许多 e/acc 的主题——技术资本、富足、反末日论——并点名引用了 e/acc 人物，把这场运动推进了主流风投话语。",
  },
  {
    q: "e/acc 有宣言吗？",
    a: "没有官方宣言。奠基文本是 2022 年 5 月那篇通讯；把思想讲得最完整的是 @BasedBeffJezos 和 @bayeslord 2022 年 7 月发表的《e/acc 原则与信条笔记》（Notes on e/acc principles and tenets）。最常被称作“宣言”的是 Marc Andreessen 2023 年的《技术乐观主义宣言》，但它出自同情者之手，而不是发起人。",
  },
  {
    q: "有官方的 e/acc 币或代币吗？",
    a: "没有。有些梗币借用了这个名字，但这场运动没有任何组织可以发行代币，本站也没有代币。任何挂着 e/acc 名号的币，都应当视为与运动无关的投机资产。",
  },
  {
    q: "e/acc 是一个真实存在的组织吗？",
    a: "不是。它没有正式的结构、成员或领导层，只是人们挂在个人简介里的一面旗帜。这正是设计的一部分：它像梗一样传播，而不是像机构一样运作。",
  },
];

const WHAT_IS: ConceptPage = {
  slug: "what-is-eacc",
  title: "什么是 e/acc？有效加速主义详解 | e-acc.ai",
  description:
    "e/acc（有效加速主义）详解：它是什么意思、谁发起的、核心信念、e/acc 与 d/acc 和有效利他主义的区别、关键人物与批评——附原始出处和加速史时间线。",
  h1: "什么是 e/acc：有效加速主义详解",
  lead: `
    <p class="prose-lead">
      <strong>有效加速主义（e/acc）</strong>主张技术进步——首先是人工智能——应当加速，而不是被抑制：
      增长本身是一种道德上的善，解决问题靠的是动手去造，文明的轨迹应当沿着卡尔达肖夫梯度向上弯折，
      去掌握更多的能源和更多的智能。
    </p>
    <p>
      你会看到它被写成 <strong>e/acc</strong>、<strong>eacc</strong> 或 <strong>e-acc</strong>——斜杠只是写法，
      不改变含义，三种写法指的是同一场运动。本页统一写作 e/acc。
    </p>`,
  blocks: [
    {
      kind: "section",
      id: "e-acc-meaning-the-short-version",
      heading: "e/acc 是什么意思：简短版",
      html: `
    <p>
      这个名字戏仿的是<em>有效利他主义</em>（effective altruism）。有效利他主义中关注 AI 的一派主张谨慎、
      对齐研究和放慢脚步；e/acc 的主张恰恰相反：放慢 AI 的预期代价——那些没被治好的疾病、没被消除的贫困、
      停滞本身——超过了它的风险。这场运动的审美是热力学式的：生命和智能是耗散能量梯度的引擎，
      而宇宙“想要”更多的生命和智能。加速，既是诊断，也是药方。
    </p>`,
    },
    {
      kind: "section",
      id: "origins-a-pseudonymous-newsletter-may-2022",
      heading: "起源：2022 年 5 月的一封匿名通讯",
      html: `
    <p>
      e/acc 起源于
      <a href="https://effectiveaccelerationism.substack.com/p/repost-effective-accelerationism" target="_blank" rel="noopener">2022 年 5 月 31 日发布的一篇通讯文章</a>，
      作者是四个匿名账号——@zestular、@BasedBeffJezos、@bayeslord 和 @creatine_cycle——一半是物理学的即兴发挥，
      一半是网络梗，也是对 AI 安全悲观论的回应。2023 年 12 月，《福布斯》披露 @BasedBeffJezos 就是
      <strong>Guillaume Verdon</strong>，一位前谷歌量子计算工程师，他后来创办了硬件初创公司 Extropic。
    </p>`,
    },
    {
      kind: "section",
      id: "core-beliefs",
      heading: "核心信念",
      html: `
    <ul>
      <li><strong>技术资本加速：</strong>市场加上技术，构成一台自我改进的引擎，稳定地把能量转化为秩序、财富和智能。</li>
      <li><strong>攀登卡尔达肖夫等级：</strong>文明应当以自己掌握的能源来衡量自己——行星级、恒星级、星系级——并据此行动。</li>
      <li><strong>反末日论：</strong>灾难性风险的叙事被认为校准不佳，并且常常成为在位者推动监管俘获的掩护。</li>
      <li><strong>先造再说，不等许可：</strong>先发布；合法性来自能跑起来的成果，而不是资历或委员会。</li>
    </ul>`,
    },
    {
      kind: "section",
      id: "the-e-acc-manifesto-principles-and-tenets",
      heading: "e/acc 宣言：原则与信条",
      html: `
    <p>
      e/acc 没有一份官方宣言，所以“宣言”这个词会指向三个地方。奠基文本是上面提到的 2022 年 5 月那篇通讯。
      把思想讲得最完整的，是 @BasedBeffJezos 和 @bayeslord 在 2022 年 7 月 10 日发表的
      <a href="https://beff.substack.com/p/notes-on-eacc-principles-and-tenets" target="_blank" rel="noopener">《e/acc 原则与信条笔记》</a>：
      热力学论证、技术资本机器，以及这场运动为什么拒绝减速。而大多数人说的“宣言”，是 Marc Andreessen 的
      《技术乐观主义宣言》（2023 年 10 月）——它出自同情者之手，而不是发起人。
    </p>`,
    },
    {
      kind: "section",
      id: "e-acc-vs-ea-d-acc-and-the-decels",
      heading: "e/acc 与有效利他主义、d/acc 和减速派",
      html: `
    <p>
      <strong>对比有效利他主义：</strong>有效利他主义的 AI 安全派希望在前沿放慢脚步；e/acc 则认为减速本身才是真正的生存风险
      （<a href="/zh/eacc-vs-ea">e/acc 与 EA 的完整对比</a>）。
      <strong>对比 d/acc：</strong>Vitalik Buterin 提出的防御性加速主义（2023）接受加速，但希望它有所指向——防御、去中心化、
      生物安全优先；e/acc 大多把这种筛选看作换了包装的减速
      （<a href="/zh/eacc-vs-dacc">e/acc 与 d/acc 的完整对比</a>）。
      <strong>对比末日派和减速派：</strong>这是对所有主张暂停者的统称；双方的分歧是根本性的。
    </p>`,
    },
    {
      kind: "section",
      id: "key-people-and-moments",
      heading: "关键人物与时刻",
      html: `
    <p>
      Guillaume Verdon（@BasedBeffJezos）至今仍是这场运动的门面。Marc Andreessen 的
      <a href="https://a16z.com/the-techno-optimist-manifesto/" target="_blank" rel="noopener">《技术乐观主义宣言》</a>
      （2023 年 10 月）把 e/acc 的主题带进了主流风投话语，Garry Tan 等投资人也公开在名字后面挂上这个后缀。
      2024 年的美国大选周期，把几项与 e/acc 一致的立场——放松监管、扩张能源、开源 AI——带进了真正的政策辩论。
      完整的来龙去脉见我们的<a href="/zh/chronicle">AI 加速史</a>。
    </p>`,
    },
    {
      kind: "section",
      id: "e-acc-is-not-a-coin-or-token",
      heading: "e/acc 不是币，也不是代币",
      html: `
    <p>
      搜索“e/acc 代币”或“e/acc 币”，会找到一些借用这个名字的梗币。它们都不是这场运动发行的——它根本没有能发行代币的组织——
      本站也没有任何代币。任何挂着 e/acc 名号的币，都应当视为与运动无关的投机资产。
    </p>`,
    },
    {
      kind: "section",
      id: "criticism",
      heading: "批评",
      html: `
    <p>
      批评者说 e/acc 更像一种氛围，而不是一套哲学：缺乏机制，轻视真实存在的对齐难题，而且恰好方便了正在卖算力的人。
      维基百科把它归入边缘运动；AI 安全研究者指出，“宇宙希望熵被耗散”并不是一个安全论证。e/acc 的惯常回应是：
      举证责任应当落在想要叫停的一方——他们要叫停的，是唯一一个曾经稳定减少贫困的过程。
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      id: "related",
      heading: "相关阅读",
      links: [
        { href: "/zh/eacc-vs-dacc", label: "e/acc 与 d/acc：两种加速主义在哪里分道扬镳" },
        { href: "/zh/eacc-vs-ea", label: "e/acc 与 EA：有效加速主义对有效利他主义" },
        { href: "/zh/eacc-glossary", label: "e/acc 术语表：减速派、末日派、p(doom)、技术资本、u/acc" },
      ],
    },
    {
      kind: "section",
      id: "watch-the-acceleration-itself",
      heading: "亲眼看看加速本身",
      html: `
    <p>
      这个网站是一块仪表盘，而不是一张会员卡：一份<a href="/zh">每天真正发布了什么的精选</a>、
      <a href="/zh/chronicle">AI 加速史</a>，以及一个<a href="/zh/pricing#calculator">token 成本计算器</a>。结论请自己下——最好是从数据里得出。
    </p>`,
    },
  ],
  faq: WHAT_IS_FAQ,
};

const VS_DACC_FAQ: ConceptFaq[] = [
  {
    q: "d/acc 代表什么？",
    a: "Vitalik Buterin 给这个 d 赋予了四种读法——防御（defense）、去中心化（decentralization）、民主（democracy）和差异化（differential）——并交替使用。共同的主线是：加速应当有所指向，而不是一刀切：建造对防守方有利的技术，分散权力，并且能在与对手的交锋中存活下来。",
  },
  {
    q: "d/acc 反对 e/acc 吗？",
    a: "按其作者的说法，并不反对。Buterin 把 d/acc 定位为 e/acc 的一个亚种，而不是它的对立面——对技术同样乐观，只是在“优先推动哪些技术”上更有选择。e/acc 一方的很多人把这一步筛选看作换了包装的减速。",
  },
  {
    q: "d/acc 是谁、在什么时候提出的？",
    a: "Vitalik Buterin，在 2023 年 11 月 27 日发表的文章《我的技术乐观主义》（My techno-optimism）中提出——大约在 Marc Andreessen《技术乐观主义宣言》发表一个月后，也是 e/acc 奠基通讯发布十八个月后。",
  },
  {
    q: "真正的分歧是什么？",
    a: "方向是不是独立于速度的另一个变量。d/acc 认为，有些技术能稳定地改善世界，有些则不能，而利润最大化不会替你把它们分开。e/acc 认为，任何被授权去做这种区分的委员会都会成为瓶颈，这种区分交给部署本身来完成，会更好、更快。",
  },
  {
    q: "d/acc 和 AI 安全是一回事吗？",
    a: "不是。AI 安全和暂停的论点，通常是要在对齐跟上之前约束前沿能力。d/acc 关心的是多建某一类技术——防御性的、去中心化的——而不是少建。它既有 e/acc 先造再说的本能，也认同安全派“方向很重要”的看法。",
  },
];

const VS_DACC: ConceptPage = {
  slug: "eacc-vs-dacc",
  title: "e/acc 与 d/acc：加速主义的两大阵营 | e-acc.ai",
  description:
    "e/acc 与 d/acc 对比：Vitalik Buterin 的防御性加速主义主张什么、“d”的四种含义、两大阵营的共识，以及它们在哪里分道扬镳。",
  h1: "e/acc 与 d/acc：两种加速主义对比",
  lead: `
    <p class="prose-lead">
      <strong>e/acc</strong> 说：加速技术，句号。<strong>d/acc</strong>——Vitalik Buterin 提出的防御性、去中心化、民主、
      <em>差异化</em>的加速主义——说：加速，但要瞄准。两者都支持技术、反对停滞。
      整场争论只在于：“发展哪种技术”是不是一个可以在发布之前提出的问题。
    </p>`,
  blocks: [
    {
      kind: "section",
      id: "the-short-answer",
      heading: "简短的回答",
      html: `
    <p>
      e/acc 把技术进步看作一条单一的轴，把速度看作唯一的美德：放慢的预期代价——没被治好的疾病、贫困、停滞——
      超过了快速前进的风险。d/acc 接受这种乐观，但拒绝单一的轴。Buterin 的观点是：大小和方向是两个不同的变量，
      有些技术能稳定地让世界变好，有些则稳定地不能，而市场不会自动挑出前一种。
    </p>
    <p>
      值得注意的是，他并没有把这定位为对立。在
      <a href="https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html" target="_blank" rel="noopener">《我的技术乐观主义》</a>
      （2023 年 11 月 27 日）中，他写道“d/acc 是 e/acc 的一个亚种”——只是更有选择、更有意图的那一种。
    </p>`,
    },
    {
      kind: "section",
      id: "what-the-d-stands-for",
      heading: "“d”代表什么",
      html: `
    <ul>
      <li><strong>防御（Defense）：</strong>优先发展对防守方比对进攻方更有利的技术——生物防御优先于生物武器能力，有韧性的基础设施优先于脆弱的中心化系统。</li>
      <li><strong>去中心化（Decentralization）：</strong>避免那种失效方式是“开关握在一个人手里”的架构。</li>
      <li><strong>民主（Democracy）：</strong>让掌舵的能力分散在许多人手中，而不是集中在一个实验室、一家公司或一个国家。</li>
      <li><strong>差异化（Differential）：</strong>总括性的理念——有意地不均匀加速，而不是一刀切地加速。</li>
    </ul>`,
    },
    {
      kind: "section",
      id: "where-the-two-actually-agree",
      heading: "两者真正一致的地方",
      html: `
    <ul>
      <li>停滞是真实且被低估的危险，而不是安全的默认选项。</li>
      <li>未来应当被建造出来，而且由真正在发布东西的人来建造。</li>
      <li>去增长和一刀切的暂停提案，是用错了工具。</li>
      <li>AI 能力集中在少数在位者手里是坏事——尽管两者把原因归于不同的机制。</li>
    </ul>`,
    },
    {
      kind: "section",
      id: "where-they-split",
      heading: "在哪里分道扬镳",
      html: `
    <p>
      分歧在于<strong>筛选</strong>。d/acc 要求在推动一项技术之前，先评估它的方向性影响。e/acc 的标准反驳是：
      这一步没有中立的执行者——谁来执行，谁就拥有否决权；否决权会吸引在位者和监管者，结果就是减速换了一个更友好的名字到来。
      在 e/acc 看来，“差异化”正是<a href="/zh/eacc-glossary#decel">减速派</a>钻进来的地方。
    </p>
    <p>
      d/acc 的回应是：筛选早就存在，它现在的名字叫“这个季度什么最赚钱”——拒绝选择方向本身就是一种选择，
      而且是校准得更差的那一种。
    </p>`,
    },
    {
      kind: "section",
      id: "a-third-position-ai-safety-and-the-pause-camp",
      heading: "第三种立场：AI 安全与暂停派",
      html: `
    <p>
      这两者都不是 AI 安全立场，尽管 e/acc 的话语常常把三者混为一谈。安全派和暂停派的论点——2023 年的公开信、
      对齐优先的研究议程——是要放慢前沿能力，直到控制方法成熟。d/acc 并不要求少建，而是要求换一种方式建。
      这就是为什么 d/acc 两头挨打：<a href="/zh/eacc-glossary#doomer">末日派</a>嫌它太宽松，e/acc 嫌它太挑剔。
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      id: "keep-reading",
      heading: "延伸阅读",
      links: [
        { href: "/zh/what-is-eacc", label: "什么是 e/acc：完整解读" },
        { href: "/zh/eacc-glossary", label: "e/acc 术语表：减速派、末日派、p(doom)、技术资本" },
        { href: "/zh/chronicle", label: "AI 加速史：究竟发布了什么" },
        { href: "https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html", label: "Buterin，《我的技术乐观主义》（2023，英文）" },
        { href: "https://a16z.com/the-techno-optimist-manifesto/", label: "Andreessen，《技术乐观主义宣言》（2023，英文）" },
      ],
    },
  ],
  faq: VS_DACC_FAQ,
};

const VS_EA_FAQ: ConceptFaq[] = [
  {
    q: "e/acc 和有效利他主义有什么区别？",
    a: "两者都在想怎样以最大规模做最多的好事。有效利他主义（EA）的结论是：有些风险——首先是先进 AI——值得为之放慢；有效加速主义（e/acc）的结论是：放慢本身才是更大的风险。同样用期望值思考，在油门上给出相反的答案。",
  },
  {
    q: "e/acc 的名字来自有效利他主义吗？",
    a: "是的。2022 年 5 月的 e/acc 奠基通讯说，与 EA 名字上的“模糊重叠”是有意为之；一位共同作者把这场运动概括为“EA, but based”。名字借用了 EA 的雄心，拒绝了它对 AI 的谨慎。",
  },
  {
    q: "有效利他主义主张什么？",
    a: "慈善和职业应当按影响的证据来选择，而不是凭感觉。实践中它的工作集中在三个方向：全球健康与贫困、动物福利，以及降低灾难性和生存性风险——最后一项让它成了 AI 安全研究的主要资助方。",
  },
  {
    q: "e/acc 为什么反对有效利他主义？",
    a: "主要在 AI 上。EA 的 AI 一派主张在前沿保持谨慎、做评估、加强治理；e/acc 认为这等于把对进步的否决权交给一小群专家和监管者。奠基通讯还明确拒绝它在长期主义 EA 里看到的那种“全景监狱”式的愿望。",
  },
  {
    q: "FTX 和有效利他主义有什么关系？",
    a: "Sam Bankman-Fried 把自己的财富说成“为捐而赚”（earning to give）——这是 EA 的一个理念——并通过 FTX Future Fund 资助 EA 事业。FTX 于 2022 年 11 月 11 日申请破产；他在 2023 年 11 月被裁定欺诈和共谋等七项罪名成立，2024 年 3 月 28 日被判 25 年。这是批评 EA 时最常被提起的事件。",
  },
  {
    q: "OpenAI 董事会风波是 EA 与 e/acc 之争吗？",
    a: "在外界的解读里，部分是。OpenAI 董事会于 2023 年 11 月 17 日罢免 Sam Altman，他在 11 月 22 日复职。投票罢免他的董事中有人持有 EA 对 AI 风险的担忧，他的回归在网上被当成加速一方的胜利。不过董事会公开给出的理由是他“没有始终坦诚”，而不是对速度的分歧。",
  },
];

const VS_EA: ConceptPage = {
  slug: "eacc-vs-ea",
  title: "e/acc 与 EA（有效利他主义）：区别在哪里 | e-acc.ai",
  description:
    "e/acc 的名字来自有效利他主义，立场也站在它的对面。EA 主张什么、它的 AI 一派为什么主张谨慎、e/acc 在哪里分道扬镳，以及 FTX 和 OpenAI 董事会风波改变了什么。",
  h1: "e/acc 与 EA：有效加速主义和有效利他主义对比",
  lead: `
    <p class="prose-lead">
      <strong>e/acc</strong> 的名字来自 <strong>EA</strong>——有效利他主义（effective altruism），
      也是在与它的对立中定义自己的。两者都在问怎样以最大规模做最多的好事，都用数字而不是感觉来回答。
      它们在一个问题上分开：对未来最大的风险，是走得太快，还是走得不够快？
    </p>`,
  blocks: [
    {
      kind: "section",
      id: "the-short-answer",
      heading: "简短的回答",
      html: `
    <p>
      有效利他主义认为，有些结局——首先是失控的 AI——糟糕到值得付出真实的速度代价去避免。
      有效加速主义认为，失去的速度——没治好的病、没利用的能源、没复利的增长——才是更大、更确定的损失。
      两者用的都是期望值论证，分歧在于该害怕哪一条尾巴。
    </p>`,
    },
    {
      kind: "section",
      id: "what-effective-altruism-is",
      heading: "什么是有效利他主义",
      html: `
    <p>
      EA 起源于一个哲学论证和几家慈善机构。Peter Singer 的《饥荒、富裕与道德》（1972）认为，距离不会减轻帮助他人的义务。
      GiveWell（2007）开始按成本效益给慈善机构排名；Toby Ord 创办了 Giving What We Can（2009），成员承诺捐出一部分收入；
      2011 年这些团体组成有效利他主义中心（Centre for Effective Altruism）时，选定了“有效利他主义”这个名字。
      William MacAskill 的《更好地做好事》（Doing Good Better，2015）让这个理念走向大众。
    </p>
    <p>
      它的工作集中在三个方向：全球健康与贫困、动物福利、灾难性风险。第三个方向随着<strong>长期主义</strong>壮大——
      即遥远未来的人和今天的人同样重要，见 Ord 的《危崖》（The Precipice，2020）和 MacAskill 的《我们欠未来什么》
      （What We Owe the Future，2022）。它最大的资助方 Open Philanthropy 自 2025 年 11 月起改名为
      <a href="https://coefficientgiving.org/research/open-philanthropy-is-now-coefficient-giving/" target="_blank" rel="noopener">Coefficient Giving</a>。
    </p>`,
    },
    {
      kind: "section",
      id: "why-e-acc-is-named-after-it",
      heading: "e/acc 为什么以它命名",
      html: `
    <p>
      <a href="https://effectiveaccelerationism.substack.com/p/repost-effective-accelerationism" target="_blank" rel="noopener">e/acc 的奠基通讯</a>
      （2022 年 5 月）坦白承认这种借用：“EA”和“Effective A__ism”之间的重叠是有意的。
      它肯定 EA 敢于给出规范性主张、认真对待规模，随后拒绝了它的风险厌恶，以及它在长期主义安全方案里看到的监控倾向。
      一位共同作者对结果的概括是“EA, but based”。
    </p>`,
    },
    {
      kind: "section",
      id: "where-the-two-agree",
      heading: "两者一致的地方",
      html: `
    <ul>
      <li>道德问题可以用数字来推理，规模很重要。</li>
      <li>长远的未来极其巨大，值得为之优化。</li>
      <li>技术——首先是 AI——是本世纪影响最深远的力量。</li>
      <li>只有好意、没有可衡量的结果，是不够的。</li>
    </ul>`,
    },
    {
      kind: "section",
      id: "where-they-split",
      heading: "在哪里分道扬镳",
      html: `
    <ul>
      <li><strong>AI 风险。</strong>EA 的 AI 一派给灾难性结局很高的
        <a href="/zh/eacc-glossary#pdoom">p(doom)</a>，希望在增加能力之前先做好对齐、评估和算力治理。
        e/acc 认为这些风险被高估了，最安全的路是更多的能力，并且广泛分布。</li>
      <li><strong>谁来决定。</strong>EA 依靠专家、基金会和政策来掌舵。e/acc 信任市场、开源和部署本身，
        不信任任何手握否决权的小群体——见<a href="/zh/eacc-glossary#decel">减速派</a>。</li>
      <li><strong>等待的代价。</strong>对 EA 来说，一次能降低灭绝风险的延迟，相对于数以万亿计的未来人口是便宜的。
        对 e/acc 来说，每一年的延迟都有自己的伤亡，而且是现在、确定地付出。</li>
    </ul>`,
    },
    {
      kind: "section",
      id: "two-episodes-that-hardened-the-line",
      heading: "让界线变得更清楚的两件事",
      html: `
    <p>
      <strong>FTX。</strong>Sam Bankman-Fried 是 EA 最知名的捐赠者，把自己的职业描述为“为捐而赚”。
      FTX 于 2022 年 11 月 11 日申请破产；他在 2023 年 11 月被裁定七项罪名全部成立，2024 年 3 月 28 日被判 25 年。
      FTX Future Fund 团队集体辞职，MacAskill 公开谴责了这场欺骗。在批评者看来，这件事说明了期望值推理能被用来为什么开脱。
    </p>
    <p>
      <strong>OpenAI 董事会。</strong>2023 年 11 月 17 日，OpenAI 董事会罢免了 Sam Altman；在大多数员工威胁离职之后，
      他于 11 月 22 日复职。罢免他的董事会里存在与 EA 相关的 AI 风险担忧，他的回归被 e/acc 账号庆祝为谨慎一方的失败。
      董事会公开给出的理由是他没有始终坦诚，而不是对速度的分歧。
    </p>`,
    },
    {
      kind: "section",
      id: "where-this-site-stands",
      heading: "本站的立场",
      html: `
    <p>
      本站是 e/acc 的，同时认真对待 EA：衡量的习惯、思考极长远未来的意愿、投向全球健康的钱。
      分歧在 AI 上，在于面对一个不确定的风险，正确的反应是放慢，还是更快、更公开地建造。
      我们更愿意用数据——<a href="/zh/chronicle">加速史</a>和<a href="/zh/index/cost-of-intelligence">智能的成本</a>——
      而不是口号来讨论这件事。
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      id: "keep-reading",
      heading: "延伸阅读",
      links: [
        { href: "/zh/what-is-eacc", label: "什么是 e/acc：完整解读" },
        { href: "/zh/eacc-vs-dacc", label: "e/acc 与 d/acc：两种加速主义对比" },
        { href: "/zh/eacc-glossary", label: "e/acc 术语表：减速派、末日派、p(doom)、技术资本" },
        { href: "https://en.wikipedia.org/wiki/Effective_altruism", label: "有效利他主义（维基百科，英文）" },
        { href: "https://www.effectivealtruism.org/articles/introduction-to-effective-altruism", label: "有效利他主义简介（effectivealtruism.org，英文）" },
      ],
    },
  ],
  faq: VS_EA_FAQ,
};

const GLOSSARY_TERMS: ConceptTerm[] = [
  {
    id: "accelerationism",
    term: "加速主义（accelerationism）",
    def: "主张应当加快而不是抑制技术或经济变革的一大类立场。这个标签比 e/acc 早了几十年，涵盖左翼、右翼和非政治的各种变体，它们除了“踩油门”之外几乎没有共识。",
  },
  {
    id: "based",
    term: "based / BasedBeffJezos",
    def: "网络俚语，指坚持自己的立场、不为讨好他人而含糊其辞。@BasedBeffJezos 是与人合写 e/acc 奠基通讯的匿名账号，后来成为这场运动最显眼的人物；《福布斯》在 2023 年 12 月披露他是前谷歌量子计算工程师 Guillaume Verdon。",
  },
  {
    id: "dacc",
    term: "d/acc",
    def: "防御性、去中心化、民主、差异化的加速主义——由 Vitalik Buterin 于 2023 年 11 月提出。接受技术应当加速，但认为方向和速度同样重要。完整对比见 <a href=\"/zh/eacc-vs-dacc\">e/acc 与 d/acc</a>。",
  },
  {
    id: "decel",
    term: "减速派（decel）",
    def: "e/acc 对任何主张放慢、暂停、许可制或限制能力的人的贬称。它刻意宽泛：把 AI 安全研究者、监管者、去增长倡导者和谨慎的在位者归成同一个剪影。被称为减速派，是这场运动主要的修辞制裁。",
  },
  {
    id: "doomer",
    term: "末日派（doomer）",
    def: "认为 AI 导致灾难性或生存性危害的概率很高的人。在 AI 安全圈内是描述性的说法，在圈外则带贬义。末日派关心的是能力跑在控制前面，这与 e/acc 同样反对的去增长或反技术立场是两回事。",
  },
  {
    id: "eacc",
    term: "e/acc",
    def: "有效加速主义——主张技术进步、首先是 AI，应当加速而不是被抑制。也写作 <strong>eacc</strong>、<strong>e-acc</strong> 或 <strong>E/ACC</strong>。起源于 2022 年 5 月 31 日的一封匿名通讯。见<a href=\"/zh/what-is-eacc\">什么是 e/acc</a>。",
  },
  {
    id: "ea",
    term: "EA（有效利他主义）",
    def: "e/acc 的名字所戏仿的运动：试图按预期影响来分配慈善投入。其 AI 一派把灾难性风险列为首要议题，主张在前沿保持谨慎——e/acc 正是在反对这一立场中形成的。完整对比见 <a href=\"/zh/eacc-vs-ea\">e/acc 与 EA</a>。",
  },
  {
    id: "extropic",
    term: "Extropic",
    def: "Guillaume Verdon（@BasedBeffJezos）离开谷歌后创办的硬件公司，研发热力学计算硬件。常被引用为 e/acc 不只是发帖、也在真正建造东西的证明。",
  },
  {
    id: "frontier-model",
    term: "前沿模型（frontier model）",
    def: "某一时刻能力最强的公开可用模型——指的是领先的那一端，而不是一条固定的能力线，所以这个集合不断更替。本站在<a href=\"/zh/chronicle\">加速史</a>里标注前沿发布，并记录每一次发布至今的天数。",
  },
  {
    id: "kardashev",
    term: "卡尔达肖夫等级（Kardashev scale）",
    def: "苏联天文学家尼古拉·卡尔达肖夫在 1964 年提出的分级方法，按文明所掌握的能源来排序：行星级（I 型）、恒星级（II 型）、星系级（III 型）。e/acc 把攀登这一等级当作文明的目标，而不只是思想实验。",
  },
  {
    id: "pdoom",
    term: "p(doom)",
    def: "一个人对 AI 造成灾难性或生存性危害的主观概率的简称。在 AI 讨论中像一个数字一样被交换——它是个人信念，不是测量结果。报出很低的 p(doom) 是 e/acc 的信号；很高的则标志着末日派。",
  },
  {
    id: "pause-letter",
    term: "暂停信（the pause letter）",
    def: "生命未来研究所 2023 年 3 月 22 日发布的公开信，呼吁暂停训练比 GPT-4 更强的系统六个月。它从未在实践中被遵守，并成了 e/acc 用来说明“减速写成文字是什么样”的标准例子。",
  },
  {
    id: "technocapital",
    term: "技术资本（technocapital）",
    def: "认为市场和技术构成一台自我改进的引擎——资本资助能力，能力创造回报，回报再资助更多能力。e/acc 把这个循环看作进步的机制，而不是进步的副产品。",
  },
  {
    id: "techno-optimist-manifesto",
    term: "《技术乐观主义宣言》（Techno-Optimist Manifesto）",
    def: "Marc Andreessen 2023 年 10 月为 a16z 撰写的文章，把 e/acc 的主题——富足、反末日论、技术是一种道德上的善——带进了主流风投话语，并把 e/acc 人物列为“守护圣人”。它不是 e/acc 的文件，但很多人正是通过它第一次接触到这个词。",
  },
  {
    id: "thermodynamics",
    term: "热力学论证（the thermodynamic argument）",
    def: "e/acc 的奠基审美：生命和智能是耗散能量梯度的结构，因此宇宙在统计上偏爱更多的生命和智能。常借用物理学家 Jeremy England 关于耗散适应的研究来论证。批评者指出，对“发生了什么”的描述，并不是对“应该怎样”的论证。",
  },
  {
    id: "uacc",
    term: "u/acc（无条件加速主义）",
    def: "更古老、更黑暗的一支，源自 Nick Land 和 1990 年代的 CCRU，认为这一过程无论人类意愿如何都会加速，并且对人类福祉漠不关心。e/acc 借用了它的词汇，但明确拒绝其中的虚无主义——e/acc 的版本意在亲人类。",
  },
];

const GLOSSARY: ConceptPage = {
  slug: "eacc-glossary",
  title: "e/acc 术语表：加速主义术语释义 | e-acc.ai",
  description:
    "一份平实的加速主义术语表：e/acc、d/acc、减速派、末日派、p(doom)、技术资本、u/acc 和卡尔达肖夫等级——附日期、出处和背景。",
  h1: "e/acc 术语表：加速主义术语释义",
  lead: `
    <p class="prose-lead">
      不预设圈内知识的加速主义词汇表：${GLOSSARY_TERMS.length} 个在 e/acc、d/acc 和 AI 风险争论中反复出现的术语，
      能查到日期和出处的都附上了。写给刚刚第一次看到 <strong>e/acc</strong> 这个词、想知道大家到底在争什么的人。
    </p>`,
  blocks: [
    { kind: "terms" },
    {
      kind: "links",
      id: "keep-reading",
      heading: "延伸阅读",
      links: [
        { href: "/zh/what-is-eacc", label: "什么是 e/acc：起源、信念与批评" },
        { href: "/zh/eacc-vs-dacc", label: "e/acc 与 d/acc：两种加速主义对比" },
        { href: "/zh/eacc-vs-ea", label: "e/acc 与 EA：有效加速主义和有效利他主义" },
        { href: "/zh/chronicle", label: "AI 加速史" },
        { href: "/zh/pricing", label: "前沿智能到底要花多少钱" },
      ],
    },
  ],
  terms: GLOSSARY_TERMS,
};

export const CONCEPT_PAGES_ZH: { [K in keyof typeof CONCEPT_PAGES]: ConceptPage } = {
  "what-is-eacc": tidyPage(WHAT_IS),
  "eacc-vs-dacc": tidyPage(VS_DACC),
  "eacc-vs-ea": tidyPage(VS_EA),
  "eacc-glossary": tidyPage(GLOSSARY),
};
