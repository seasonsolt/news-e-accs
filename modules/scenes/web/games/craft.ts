import type { World } from "../shared/worlds.ts";

export const CRAFT_MESSAGES: Record<string, string> = {};
function m(zh: string, en: string) { CRAFT_MESSAGES[zh] = en; return zh; }
const distance = m("探索距离", "Explore distance");
export const CRAFT_WORLDS = {
  writing: {
    id: "writing", path: "/chronicle/writing", time: -3499, figure: "3500", unit: m("公元前", "BC"), title: m("文字工坊", "Writing workshop"),
    subtitle: m("把货物与数量，留在泥土里。完成三笔委托，让记忆走出人的头脑。", "Leave goods and quantities in clay. Complete three orders and give memory a durable form."),
    plate: "/media/art/epochs/cities-writing-1600.webp", action: m("登记泥板", "Record on tablet"), unitLabel: distance, challenge: true,
    readingLabels: [m("货物", "Goods"), m("数量", "Quantity"), m("账目", "Records")],
    phases: [
      { title: m("谷物三份，等待登记。", "Three measures of grain await recording."), detail: m("选择货物，再点击计数石调整数量。把谷物三份登记到泥板；选错可直接修改并重试。", "Choose goods and click the counting stones to change the quantity. Record three measures of grain; revise any mismatch and try again."), readings: [m("谷物", "Grain"), "1", "0 / 3"] },
      { title: m("再记下羊群两只。", "Record two sheep next."), detail: m("第二笔委托更换货物和数量。泥板上的压痕对应已经核对的账目，错误不会抹去正确记录。", "The second order changes goods and quantity. Impressions mark verified records; mistakes preserve correct entries."), readings: [m("羊群", "Sheep"), "2", "1 / 3"] },
      { title: m("最后一笔：谷物五份。", "The final order: five measures of grain."), detail: m("选择谷物与五份，检查后登记。计数从五循环回一，三笔委托需要各自核对。", "Select grain and five measures, then record. Counting cycles from five to one; verify each order separately."), readings: ["谷物", "5", "2 / 3"] },
      { title: m("泥板保存了三笔账目。", "The tablet preserves three records."), detail: m("三笔货物和数量均正确。可以复位，再从第一笔委托重新登记。", "All three goods and quantities match. Reset to record the orders again."), readings: [m("已完成", "Complete"), "3", "3 / 3"] },
    ],
    note: m("城市与早期记账的艺术概念场景。入口沿用约公元前3500年的时代日期；泥板、计数和图形只是原理示意，不把后来的成熟楔形文字当作该年的精确复原。", "An artistic concept of cities and early accounting. The entry follows the era date around 3500 BC. Tablets, counters and marks explain principles rather than reconstructing mature cuneiform at that exact date."),
    source: "https://www.metmuseum.org/essays/the-origins-of-writing", next: "iron",
  },
  iron: {
    id: "iron", path: "/chronicle/iron", time: -1199, figure: "1200", unit: "公元前", title: m("铁器工坊", "Iron workshop"),
    subtitle: m("炉火、风箱与一次有效的锤击。让坚硬的材料，变成手中的工具。", "Fire, bellows and a well-timed blow. Turn resistant material into a tool."),
    plate: "/media/art/epochs/iron-age-1600.webp", action: m("锤击铁坯", "Strike the billet"), unitLabel: distance, challenge: true,
    readingLabels: [m("炉火", "Heat"), m("有效锤击", "Valid strikes"), m("铁坯", "Billet")],
    phases: [
      { title: m("先给炉火一点力量。", "Give the furnace some energy."), detail: m("点击炭篮加炭、推动风箱。炉火达到可锻状态后，才适合在砧上锤击。", "Add charcoal and work the bellows. Strike on the anvil once the billet is workable."), readings: [m("偏冷", "Cool"), "0 / 2", m("待成形", "Unshaped")] },
      { title: m("看火色，再落锤。", "Read the heat before striking."), detail: m("可锻时锤击才有效；冷锤或过热都有反馈。炉火过旺时先冷却，再继续操作。", "Only workable heat yields a valid strike. Cold or overheated blows provide feedback. Cool excessive heat before continuing."), readings: [m("可锻", "Workable"), "0 / 2", "待成形"] },
      { title: m("两次锤击，逐步延展。", "Two blows gradually shape the billet."), detail: m("锤击会消耗热量；必要时重新加热。完成两次有效锤击后，冷却铁坯才能完成。", "Striking uses heat; reheat when needed. After two valid strikes, cool the billet to finish."), readings: ["可锻", "1 / 2", "待成形"] },
      { title: m("一件工具，从火中留下。", "A tool emerges from the fire."), detail: m("铁坯已经锻造成形并冷却。复位后，可以尝试另一条正确的加热与锤击顺序。", "The billet has been shaped and cooled. Reset to try another valid sequence of heating and striking."), readings: ["偏冷", "2 / 2", "已完成"] },
    ],
    note: m("铁器时代的艺术与工序概念示意。炉火等级是游戏符号，没有温度、配比或真实冶炼参数；锻打、炉型和纹饰不对应一个精确遗址，也不是实际操作指导。", "An artistic process concept for the Iron Age. Heat levels are game symbols, with no temperatures, proportions or real smelting parameters. Forging, furnace and motifs do not reconstruct a specific site or provide operating instructions."),
    source: "https://www.britishmuseum.org/collection/term/x13992", next: "printing",
  },
  printing: {
    id: "printing", path: "/chronicle/printing", time: 1440, figure: "1440", unit: m("年", "AD"), title: m("印刷工坊", "Printing workshop"),
    subtitle: m("活字排好，油墨铺开。扳动木制压印杆，把一页变成许多页。", "Set the type, spread the ink and pull the wooden press. Turn one page into many."),
    plate: "/media/art/epochs/printing-1600.webp", action: m("扳动压印杆", "Pull the press"), unitLabel: distance, challenge: true,
    readingLabels: [m("字版", "Type forme"), m("墨层", "Ink"), m("印张", "Copies")],
    phases: [
      { title: m("从一枚活字开始。", "Begin with movable type."), detail: m("从字盘排字，然后点击校对架检查字版。压印杆不会替你完成准备工序。", "Compose type from the case, then check it at the proofing stand. The press never performs preparation for you."), readings: [m("空字版", "Empty forme"), m("待上墨", "Needs ink"), "0 / 3"] },
      { title: m("校对与上墨，缺一不可。", "Both proofing and inking matter."), detail: m("校对通过后点击墨球上墨，再扳动压印杆。未校对或缺墨时会提示原因，可以补上工序重试。", "Proof the forme, apply ink with the ink balls and pull the press. Missing proofing or ink gives a reason; finish that step and retry."), readings: [m("校对通过", "Proofed"), m("已上墨", "Inked"), "0 / 3"] },
      { title: m("每一张，都要重新上墨。", "Re-ink for every impression."), detail: m("字版可以重复使用，但每张书页都消耗墨层。完成三张印刷，观察书页架逐张增加。", "Type can be reused, but every impression consumes its ink. Produce three copies and watch them accumulate on the drying rack."), readings: ["校对通过", "待上墨", "1 / 3"] },
      { title: m("三份书页，离开同一副字版。", "Three pages from one forme."), detail: m("三张印刷完成。复位会清空字版、墨层和印张，再体验完整流程。", "Three impressions are complete. Reset clears the type, ink and copies to replay the full process."), readings: ["校对通过", "待上墨", "3 / 3"] },
    ],
    note: m("约1440年欧洲木制螺旋印刷机的概念场景。活字、校对、上墨和压印采用简化操作；不把欧洲印刷机等同于印刷或活字在全球的首次出现。", "A concept of a European wooden screw press around 1440. Typesetting, proofing, inking and pressing are simplified. The European press is not presented as the world's first printing or movable type."),
    source: "https://www.printmuseum.org/gutenberg-press", next: "observatory",
  },
} satisfies Partial<Record<string, World>>;

