import { guideEnglish } from "./guide-messages.ts";
import { LINES } from "./land.ts";

// Chinese copy is the key; `en` is the English edition. The road's own lines are listed in land.ts.
const lines: Record<string, string> = {
  "天黑以后，还有人往火里添柴。": "After dark, someone stays to feed the fire.",
  "有人背起行囊。孩子踩着前人的脚印，走出火光。": "Someone shoulders a bundle. A child follows the footprints out of the firelight.",
  "手早已离开石壁，后来的人还看得见掌印。": "The hand is long gone. The next person still sees its print.",
  "篮子里的麦粒，有人留着明年再种。": "Someone saved the wheat in that basket for next year’s sowing.",
  "麦种被带到了新的土地。种麦的人却在田边住了下来。": "People carried wheat to new ground, then settled beside the fields.",
  "收进仓的谷物有多少？芦苇笔在湿泥上留下了账。": "How much grain came in? A reed pressed into wet clay keeps the tally.",
  "人给麦田挖了水渠，也让自己的日子跟着收成走。": "People dug channels for the wheat and planned their year around its harvest.",
  "纸从压板下揭起来。同一行字，又多了一个读者。": "A sheet lifts from the press. The same line of type can reach another reader.",
  "风推着磨盘转。有人在这里把麦粒磨成面粉。": "Wind turns the millstones. Here the grain is ground into flour.",
  "换一串孔卡，织出的花纹就变了。": "Change the chain of punched cards and a different pattern appears in the cloth.",
  "街边的电线上停着几只鸟。沿着这排电杆走，就到了实验室。": "A few birds perch on the wires above the street. The line of poles leads to a laboratory.",
  "有人想从远处登录。线路中断前，另一台计算机收到了 LO。": "Someone tries to log in from afar. Before the connection drops, the other computer receives LO.",
  "风扇在响。机房里的模型，学的是人留下的文字和代码。": "Listen to the fans. Inside, models learn from words and code that people wrote.",
};
for (const [, line] of LINES) if (/[㐀-鿿]/.test(line) && !lines[line]) throw new Error(`No English edition for the line: ${line}`);

export const messages = { en: {
  ...lines,
  ...guideEnglish,
  "从火堆": "From Fire", "到巨石": "to Monolith",
  "加速史 · 第一人称漫游": "Chronicle · A first-person walk", "约两分钟": "About 2 min",
  "给火添柴，为来年留一把麦种。走过粮仓和工房，听见今天机房里的风扇。": "Tend the fire. Save wheat for next year. Walk past the granary and the workshops until you hear the fans of a data center.",
  "阅读图文路线": "Read the field notes", "沿途三幕": "Three chapters along the road",
  "火堆": "Hearth", "麦田": "Wheat field", "巨石": "Monolith", "今天": "Today",
  "约一百万年前": "A million years ago", "约一万两千年前": "12,000 years ago",
  "正在载入三维场景": "Loading the 3D scene", "正在铺设地形与天空": "Laying out the land and sky",
  "正在生成麦田": "Growing the wheat field", "正在搭建营地、村落与巨石": "Building the camp, village and monolith",
  "正在绘制第一帧光影": "Lighting the first frame", "场景准备进度": "Scene preparation", "正在准备入口": "Preparing the controls",
  "取消": "Cancel", "重试": "Try again",
  "三维场景未能打开。可以重试，或阅读下方图文路线。": "The 3D scene could not open. Try again or read the illustrated route below.",
  "从火堆到巨石": "From Fire to Monolith", "加速史": "Chronicle",
  "从火塘走到麦田，再到训练 AI 的机房。《加速史》的一段可行走的寓言，讲人与小麦如何改变彼此，也讲今天的人与 AI。": "Walk from a hearth through wheat fields to an AI data center. A fable from the Chronicle about how people and wheat shaped each other, and what that might mean for people and AI today.",
  "可行走的三维世界：从火堆穿过麦田走到巨石": "A walkable 3D world: from a hearth, through the wheat, to the monolith",
  "W A S D 行走 · 拖动环视 · Shift 加快 · E 互动": "W A S D to walk · drag to look · Shift to hurry · E to act",
  "拖动环视 · 按住下方按钮前行 · 或开自动前行": "Drag to look · hold the button below to walk · or turn on auto-walk",
  "正在打开世界": "Opening the world", "开始行走": "Start walking", "再走一遍": "Walk again", "自动前行": "Auto-walk", "按住前行": "Hold to walk", "声音": "Sound",
  "此刻走到": "You are at", "此刻走到 · 约": "You are at · about",
  "Ⅰ · 火": "I · Fire", "Ⅱ · 田": "II · Field", "Ⅲ · 碑": "III · Monolith",
  "添柴": "Feed the fire", "播种": "Sow", "触碰巨石": "Touch the monolith",
  "火光把夜晚推远了一点。一天，变长了。": "The firelight pushes the night back a little. The day grows longer.",
  "你撒下这把麦种。到了收割的时候，人还得回来。": "You scatter the wheat. Someone will have to come back for the harvest.",
  "在你之前，已经有人播下了种子。": "Someone sowed here before you came.",
  "石头是凉的。": "The stone is cool to the touch.",
  "我们立起的碑": "The stone we raised",
  "AI 读过人写的程序。如今，写程序的人也会停下来，读它续上的下一行。": "We trained AI on code people wrote. Now we pause to read the next line it suggests.",
  "返回加速史": "Back to the chronicle",
  "看今天的加速史": "Today in the Chronicle",
  "分享这条路": "Share this road", "链接已复制": "Link copied", "读宣言里的〈小麦〉": "Read “Wheat”",
  // The way in on the chronicle and the manifesto (apps/web/app/routes/chronicle.tsx, manifesto.tsx).
  "走进去": "Step inside", "守火、种麦，走到今天的 AI 机房 · 约两分钟": "Tend a fire, sow wheat and walk to an AI data center · about two minutes",
  "走一遍这条路 →": "Walk the road →",
} };
