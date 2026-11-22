import { guideEnglish } from "./guide-messages.ts";
import { LINES } from "./land.ts";

// Chinese copy is the key; `en` is the English edition. The road's own lines are listed in land.ts.
const lines: Record<string, string> = {
  "约一百万年前。天黑以后，火没有熄灭。": "About a million years ago. After dark, the fire stayed lit.",
  "带着火往前走。天还没有亮。": "Carry the fire forward. It is not yet dawn.",
  "有人把红土按在石壁上，留下了手印和名字。": "Someone pressed red earth to the rock, and left a handprint and a name.",
  "一万两千年前。有人没有吃掉最后一把种子。": "Twelve thousand years ago. Someone did not eat the last handful of seed.",
  "人为了麦子停下脚步，盖起屋子，守着粮仓。": "For wheat, people stopped walking, built houses and guarded a granary.",
  "一万年里，麦子改造了人的脊背、河流和历法。": "In ten thousand years, wheat reshaped human backs, rivers and calendars.",
  "是谁驯化了谁？": "Who domesticated whom?",
  "后来，人类把闪电、算式和全部记忆，喂给了沙子。": "Later, humans fed lightning, equations and all their memory into sand.",
  "今天。麦田中央立着一块石头。": "Today. A stone stands in the middle of the wheat.",
};
for (const [, line] of LINES) if (/[㐀-鿿]/.test(line) && !lines[line]) throw new Error(`No English edition for the line: ${line}`);

export const messages = { en: {
  ...lines,
  ...guideEnglish,
  "从火堆": "From Fire", "到巨石": "to Monolith",
  "第一人称漫游": "First-person walk", "约两分钟": "About 2 min",
  "从夜里的一堆火出发，穿过黎明时分的村落。在麦田尽头，伸手触碰那块沉默的石头。": "Walk from a night fire through a village at dawn. A black stone waits in the wheat.",
  "阅读图文路线": "Read the field notes", "沿途三幕": "Three chapters along the road",
  "火堆": "Hearth", "麦田": "Wheat field", "巨石": "Monolith", "今天": "Today",
  "约一百万年前": "A million years ago", "约一万两千年前": "12,000 years ago",
  "正在载入三维场景": "Loading the 3D scene", "正在铺设地形与天空": "Laying out the land and sky",
  "正在生成麦田": "Growing the wheat field", "正在搭建营地、村落与巨石": "Building the camp, village and monolith",
  "正在绘制第一帧光影": "Lighting the first frame", "场景准备进度": "Scene preparation", "正在准备入口": "Preparing the controls",
  "取消": "Cancel", "重试": "Try again",
  "三维场景未能打开。可以重试，或阅读下方图文路线。": "The 3D scene could not open. Try again or read the illustrated route below.",
  "从火堆到巨石": "From Fire to Monolith", "加速史": "Chronicle",
  "一百万年，一条路。夜里的火，清晨的田，下午的麦子，和麦田中央那块石头，都在同一个世界里。": "A million years, one road. The fire at night, the field at dawn, the wheat in the afternoon and the stone in the middle of it all stand in one world.",
  "可行走的三维世界：从火堆穿过麦田走到巨石": "A walkable 3D world: from a hearth, through the wheat, to the monolith",
  "W A S D 行走 · 拖动环视 · Shift 加快 · E 互动": "W A S D to walk · drag to look · Shift to hurry · E to act",
  "拖动环视 · 按住下方按钮前行 · 或开自动前行": "Drag to look · hold the button below to walk · or turn on auto-walk",
  "正在打开世界": "Opening the world", "开始行走": "Start walking", "再走一遍": "Walk again", "自动前行": "Auto-walk", "按住前行": "Hold to walk", "声音": "Sound",
  "此刻走到": "You are at", "此刻走到 · 约": "You are at · about",
  "Ⅰ · 火": "I · Fire", "Ⅱ · 田": "II · Field", "Ⅲ · 碑": "III · Monolith",
  "添柴": "Feed the fire", "播种": "Sow", "触碰巨石": "Touch the monolith",
  "火光把夜晚推远了一点。一天，变长了。": "The firelight pushes the night back a little. The day grows longer.",
  "种子落进土里。田，自己向前铺开。": "The seed is in the ground. The field unrolls ahead on its own.",
  "在你之前，已经有人播下了种子。": "Someone sowed here before you came.",
  "石头是凉的。": "The stone is cool to the touch.",
  "麦田尽头": "At the field’s edge",
  "风吹过麦穗。你从一百万年前的火塘走到了这里。": "Wind stirs the wheat. A million years ago, you stood beside a fire.",
  "返回加速史": "Back to the chronicle",
  "分享这条路": "Share this road", "链接已复制": "Link copied", "读《降临派宣言》": "Read the Manifesto",
  // The way in on the chronicle and the manifesto (apps/web/app/routes/chronicle.tsx, manifesto.tsx).
  "走进去": "Step inside", "第一人称，从火堆走到巨石 · 约两分钟": "First person, from the fire to the monolith · about two minutes",
  "走一遍这条路 →": "Walk the road →",
} };
