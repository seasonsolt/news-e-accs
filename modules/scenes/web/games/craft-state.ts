import type { GameController, GameSnapshot } from "./types.ts";

export const WRITING_ORDERS = [{ kind: "grain", count: 3 }, { kind: "sheep", count: 2 }, { kind: "grain", count: 5 }] as const;
export function createWritingGame(): GameController {
  let row = 0, kind = "grain", count = 1, status = "委托：登记谷物三份。";
  const reset = () => { row = 0; kind = "grain"; count = 1; status = "委托：登记谷物三份。"; };
  const act = (action: string) => {
    if (row === 3) return;
    if (action === "grain" || action === "sheep") { kind = action; status = kind === "grain" ? "已选择谷物。" : "已选择羊群。"; }
    else if (action === "quantity") { count = count % 5 + 1; status = "数量已改变，请核对委托。"; }
    else if (action === "register" || action === "primary") {
      const order = WRITING_ORDERS[row]!;
      if (order.kind !== kind || order.count !== count) { status = "货物或数量不符：修改选择，再登记。"; return; }
      row++;
      status = ["委托：登记谷物三份。", "第一笔已登记。委托：登记羊群两只。", "第二笔已登记。委托：登记谷物五份。", "三笔账目一致，泥板完成。" ][row]!;
    }
  };
  return {
    actions: [{ id: "grain", label: "选择谷物" }, { id: "sheep", label: "选择羊群" }, { id: "quantity", label: "数量加一" }, { id: "register", label: "登记泥板" }],
    snapshot: (): GameSnapshot => ({ progress: row, complete: row === 3, status, readings: [kind === "grain" ? "谷物" : "羊群", String(count), `${row} / 3`], primary: "register" }),
    act, reset,
    demo() { if (row < 3) { const order = WRITING_ORDERS[row]!; kind = order.kind; count = order.count; act("register"); } },
  };
}

export function createIronGame(): GameController {
  let heat = 0, hits = 0, complete = false, status = "先加炭并鼓风，让铁坯进入可锻状态。";
  const reset = () => { heat = 0; hits = 0; complete = false; status = "先加炭并鼓风，让铁坯进入可锻状态。"; };
  const act = (action: string) => {
    if (complete) return;
    if (action === "charcoal" || action === "bellows") {
      heat = Math.min(6, heat + (action === "charcoal" ? 2 : 1));
      status = heat > 4 ? "炉火过旺：先冷却，再锤击。" : heat >= 3 ? "铁坯可锻：现在可以锤击。" : "炉火尚弱，还需要鼓风。";
    } else if (action === "hammer" || action === "primary") {
      if (heat < 3) { status = "冷锤没有成形：先重新加热铁坯。"; return; }
      if (heat > 4) { status = "铁坯过热，锤击无效：先冷却。"; return; }
      hits = Math.min(2, hits + 1); heat--;
      status = hits === 2 ? "两次有效锤击完成，冷却后取出成品。" : "铁坯已延展一次；保持可锻炉火，再锤一次。";
    } else if (action === "cool") {
      if (hits === 2) { heat = 0; complete = true; status = "铁坯已成形，一件铁器完成。"; }
      else { heat = Math.max(0, heat - 2); status = "炉火已降低；需要时可重新加热。"; }
    }
  };
  return {
    actions: [{ id: "charcoal", label: "添加木炭" }, { id: "bellows", label: "推动风箱" }, { id: "cool", label: "冷却铁坯" }, { id: "hammer", label: "锤击铁坯" }],
    snapshot: (): GameSnapshot => ({ progress: complete ? 3 : hits ? 2 : heat >= 3 ? 1 : 0, complete, status, readings: [heat > 4 ? "过热" : heat >= 3 ? "可锻" : "偏冷", `${hits} / 2`, complete ? "已完成" : "待成形"], primary: "hammer" }),
    act, reset,
    demo() { if (complete) return; if (hits === 2 || heat > 4) act("cool"); else if (heat < 2) act("charcoal"); else if (heat < 3) act("bellows"); else act("hammer"); },
  };
}

export function createPrintingGame(): GameController {
  let composed = false, proofed = false, inked = false, copies = 0, status = "从字盘选择活字，为这张书页排版。";
  const reset = () => { composed = false; proofed = false; inked = false; copies = 0; status = "从字盘选择活字，为这张书页排版。"; };
  const act = (action: string) => {
    if (copies === 3) return;
    if (action === "typeset") { composed = true; proofed = false; inked = false; status = "活字已排好，请校对后印刷。"; }
    else if (action === "proof") {
      if (!composed) { status = "字版还是空的，请先排字。"; return; }
      proofed = true; status = "校对通过，可以上墨。";
    } else if (action === "ink") {
      if (!composed) { status = "字版还是空的，请先排字。"; return; }
      inked = true; status = proofed ? "墨层均匀，可以压印一份。" : "已上墨，但还没有校对。";
    } else if (action === "press" || action === "primary") {
      if (!composed) status = "没有字版：先从字盘排字。";
      else if (!proofed) status = "尚未校对：检查字版后再压印。";
      else if (!inked) status = "缺少油墨：每一份压印前都要重新上墨。";
      else { copies++; inked = false; status = copies === 3 ? "三份清晰书页完成，知识可以复制。" : "这一份已完成，请重新上墨印下一份。"; }
    }
  };
  return {
    actions: [{ id: "typeset", label: "排列活字" }, { id: "proof", label: "校对字版" }, { id: "ink", label: "字版上墨" }, { id: "press", label: "扳动压印杆" }],
    snapshot: (): GameSnapshot => ({ progress: copies === 3 ? 3 : copies ? 2 : composed ? 1 : 0, complete: copies === 3, status, readings: [proofed ? "校对通过" : composed ? "待校对" : "空字版", inked ? "已上墨" : "待上墨", `${copies} / 3`], primary: "press" }),
    act, reset,
    demo() { if (!composed) act("typeset"); else if (!proofed) act("proof"); else if (!inked) act("ink"); else act("press"); },
  };
}
