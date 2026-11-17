import { LINES } from "./land.ts";

// Chinese copy is the key; `en` is the English edition. The road's own lines are listed in land.ts.
const lines: Record<string, string> = {
  "约一百万年前。天黑以后，火没有熄灭。": "About a million years ago. After dark, the fire stayed lit.",
  "带着火往前走。天还没有亮。": "Carry the fire forward. It is not yet dawn.",
  "一万两千年前。有人没有吃掉最后一把种子。": "Twelve thousand years ago. Someone did not eat the last handful of seed.",
  "人为了麦子停下脚步，盖起屋子，守着粮仓。": "For wheat, people stopped walking, built houses and guarded a granary.",
  "一万年里，麦子改造了人的脊背、河流和历法。": "In ten thousand years, wheat reshaped human backs, rivers and calendars.",
  "是谁驯化了谁？": "Who domesticated whom?",
  "今天。麦田中央立着一块石头。": "Today. A stone stands in the middle of the wheat.",
};
for (const [, line] of LINES) if (/[㐀-鿿]/.test(line) && !lines[line]) throw new Error(`No English edition for the line: ${line}`);

export const messages = { en: {
  ...lines,
  "从火堆到巨石": "From Fire to Monolith",
  "一百万年，一条路。夜里的火，清晨的田，下午的麦子，和麦田中央那块石头，都在同一个世界里。": "A million years, one road. The fire at night, the field at dawn, the wheat in the afternoon and the stone in the middle of it all stand in one world.",
  "加速史 · 一条走得通的路": "Chronicle · one road you can walk",
  "可行走的三维世界：从火堆穿过麦田走到巨石": "A walkable 3D world: from a hearth, through the wheat, to the monolith",
  "W A S D 行走 · 拖动环视 · Shift 加快 · E 互动": "W A S D to walk · drag to look · Shift to hurry · E to act",
  "拖动环视 · 按住下方按钮前行 · 或开自动前行": "Drag to look · hold the button below to walk · or turn on auto-walk",
  "正在打开世界": "Opening the world", "开始行走": "Start walking", "再走一遍": "Walk again", "自动前行": "Auto-walk", "按住前行": "Hold to walk", "声音": "Sound",
  "此刻走到": "You are at", "此刻走到 · 约": "You are at · about",
  "Ⅰ · 火": "I · Fire", "Ⅱ · 田": "II · Field", "Ⅲ · 碑": "III · Monolith", "火": "Fire", "田": "Field", "碑": "Monolith",
  "添柴": "Feed the fire", "播种": "Sow", "触碰巨石": "Touch the monolith",
  "火光把夜晚推远了一点。一天，变长了。": "The firelight pushes the night back a little. The day grows longer.",
  "种子落进土里。田，自己向前铺开。": "The seed is in the ground. The field unrolls ahead on its own.",
  "在你之前，已经有人播下了种子。": "Someone sowed here before you came.",
  "石头是凉的。天，暗了下来。": "The stone is cold. The sky goes dark.",
  "这一段到此为止": "This stretch ends here",
  "下一段从这块石头出发，走向推测的未来。火、田和碑会留在身后，回头还看得见。": "The next stretch starts from this stone and heads into a conjectured future. The fire, the field and the monolith stay behind you, still in sight when you turn around.",
  "走完整条路": "Walk the whole road", "这个世界没有打开": "This world did not open", "返回加速史": "Back to the chronicle",
} };
