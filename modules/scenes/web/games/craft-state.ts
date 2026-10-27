import type { GameController, GameSnapshot, GameTone } from "./types.ts";
import { drawDistinct, type Random } from "./random.ts";

export type WritingKind = "grain" | "sheep";
export interface WritingOrder { kind: WritingKind; count: number }
const KINDS: readonly WritingKind[] = ["grain", "sheep"];
const ALL_ORDERS: readonly WritingOrder[] = KINDS.flatMap(kind => [1, 2, 3, 4, 5].map(count => ({ kind, count })));
const sameOrder = (a: WritingOrder, b: WritingOrder) => a.kind === b.kind && a.count === b.count;
const ZH_COUNT = ["", "一", "两", "三", "四", "五"], EN_COUNT = ["", "one", "two", "three", "four", "five"];
const phrase = ({ kind, count }: WritingOrder): [string, string] => kind === "grain"
  ? [`谷物${ZH_COUNT[count]}份`, `${EN_COUNT[count]} ${count === 1 ? "measure" : "measures"} of grain`]
  : [`羊群${ZH_COUNT[count]}只`, `${EN_COUNT[count]} sheep`];
const LEADS: Array<[string, string] | null> = [null, ["第一笔已登记。", "First entry recorded."], ["第二笔已登记。", "Second entry recorded."]];
const orderLine = (lead: [string, string] | null, order: WritingOrder) => `${lead?.[0] ?? ""}委托：登记${phrase(order)[0]}。`;
/** Every line that names an order, with its English edition: the order is drawn at play time, so the page translates the whole set. */
export const WRITING_ORDER_MESSAGES: Record<string, string> = {};
for (const order of ALL_ORDERS) for (const lead of LEADS) WRITING_ORDER_MESSAGES[orderLine(lead, order)] = `${lead ? `${lead[1]} ` : ""}Order: record ${phrase(order)[1]}.`;

/** Three different orders; the first differs from the selection the bench starts with, so one press never records it. */
export function drawWritingOrders(random: Random): WritingOrder[] {
  return drawDistinct(ALL_ORDERS, 3, [{ kind: "grain", count: 1 }], random, sameOrder);
}

export function createWritingGame(random: Random = Math.random) {
  let orders!: WritingOrder[], row = 0, kind: WritingKind = "grain", count = 1, status = "", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const reset = () => { orders = drawWritingOrders(random); row = 0; kind = "grain"; count = 1; say(orderLine(null, orders[0]!)); };
  reset();
  const act = (action: string) => {
    if (row === 3) return;
    if (action === "grain" || action === "sheep") { kind = action; say(kind === "grain" ? "已选择谷物。" : "已选择羊群。"); }
    else if (action === "quantity") { count = count % 5 + 1; say("数量已改变，请核对委托。"); }
    else if (action === "register" || action === "primary") {
      if (!sameOrder(orders[row]!, { kind, count })) { say("货物或数量不符：修改选择，再登记。", "error"); return; }
      row++;
      say(row === 3 ? "三笔账目一致，泥板完成。" : orderLine(LEADS[row]!, orders[row]!), "progress");
    }
  };
  const game = {
    actions: [{ id: "grain", label: "选择谷物" }, { id: "sheep", label: "选择羊群" }, { id: "quantity", label: "数量加一" }, { id: "register", label: "登记泥板" }],
    /** The orders to record, in order, and how many are recorded. */
    view: () => ({ orders, row }),
    snapshot: (): GameSnapshot => ({ progress: row, complete: row === 3, status, tone, readings: [kind === "grain" ? "谷物" : "羊群", String(count), `${row} / 3`], primary: "register" }),
    act, reset,
    demo() { if (row < 3) { ({ kind, count } = orders[row]!); act("register"); } },
  };
  return game satisfies GameController;
}

