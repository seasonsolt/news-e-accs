// The e/acc concept pages: /what-is-eacc, /eacc-vs-dacc and /eacc-glossary moved here from the static
// tool site with their URLs, text and markup, and /eacc-vs-ea written here. They rank for "e/acc" in
// English search; titles and descriptions change only on Search Console evidence (2026-10: /what-is-eacc
// sat around position 8 for "e/acc" with a 0.2% click rate, so its title and description lead with the
// meaning now).
// Bodies are trusted HTML written here, rendered as English whatever the interface language.

/** The movement itself, linked to its Wikipedia and Wikidata entries in every page's structured data. */
export const EACC_ENTITY = {
  "@type": "Thing",
  name: "Effective accelerationism",
  alternateName: ["e/acc", "eacc", "e-acc", "E/ACC"],
  sameAs: [
    "https://en.wikipedia.org/wiki/Effective_accelerationism",
    "https://www.wikidata.org/wiki/Q123509272",
    "https://effectiveaccelerationism.substack.com/p/repost-effective-accelerationism",
  ],
};

/** The anchor of a section: its English heading, "Where they split" → "where-they-split". */
export function anchorOf(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface ConceptFaq {
  q: string;
  a: string;
}

export interface ConceptTerm {
  /** Stable anchor: other pages deep-link to /eacc-glossary#<id>. */
  id: string;
  term: string;
  /** HTML. */
  def: string;
}

export interface ConceptLink {
  href: string;
  label: string;
}

/**
 * A page's body in reading order: prose sections, the FAQ, the glossary's terms and link lists. A section's
 * anchor is made from its English heading; translations give the same `id` so links work in both.
 */
export type ConceptBlock =
  | { kind: "section"; heading: string; html: string; id?: string }
  | { kind: "faq" }
  | { kind: "terms" }
  | { kind: "links"; heading: string; links: ConceptLink[]; id?: string };

export interface ConceptPage {
  slug: "what-is-eacc" | "eacc-vs-dacc" | "eacc-vs-ea" | "eacc-glossary";
  /** The document title, verbatim (it keeps the old " | e-acc.ai" suffix). */
  title: string;
  description: string;
  h1: string;
  /** Opening paragraphs, HTML. */
  lead: string;
  blocks: ConceptBlock[];
  faq?: ConceptFaq[];
  terms?: ConceptTerm[];
}

const WHAT_IS_FAQ: ConceptFaq[] = [
  {
    q: "What does e/acc stand for?",
    a: "e/acc is short for effective accelerationism — a pro-technology movement holding that accelerating technological progress, especially AI, is the best path for civilization. The name is a deliberate riff on effective altruism (EA), whose caution about AI risk e/acc explicitly rejects.",
  },
  {
    q: "Who started e/acc?",
    a: "A pseudonymous group on Twitter/X: @zestular authored the founding newsletter post on May 31, 2022, together with @BasedBeffJezos, @bayeslord and @creatine_cycle. Forbes later identified @BasedBeffJezos as Guillaume Verdon, a former Google quantum computing engineer.",
  },
  {
    q: "What do e/acc people actually believe?",
    a: "That growth and technological capability are moral goods; that building is how problems get solved; that intelligence and energy use should expand up the Kardashev scale; and that slowing AI development costs more lives and prosperity than it protects.",
  },
  {
    q: "What is the difference between e/acc and d/acc?",
    a: "d/acc — defensive or decentralized accelerationism, proposed by Vitalik Buterin in 2023 — agrees technology should advance but wants differential acceleration: prioritize defensive, decentralizing technologies over raw capability. e/acc generally rejects that filtering as decel in disguise.",
  },
  {
    q: "Is e/acc the same as the Techno-Optimist Manifesto?",
    a: "No, but they rhyme. Marc Andreessen's 2023 manifesto endorsed many e/acc themes — techno-capital, abundance, anti-doom — and cited e/acc figures, which pushed the movement into mainstream venture discourse.",
  },
  {
    q: "Is there an e/acc manifesto?",
    a: "Not an official one. The founding text is the May 2022 newsletter post; the fullest statement of its ideas is \"Notes on e/acc principles and tenets\" (July 2022) by @BasedBeffJezos and @bayeslord. Marc Andreessen's Techno-Optimist Manifesto (2023) is the document most often called the manifesto, but it was written by a sympathizer, not by the founders.",
  },
  {
    q: "Is there an official e/acc coin or token?",
    a: "No. Meme tokens borrow the name, but the movement has no organization that could issue one, and this site has no token. Treat any e/acc-branded coin as an unaffiliated speculative asset.",
  },
  {
    q: "Is e/acc a real organization?",
    a: "No. It has no formal structure, membership, or leadership — it is a banner people put in their bio. That is part of the design: it spreads as a meme, not as an institution.",
  },
];

const WHAT_IS: ConceptPage = {
  slug: "what-is-eacc",
  title: "e/acc Meaning: What Is Effective Accelerationism? | e-acc.ai",
  description:
    "e/acc means effective accelerationism: the view that AI and technology should be sped up, not slowed. Origins, core beliefs, e/acc vs d/acc, criticism — with sources.",
  h1: "What is e/acc — effective accelerationism, explained",
  lead: `
    <p class="prose-lead">
      <strong>Effective accelerationism (e/acc)</strong> is the position that technological
      progress — artificial intelligence above all — should be accelerated rather than
      restrained: growth is a moral good, building is how problems get solved, and
      civilization's trajectory should bend up the Kardashev gradient, toward commanding
      more energy and more intelligence.
    </p>
    <p>
      You will see it written <strong>e/acc</strong>, <strong>eacc</strong> or
      <strong>e-acc</strong> — the slash is styling, not meaning, and all three name the
      same movement. This page uses e/acc throughout.
    </p>`,
  blocks: [
    {
      kind: "section",
      heading: "e/acc meaning: the short version",
      html: `
    <p>
      The name parodies <em>effective altruism</em>. Where EA's AI wing argues for caution,
      alignment research and slowdowns, e/acc argues the opposite: the expected cost of
      slowing AI — in unsolved disease, poverty and stagnation — exceeds its risks. The
      movement's aesthetic is thermodynamic: life and intelligence are engines for
      dissipating energy gradients, and the universe "wants" more of both. Accelerate is
      both the diagnosis and the prescription.
    </p>`,
    },
    {
      kind: "section",
      heading: "Origins: a pseudonymous newsletter, May 2022",
      html: `
    <p>
      e/acc began as a
      <a href="https://effectiveaccelerationism.substack.com/p/repost-effective-accelerationism" target="_blank" rel="noopener">newsletter post published on May 31, 2022</a>
      by four pseudonymous accounts — @zestular, @BasedBeffJezos, @bayeslord and
      @creatine_cycle — part physics riff, part meme, part reaction to AI-safety pessimism.
      In December 2023, Forbes identified @BasedBeffJezos as
      <strong>Guillaume Verdon</strong>, a former Google quantum computing engineer who went
      on to found the hardware startup Extropic.
    </p>`,
    },
    {
      kind: "section",
      heading: "Core beliefs",
      html: `
    <ul>
      <li><strong>Techno-capital acceleration:</strong> markets plus technology form a self-improving engine that reliably converts energy into order, wealth and intelligence.</li>
      <li><strong>Kardashev climbing:</strong> civilization should measure itself by the energy it commands — planetary, stellar, galactic — and act accordingly.</li>
      <li><strong>Anti-doom:</strong> catastrophic-risk narratives are treated as poorly calibrated and as cover for regulatory capture by incumbents.</li>
      <li><strong>Building over permission:</strong> ship first; legitimacy comes from working artifacts, not credentials or committees.</li>
    </ul>`,
    },
    {
      kind: "section",
      heading: "The e/acc manifesto: principles and tenets",
      html: `
    <p>
      There is no single official manifesto, which is why the word points three ways. The
      founding text is the May 2022 newsletter post above. The fullest statement of the ideas
      is
      <a href="https://beff.substack.com/p/notes-on-eacc-principles-and-tenets" target="_blank" rel="noopener">Notes on e/acc principles and tenets</a>
      (July 10, 2022) by @BasedBeffJezos and @bayeslord: the thermodynamic argument, the
      techno-capital machine, and why the movement refuses to slow down. And the document most
      people mean by "the manifesto" is Marc Andreessen's Techno-Optimist Manifesto
      (October 2023) — written by a sympathizer, not by the founders.
    </p>`,
    },
    {
      kind: "section",
      heading: "e/acc vs EA, d/acc and the decels",
      html: `
    <p>
      <strong>vs effective altruism:</strong> EA's AI-safety wing wants to slow down at the
      frontier; e/acc holds that deceleration is the actual existential risk
      (<a href="/eacc-vs-ea">the full e/acc vs EA comparison</a>).
      <strong>vs d/acc:</strong> Vitalik Buterin's defensive accelerationism (2023) accepts
      acceleration but wants it aimed — defense, decentralization, biosecurity first; e/acc
      mostly reads the filtering as decel with better branding
      (<a href="/eacc-vs-dacc">the full e/acc vs d/acc comparison</a>).
      <strong>vs doomers/decels:</strong> the catch-all label for pause advocates; the
      disagreement is total.
    </p>`,
    },
    {
      kind: "section",
      heading: "Key people and moments",
      html: `
    <p>
      Guillaume Verdon (@BasedBeffJezos) remains the movement's face. Marc Andreessen's
      <a href="https://a16z.com/the-techno-optimist-manifesto/" target="_blank" rel="noopener">Techno-Optimist Manifesto</a>
      (October 2023) carried e/acc themes into mainstream venture discourse, and investors
      like Garry Tan wore the suffix publicly. The 2024 U.S. election cycle pulled several
      e/acc-aligned positions — deregulation, energy expansion, open-source AI — into
      actual policy debate. The full sequence lives on our
      <a href="/chronicle">AI acceleration timeline</a>.
    </p>`,
    },
    {
      kind: "section",
      heading: "e/acc is not a coin or token",
      html: `
    <p>
      Searches for an "e/acc token" or "e/acc coin" find meme tokens that borrow the name.
      None is issued by the movement — it has no organization to issue one — and this site
      has no token either. Treat any e/acc-branded coin as an unaffiliated speculative asset.
    </p>`,
    },
    {
      kind: "section",
      heading: "Criticism",
      html: `
    <p>
      Critics call e/acc a vibe more than a philosophy: thin on mechanism, dismissive of
      genuine alignment problems, and convenient for whoever is currently selling compute.
      Wikipedia files it under fringe movements; AI-safety researchers note that "the
      universe wants entropy dissipated" is not a safety argument. e/acc's usual reply:
      the burden of proof sits with whoever wants to stop the only process that has ever
      reliably reduced poverty.
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      heading: "Related",
      links: [
        { href: "/eacc-vs-dacc", label: "e/acc vs d/acc — where the two accelerationisms split" },
        { href: "/eacc-vs-ea", label: "e/acc vs EA — effective accelerationism against effective altruism" },
        { href: "/eacc-glossary", label: "e/acc glossary — decel, doomer, p(doom), technocapital, u/acc" },
      ],
    },
    {
      kind: "section",
      heading: "Watch the acceleration itself",
      html: `
    <p>
      This site is an instrument panel, not a membership card: a
      <a href="/">daily feed of what actually shipped</a>, the
      <a href="/chronicle">frontier release timeline</a> and a
      <a href="/pricing#calculator">token cost calculator</a>. Draw your own conclusions —
      preferably from data.
    </p>`,
    },
  ],
  faq: WHAT_IS_FAQ,
};

const VS_DACC_FAQ: ConceptFaq[] = [
  {
    q: "What does d/acc stand for?",
    a: "Vitalik Buterin gave the d four readings — defense, decentralization, democracy and differential — and uses them interchangeably. The common thread is that acceleration should be aimed, not uniform: build the technologies that favour defenders, distribute power, and survive contact with adversaries.",
  },
  {
    q: "Is d/acc anti-e/acc?",
    a: "Not by its author's account. Buterin framed d/acc as a subspecies of e/acc rather than its opposite — same optimism about technology, narrower selection of which technologies to push hardest. Much of the e/acc side reads that selection step as deceleration with better branding.",
  },
  {
    q: "Who coined d/acc and when?",
    a: "Vitalik Buterin, in the essay \"My techno-optimism\" published on 27 November 2023 — about a month after Marc Andreessen's Techno-Optimist Manifesto and eighteen months after the founding e/acc newsletter.",
  },
  {
    q: "What is the actual disagreement?",
    a: "Whether direction is a separate variable from speed. d/acc says some technologies reliably improve the world and others do not, and that profit maximization will not sort them for you. e/acc says any committee empowered to sort them becomes the bottleneck, and that the sorting is done better and faster by deployment.",
  },
  {
    q: "Is d/acc the same as AI safety?",
    a: "No. AI-safety and pause arguments are usually about restraining frontier capability until alignment catches up. d/acc is about building more of a particular kind of technology — defensive, decentralizing — rather than building less. It shares e/acc's build-first instinct and the safety camp's belief that direction matters.",
  },
];

const VS_DACC: ConceptPage = {
  slug: "eacc-vs-dacc",
  title: "e/acc vs d/acc: What's the Difference? | e-acc.ai",
  description:
    "e/acc says accelerate technology, full stop; d/acc, Vitalik Buterin's 2023 idea, says accelerate but aim at defense and decentralization. Where the two camps agree and split.",
  h1: "e/acc vs d/acc — the two accelerationisms, compared",
  lead: `
    <p class="prose-lead">
      <strong>e/acc</strong> says accelerate technology, full stop.
      <strong>d/acc</strong> — Vitalik Buterin's defensive, decentralizing,
      democratic, <em>differential</em> accelerationism — says accelerate, but aim.
      Both are pro-technology and anti-stagnation. The whole argument is about whether
      "which technology" is a question you are allowed to ask before shipping.
    </p>`,
  blocks: [
    {
      kind: "section",
      heading: "The short answer",
      html: `
    <p>
      e/acc treats technological progress as a single axis and speed as the only
      virtue: the expected cost of slowing down — unsolved disease, poverty, stagnation —
      exceeds the risks of moving fast. d/acc accepts the optimism and rejects the single
      axis. Buterin's claim is that magnitude and direction are different variables, that
      some technologies reliably leave the world better and others reliably do not, and
      that markets will not automatically pick the first kind.
    </p>
    <p>
      Notably, he did not position this as opposition. In
      <a href="https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html" target="_blank" rel="noopener">My techno-optimism</a>
      (27 November 2023) he wrote that "d/acc is a subspecies of e/acc" — just a more
      selective and intentional one.
    </p>`,
    },
    {
      kind: "section",
      heading: "What the \"d\" stands for",
      html: `
    <ul>
      <li><strong>Defense:</strong> favour technologies that help defenders more than attackers — biodefense over bioweapons capability, resilient infrastructure over brittle centralized systems.</li>
      <li><strong>Decentralization:</strong> avoid architectures whose failure mode is one actor holding the switch.</li>
      <li><strong>Democracy:</strong> keep the ability to steer distributed across many people rather than concentrated in a lab, a firm or a state.</li>
      <li><strong>Differential:</strong> the umbrella idea — accelerate unevenly, on purpose, rather than uniformly.</li>
    </ul>`,
    },
    {
      kind: "section",
      heading: "Where the two actually agree",
      html: `
    <ul>
      <li>Stagnation is a real and underrated danger, not a safe default.</li>
      <li>The future should be built, and built by people who ship.</li>
      <li>Degrowth and blanket pause proposals are the wrong instrument.</li>
      <li>Concentration of AI capability in a few incumbents is bad — though they blame different mechanisms for it.</li>
    </ul>`,
    },
    {
      kind: "section",
      heading: "Where they split",
      html: `
    <p>
      The split is over the <strong>filter</strong>. d/acc requires a step where you
      evaluate a technology's directional effect before pushing it. e/acc's standard
      objection is that this step has no neutral operator: whoever performs it acquires
      veto power, veto power attracts incumbents and regulators, and the result is
      deceleration arriving under a friendlier name. On the e/acc reading, "differential"
      is where <a href="/eacc-glossary#decel">decel</a> gets in.
    </p>
    <p>
      The d/acc reply is that the filter already exists and is currently called
      "whatever is most profitable this quarter" — that declining to choose a direction
      is itself a choice, and a worse-calibrated one.
    </p>`,
    },
    {
      kind: "section",
      heading: "A third position: AI safety and the pause camp",
      html: `
    <p>
      Neither of these is the AI-safety position, though e/acc rhetoric often collapses
      all three. The safety and pause arguments — the 2023 open letter, alignment-first
      research agendas — are about slowing frontier capability until control methods
      mature. d/acc does not ask for less building; it asks for different building.
      That is why d/acc gets attacked from both sides: too permissive for
      <a href="/eacc-glossary#doomer">doomers</a>, too fussy for e/acc.
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      heading: "Keep reading",
      links: [
        { href: "/what-is-eacc", label: "what is e/acc — the full explainer" },
        { href: "/eacc-glossary", label: "e/acc glossary: decel, doomer, p(doom), technocapital" },
        { href: "/chronicle", label: "the AI acceleration timeline — what actually shipped" },
        { href: "https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html", label: "Buterin, My techno-optimism (2023)" },
        { href: "https://a16z.com/the-techno-optimist-manifesto/", label: "Andreessen, The Techno-Optimist Manifesto (2023)" },
      ],
    },
  ],
  faq: VS_DACC_FAQ,
};

const VS_EA_FAQ: ConceptFaq[] = [
  {
    q: "What is the difference between e/acc and effective altruism?",
    a: "Both reason about doing the most good at the largest scale. Effective altruism (EA) concludes that some risks, advanced AI above all, are worth slowing down for; effective accelerationism (e/acc) concludes that slowing down is itself the larger risk. Same habit of thinking in expected value, opposite answer on the throttle.",
  },
  {
    q: "Is e/acc named after effective altruism?",
    a: "Yes. The founding e/acc newsletter of May 2022 says the \"fuzzy overloading\" of EA is intentional, and a co-author summed the movement up as \"EA, but based\". The name borrows EA's ambition and rejects its caution about AI.",
  },
  {
    q: "What does effective altruism believe?",
    a: "That charity and careers should be chosen by evidence of impact rather than by feeling. In practice its work clusters in three areas: global health and poverty, animal welfare, and reducing catastrophic and existential risks — the last of which made it the main funder of AI-safety research.",
  },
  {
    q: "Why does e/acc oppose effective altruism?",
    a: "Mainly over AI. EA's AI wing argues for caution, evaluation and governance at the frontier; e/acc sees that as handing a veto over progress to a small group of experts and regulators. The founding post also rejects \"the desire for a panopticon\" it reads into longtermist EA.",
  },
  {
    q: "What did FTX have to do with effective altruism?",
    a: "Sam Bankman-Fried presented his fortune as \"earning to give\", an EA idea, and funded EA causes through the FTX Future Fund. FTX filed for bankruptcy on 11 November 2022; he was convicted on seven counts of fraud and conspiracy in November 2023 and sentenced to 25 years on 28 March 2024. The collapse is the episode most often cited against EA.",
  },
  {
    q: "Was the OpenAI board crisis an EA versus e/acc fight?",
    a: "Partly, in how it was read. OpenAI's board removed Sam Altman on 17 November 2023 and he was back on 22 November. Board members who voted him out shared EA's concerns about AI risk, and his return was celebrated online as a win for acceleration. The board's stated reason was that he had not been consistently candid, not a dispute over speed.",
  },
];

const VS_EA: ConceptPage = {
  slug: "eacc-vs-ea",
  title: "e/acc vs EA (Effective Altruism): What's the Difference? | e-acc.ai",
  description:
    "e/acc took its name from effective altruism and its stance against it. What EA believes, why its AI wing urges caution, where e/acc splits off, and what FTX and the OpenAI board changed.",
  h1: "e/acc vs EA — effective accelerationism and effective altruism, compared",
  lead: `
    <p class="prose-lead">
      <strong>e/acc</strong> is named after <strong>EA</strong>, effective altruism, and
      defined against it. Both ask how to do the most good at the largest scale, and both
      answer with numbers rather than feelings. They part on one question: is the biggest
      risk to the future moving too fast, or not moving fast enough?
    </p>`,
  blocks: [
    {
      kind: "section",
      heading: "The short answer",
      html: `
    <p>
      Effective altruism treats some outcomes, misaligned AI above all, as so bad that
      avoiding them is worth real costs in speed. Effective accelerationism treats the cost
      of speed lost — disease not cured, energy not harnessed, growth not compounded — as the
      larger and more certain loss. Both run expected-value arguments; they disagree about
      which tail to fear.
    </p>`,
    },
    {
      kind: "section",
      heading: "What effective altruism is",
      html: `
    <p>
      EA grew out of a philosophical argument and a few charities. Peter Singer's
      <em>Famine, Affluence, and Morality</em> (1972) argued that distance does not reduce
      the duty to help. GiveWell (2007) began ranking charities by cost-effectiveness;
      Toby Ord founded Giving What We Can (2009), whose members pledge a share of their
      income; the name <em>effective altruism</em> was chosen in 2011 when these groups
      formed the Centre for Effective Altruism. William MacAskill's <em>Doing Good Better</em>
      (2015) brought the idea to a wide audience.
    </p>
    <p>
      Its work clusters in three areas: global health and poverty, animal welfare, and
      catastrophic risk. The third grew with <strong>longtermism</strong> — the view that the
      people of the far future count as much as people now, set out in Ord's
      <em>The Precipice</em> (2020) and MacAskill's <em>What We Owe the Future</em> (2022).
      Its largest funder, Open Philanthropy, has been called
      <a href="https://coefficientgiving.org/research/open-philanthropy-is-now-coefficient-giving/" target="_blank" rel="noopener">Coefficient Giving</a>
      since November 2025.
    </p>`,
    },
    {
      kind: "section",
      heading: "Why e/acc is named after it",
      html: `
    <p>
      The <a href="https://effectiveaccelerationism.substack.com/p/repost-effective-accelerationism" target="_blank" rel="noopener">founding e/acc newsletter</a>
      (May 2022) is open about the borrowing: the overlap of "EA" and "Effective A__ism",
      it says, is intentional. It credits EA with being prescriptive and serious about
      scale, then rejects its risk-aversion and the surveillance it sees in longtermist
      safety plans. One co-author's shorthand for the result was "EA, but based".
    </p>`,
    },
    {
      kind: "section",
      heading: "Where the two agree",
      html: `
    <ul>
      <li>Moral questions can be reasoned about with numbers, and scale matters.</li>
      <li>The long-run future is enormous and worth optimizing for.</li>
      <li>Technology, AI above all, is the most consequential force of this century.</li>
      <li>Good intentions without measured results are not enough.</li>
    </ul>`,
    },
    {
      kind: "section",
      heading: "Where they split",
      html: `
    <ul>
      <li><strong>AI risk.</strong> EA's AI wing gives catastrophic outcomes a high
        <a href="/eacc-glossary#pdoom">p(doom)</a> and wants alignment, evaluations and
        compute governance before more capability. e/acc thinks those risks are overstated
        and that the safest path is more capability, spread widely.</li>
      <li><strong>Who decides.</strong> EA leans on experts, foundations and policy to steer.
        e/acc trusts markets, open source and deployment, and distrusts any small group
        holding a veto — see <a href="/eacc-glossary#decel">decel</a>.</li>
      <li><strong>The cost of waiting.</strong> For EA, a delay that lowers extinction risk
        is cheap against a future of trillions. For e/acc, every year of delay has a body
        count of its own, paid now and with certainty.</li>
    </ul>`,
    },
    {
      kind: "section",
      heading: "Two episodes that hardened the line",
      html: `
    <p>
      <strong>FTX.</strong> Sam Bankman-Fried was EA's best-known donor and described his
      career as "earning to give". FTX filed for bankruptcy on 11 November 2022; he was
      convicted on all seven counts in November 2023 and sentenced to 25 years on
      28 March 2024. The FTX Future Fund's team resigned, and MacAskill publicly condemned the
      deception. For critics, the episode showed what expected-value reasoning can be used
      to excuse.
    </p>
    <p>
      <strong>The OpenAI board.</strong> On 17 November 2023 OpenAI's board removed Sam Altman;
      after most of the staff threatened to leave, he returned on 22 November. Concerns about
      AI risk associated with EA were present on the board that removed him, and his return
      was celebrated by e/acc accounts as a defeat for the cautious side. The board's stated
      reason was that he had not been consistently candid, not a dispute over speed.
    </p>`,
    },
    {
      kind: "section",
      heading: "Where this site stands",
      html: `
    <p>
      This site is e/acc, and it takes EA seriously: the habit of measuring, the willingness
      to think about the very long run, the money that has gone to global health. The
      disagreement is about AI, and about whether the right response to an uncertain risk is
      to slow down or to build faster and in the open. We would rather argue that with
      data — the <a href="/chronicle">acceleration timeline</a> and the
      <a href="/index/cost-of-intelligence">cost of intelligence</a> — than with slogans.
    </p>`,
    },
    { kind: "faq" },
    {
      kind: "links",
      heading: "Keep reading",
      links: [
        { href: "/what-is-eacc", label: "what is e/acc — the full explainer" },
        { href: "/eacc-vs-dacc", label: "e/acc vs d/acc — the two accelerationisms compared" },
        { href: "/eacc-glossary", label: "e/acc glossary: decel, doomer, p(doom), technocapital" },
        { href: "https://en.wikipedia.org/wiki/Effective_altruism", label: "Effective altruism (Wikipedia)" },
        { href: "https://www.effectivealtruism.org/articles/introduction-to-effective-altruism", label: "Introduction to effective altruism (effectivealtruism.org)" },
      ],
    },
  ],
  faq: VS_EA_FAQ,
};

const GLOSSARY_TERMS: ConceptTerm[] = [
  {
    id: "accelerationism",
    term: "accelerationism",
    def: "The broad family of positions holding that technological or economic change should be sped up rather than restrained. The label predates e/acc by decades and covers left-wing, right-wing and apolitical variants that agree on little except the throttle.",
  },
  {
    id: "based",
    term: "based / BasedBeffJezos",
    def: "Internet slang for holding a position without hedging for approval. @BasedBeffJezos was the pseudonymous account that co-authored the founding e/acc newsletter and became the movement's most visible figure; Forbes identified him in December 2023 as Guillaume Verdon, a former Google quantum computing engineer.",
  },
  {
    id: "dacc",
    term: "d/acc",
    def: "Defensive, decentralizing, democratic, differential accelerationism — proposed by Vitalik Buterin in November 2023. Accepts that technology should accelerate but argues direction matters as much as speed. Full comparison on the <a href=\"/eacc-vs-dacc\">e/acc vs d/acc page</a>.",
  },
  {
    id: "decel",
    term: "decel",
    def: "e/acc's pejorative for anyone advocating slowdown, pause, licensing or capability restriction. Deliberately broad: it collapses AI-safety researchers, regulators, degrowth advocates and cautious incumbents into one silhouette. Being called a decel is the movement's main rhetorical sanction.",
  },
  {
    id: "doomer",
    term: "doomer",
    def: "Someone who assigns high probability to AI causing catastrophic or existential harm. Used descriptively inside AI-safety circles and pejoratively outside them. The doomer position is about capability outrunning control, which is distinct from the degrowth or anti-tech positions e/acc also opposes.",
  },
  {
    id: "eacc",
    term: "e/acc",
    def: "Effective accelerationism — the position that technological progress, AI above all, should be accelerated rather than restrained. Also written <strong>eacc</strong>, <strong>e-acc</strong> or <strong>E/ACC</strong>. Started as a pseudonymous newsletter on 31 May 2022. See <a href=\"/what-is-eacc\">what is e/acc</a>.",
  },
  {
    id: "ea",
    term: "EA (effective altruism)",
    def: "The movement e/acc's name parodies: an attempt to allocate charitable effort by expected impact. Its AI wing treats catastrophic risk as a top priority and argues for caution at the frontier — the specific position e/acc formed in opposition to. Full comparison on the <a href=\"/eacc-vs-ea\">e/acc vs EA page</a>.",
  },
  {
    id: "extropic",
    term: "Extropic",
    def: "The hardware company founded by Guillaume Verdon (@BasedBeffJezos) after leaving Google, building thermodynamic computing hardware. Frequently cited as e/acc's proof that the movement builds rather than only posts.",
  },
  {
    id: "frontier-model",
    term: "frontier model",
    def: "The most capable generally-available models at a given moment — the leading edge rather than a fixed capability bar, so the set turns over constantly. This site tags frontier releases in its <a href=\"/chronicle\">acceleration timeline</a> and counts the days since each one.",
  },
  {
    id: "kardashev",
    term: "Kardashev scale",
    def: "A 1964 classification by Soviet astronomer Nikolai Kardashev ranking civilizations by the energy they command: planetary (Type I), stellar (Type II), galactic (Type III). e/acc treats climbing it as a civilizational objective rather than a thought experiment.",
  },
  {
    id: "pdoom",
    term: "p(doom)",
    def: "Shorthand for one's subjective probability that AI causes catastrophic or existential harm. Traded as a number in AI discourse — a personal credence, not a measurement. Stating a low p(doom) is an e/acc signal; a high one marks a doomer.",
  },
  {
    id: "pause-letter",
    term: "the pause letter",
    def: "The Future of Life Institute open letter of 22 March 2023 calling for a six-month halt on training systems more powerful than GPT-4. It was never observed in practice and became e/acc's standard example of what deceleration looks like when it is written down.",
  },
  {
    id: "technocapital",
    term: "technocapital",
    def: "The idea that markets and technology form a single self-improving engine — capital funds capability, capability creates returns, returns fund more capability. e/acc treats this loop as the mechanism of progress rather than a side effect of it.",
  },
  {
    id: "techno-optimist-manifesto",
    term: "Techno-Optimist Manifesto",
    def: "Marc Andreessen's October 2023 essay for a16z, which carried e/acc themes — abundance, anti-doom, technology as a moral good — into mainstream venture discourse and named e/acc figures as patron saints. Not an e/acc document, but the reason many people first met the term.",
  },
  {
    id: "thermodynamics",
    term: "the thermodynamic argument",
    def: "e/acc's founding aesthetic: life and intelligence are structures that dissipate energy gradients, so the universe statistically favours more of both. Often invoked via physicist Jeremy England's work on dissipative adaptation. Critics note that a description of what happens is not an argument for what should.",
  },
  {
    id: "uacc",
    term: "u/acc (unconditional accelerationism)",
    def: "The older, darker branch descending from Nick Land and the 1990s CCRU, which holds that the process accelerates regardless of human preference and is indifferent to human flourishing. e/acc borrows the vocabulary and explicitly rejects the nihilism — its version is meant to be pro-human.",
  },
];

const GLOSSARY: ConceptPage = {
  slug: "eacc-glossary",
  title: "e/acc Glossary: Accelerationism Terms, Defined | e-acc.ai",
  description:
    "A plain glossary of accelerationism: e/acc, d/acc, decel, doomer, p(doom), technocapital, u/acc and the Kardashev scale — defined with dates, sources and context.",
  h1: "e/acc glossary — accelerationism terms, defined",
  lead: `
    <p class="prose-lead">
      The accelerationist vocabulary, defined without the in-group assumption:
      ${GLOSSARY_TERMS.length} terms that show up in e/acc, d/acc and AI-risk arguments,
      with dates and sources where they exist. Written to be readable by someone who
      has just met the word <strong>e/acc</strong> and wants to know what everyone is
      actually arguing about.
    </p>`,
  blocks: [
    { kind: "terms" },
    {
      kind: "links",
      heading: "Keep reading",
      links: [
        { href: "/what-is-eacc", label: "what is e/acc — origin, beliefs, criticism" },
        { href: "/eacc-vs-dacc", label: "e/acc vs d/acc — the two accelerationisms compared" },
        { href: "/eacc-vs-ea", label: "e/acc vs EA — effective accelerationism and effective altruism" },
        { href: "/chronicle", label: "the AI acceleration timeline" },
        { href: "/pricing", label: "what frontier intelligence actually costs" },
      ],
    },
  ],
  terms: GLOSSARY_TERMS,
};

export const CONCEPT_PAGES = { "what-is-eacc": WHAT_IS, "eacc-vs-dacc": VS_DACC, "eacc-vs-ea": VS_EA, "eacc-glossary": GLOSSARY } as const;