Object.assign(CRAFT_MESSAGES, {
  "选择谷物": "Select grain", "选择羊群": "Select sheep", "数量加一": "Increase quantity", "添加木炭": "Add charcoal", "推动风箱": "Work bellows", "冷却铁坯": "Cool billet", "排列活字": "Set type", "校对字版": "Proof the forme", "字版上墨": "Apply ink",
  "委托：登记谷物三份。": "Order: record three measures of grain.", "已选择谷物。": "Grain selected.", "已选择羊群。": "Sheep selected.", "数量已改变，请核对委托。": "Quantity changed. Check the order.", "货物或数量不符：修改选择，再登记。": "Goods or quantity do not match. Revise and retry.", "第一笔已登记。委托：登记羊群两只。": "First entry recorded. Order: two sheep.", "第二笔已登记。委托：登记谷物五份。": "Second entry recorded. Order: five measures of grain.", "三笔账目一致，泥板完成。": "All three records match. Tablet complete.",
  "先加炭并鼓风，让铁坯进入可锻状态。": "Add charcoal and air to make the billet workable.", "炉火过旺：先冷却，再锤击。": "Too hot: cool before striking.", "铁坯可锻：现在可以锤击。": "The billet is workable. Strike now.", "炉火尚弱，还需要鼓风。": "The fire is weak. Work the bellows.", "冷锤没有成形：先重新加热铁坯。": "Cold blows do not shape it. Reheat first.", "铁坯过热，锤击无效：先冷却。": "Too hot for a valid strike. Cool first.", "两次有效锤击完成，冷却后取出成品。": "Two valid strikes. Cool to finish.", "铁坯已延展一次；保持可锻炉火，再锤一次。": "One valid strike. Keep it workable and strike again.", "铁坯已成形，一件铁器完成。": "The billet is shaped. Iron tool complete.", "炉火已降低；需要时可重新加热。": "Heat reduced. Reheat when needed.", "过热": "Overheated",
  "从字盘选择活字，为这张书页排版。": "Choose movable type and compose the page.", "活字已排好，请校对后印刷。": "Type set. Proof before printing.", "字版还是空的，请先排字。": "The forme is empty. Set type first.", "校对通过，可以上墨。": "Proof passed. Apply ink.", "墨层均匀，可以压印一份。": "Ink is ready. Print one copy.", "已上墨，但还没有校对。": "Inked, but not proofed yet.", "没有字版：先从字盘排字。": "No forme. Set type from the case first.", "尚未校对：检查字版后再压印。": "Not proofed. Check the forme before pressing.", "缺少油墨：每一份压印前都要重新上墨。": "No ink. Re-ink before each impression.", "三份清晰书页完成，知识可以复制。": "Three clear copies. Knowledge can be reproduced.", "这一份已完成，请重新上墨印下一份。": "Copy finished. Re-ink for the next one.", "待校对": "Needs proofing",
});