export function createIronGame(): GameController {
  let heat = 0, hits = 0, complete = false, status = "先加炭并鼓风，让铁坯进入可锻状态。", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const reset = () => { heat = 0; hits = 0; complete = false; say("先加炭并鼓风，让铁坯进入可锻状态。"); };
  const act = (action: string) => {
    if (complete) return;
    if (action === "charcoal" || action === "bellows") {
      heat = Math.min(6, heat + (action === "charcoal" ? 2 : 1));
      if (heat > 4) say("炉火过旺：先冷却，再锤击。", "error");
      else say(heat >= 3 ? "铁坯可锻：现在可以锤击。" : "炉火尚弱，还需要鼓风。", heat >= 3 ? "progress" : "info");
    } else if (action === "hammer" || action === "primary") {
      if (heat < 3) { say("冷锤没有成形：先重新加热铁坯。", "error"); return; }
      if (heat > 4) { say("铁坯过热，锤击无效：先冷却。", "error"); return; }
      hits = Math.min(2, hits + 1); heat--;
      say(hits === 2 ? "两次有效锤击完成，冷却后取出成品。" : "铁坯已延展一次；保持可锻炉火，再锤一次。", "progress");
    } else if (action === "cool") {
      if (hits === 2) { heat = 0; complete = true; say("铁坯已成形，一件铁器完成。", "progress"); }
      else { heat = Math.max(0, heat - 2); say("炉火已降低；需要时可重新加热。"); }
    }
  };
  return {
    actions: [{ id: "charcoal", label: "添加木炭" }, { id: "bellows", label: "推动风箱" }, { id: "cool", label: "冷却铁坯" }, { id: "hammer", label: "锤击铁坯" }],
    snapshot: (): GameSnapshot => ({ progress: complete ? 3 : hits ? 2 : heat >= 3 ? 1 : 0, complete, status, tone, readings: [heat > 4 ? "过热" : heat >= 3 ? "可锻" : "偏冷", `${hits} / 2`, complete ? "已完成" : "待成形"], primary: "hammer" }),
    act, reset,
    demo() { if (complete) return; if (hits === 2 || heat > 4) act("cool"); else if (heat < 2) act("charcoal"); else if (heat < 3) act("bellows"); else act("hammer"); },
  };
}

export function createPrintingGame(): GameController {
  let composed = false, proofed = false, inked = false, copies = 0, status = "从字盘选择活字，为这张书页排版。", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const reset = () => { composed = false; proofed = false; inked = false; copies = 0; say("从字盘选择活字，为这张书页排版。"); };
  const act = (action: string) => {
    if (copies === 3) return;
    if (action === "typeset") { composed = true; proofed = false; inked = false; say("活字已排好，请校对后印刷。", "progress"); }
    else if (action === "proof") {
      if (!composed) { say("字版还是空的，请先排字。", "error"); return; }
      proofed = true; say("校对通过，可以上墨。", "progress");
    } else if (action === "ink") {
      if (!composed) { say("字版还是空的，请先排字。", "error"); return; }
      inked = true;
      if (proofed) say("墨层均匀，可以压印一份。", "progress"); else say("已上墨，但还没有校对。");
    } else if (action === "press" || action === "primary") {
      if (!composed) say("没有字版：先从字盘排字。", "error");
      else if (!proofed) say("尚未校对：检查字版后再压印。", "error");
      else if (!inked) say("缺少油墨：每一份压印前都要重新上墨。", "error");
      else { copies++; inked = false; say(copies === 3 ? "三份清晰书页完成，知识可以复制。" : "这一份已完成，请重新上墨印下一份。", "progress"); }
    }
  };
  return {
    actions: [{ id: "typeset", label: "排列活字" }, { id: "proof", label: "校对字版" }, { id: "ink", label: "字版上墨" }, { id: "press", label: "扳动压印杆" }],
    snapshot: (): GameSnapshot => ({ progress: copies === 3 ? 3 : copies ? 2 : composed ? 1 : 0, complete: copies === 3, status, tone, readings: [proofed ? "校对通过" : composed ? "待校对" : "空字版", inked ? "已上墨" : "待上墨", `${copies} / 3`], primary: "press" }),
    act, reset,
    demo() { if (!composed) act("typeset"); else if (!proofed) act("proof"); else if (!inked) act("ink"); else act("press"); },
  };
}