Object.assign(CRAFT_MESSAGES, {
  "核对货物与数量，然后把这一笔压进泥板。": "Check the goods and quantity, then impress this entry into the clay.",
  "第一笔与第三笔委托使用谷物。": "The first and third orders request grain.",
  "第二笔委托登记两只羊。": "The second order requests two sheep.",
  "每次点击加一，五份之后回到一份。": "Each click adds one; after five, counting returns to one.",
  "只有可锻炉火下的锤击才有效，完成两次后冷却。": "Strike at workable heat. After two valid strikes, cool to finish.",
  "空气让炉火增强；留意可锻与过热提示。": "Air strengthens the fire. Watch for workable or overheated feedback.",
  "炭篮提供炉火；过量加炭会让铁坯过热。": "Charcoal feeds the fire. Excess fuel overheats the billet.",
  "降低过热炉火；两次有效锤击后冷却即可完成。": "Reduce excessive heat. Cool after two valid strikes to finish.",
  "完成排字、校对和上墨，再压印；每份都需要新墨。": "Set type, proof and ink before pressing. Every copy needs fresh ink.",
  "从分格字盘排出一副字版；重新排字后需要再次校对。": "Compose a forme from the compartmented typecase. Changing type requires another proof.",
  "墨球把油墨铺在字面；每份压印消耗一次墨层。": "Ink balls coat the type face. Each impression consumes one ink layer.",
  "阅读校样，确认字版后再印刷。": "Read the proof and approve the forme before printing.",
});
