import type { GameId } from "../games/types.ts";
import { CRAFT_WORLDS } from "../games/craft.ts";
import { SCIENCE_WORLDS } from "../games/science.ts";
import { MODERN_WORLDS } from "../games/modern.ts";
export type WorldId = "agents-2026" | "stone-tools" | "taming-fire" | "agriculture" | GameId;
export type Vec3 = [number, number, number];
export interface Phase { title: string; detail: string; readings: [string, string, string] }
export interface World {
  id: WorldId;
  path: string;
  time: number;
  figure: string;
  unit: string;
  englishDate?: [string, string];
  title: string;
  subtitle: string;
  plate: string;
  action: string;
  unitLabel: string;
  readingLabels: [string, string, string];
  phases: Phase[];
  note: string;
  source: string;
  next: WorldId | "difference-engine-1822";
  challenge?: boolean;
}

export const WORLDS: Record<WorldId, World> = {
  "agents-2026": {
    id: "agents-2026", path: "/chronicle/agents", time: 2026, figure: "2026", unit: "年", title: "智能体工坊",
    subtitle: "桌上写着代码，窗外连接世界。让下一次创造，从这里开始。",
    plate: "/media/art/epochs/agents-workflow-1600.webp", action: "推进任务", unitLabel: "探索距离",
    readingLabels: ["任务阶段", "完成步骤", "交付状态"],
    phases: [
      { title: "一个想法，等待开始。", detail: "弧形超宽屏上的三个工作区对应计划、实现和验证。点击工作站或控制台，观察任务怎样推进。", readings: ["待命", "0 / 3", "待开始"] },
      { title: "先把目标写清楚。", detail: "计划工作区亮起：拆解需求、列出约束，确定怎样才算完成。此处演示的是一个本地预设任务。", readings: ["计划", "1 / 3", "进行中"] },
      { title: "让想法成为可以检查的作品。", detail: "编辑器持续演示 coding，竖向终端记录流程。三扇窗共同望向同一处全景；推进任务或停留片刻，一起从富士山切换到巴黎、长城。", readings: ["实现", "2 / 3", "待验证"] },
      { title: "验证通过，才算交付。", detail: "验证工作区显示三项预设检查结果，工作流完成。这是交互演示，不连接真实智能体、算力或生产任务。", readings: ["验证", "3 / 3", "演示完成"] },
    ],
    note: "2026 年的创作空间概念场景。窗景为 AI 生成图像，展示于三维虚拟窗中。任务、指示灯与检查结果均为预设演示，不代表实际模型表现或数据中心遥测。",
    source: "https://www.energy.gov/hgeo/geothermal/geothermal-and-data-centers", next: "stone-tools",
  },
  "stone-tools": {
    id: "stone-tools", path: "/chronicle/stone-tools", time: -3300000, figure: "330", unit: "万年前", englishDate: ["3.3", "million years ago"], title: "石器工坊",
    subtitle: "一块石头，一次有目的的敲击。工具，开始延伸身体的边界。",
    plate: "/media/art/epochs/homo-stone-tools-1600.webp", action: "打制一次", unitLabel: "探索距离",
    readingLabels: ["工序", "剥片次数", "石核状态"],
    phases: [
      { title: "先读懂一块石头。", detail: "石核与锤石放在河滩的工作石上。走近观察棱面，再点击锤石，开始一段简化的剥片演示。", readings: ["选材", "0", "完整"] },
      { title: "第一片锋利的边缘。", detail: "锤石击中石核边缘，一片石片被剥离。锋利的石片本身就是工具，不必先做成对称的手斧。", readings: ["剥片", "1", "新鲜断面"] },
      { title: "沿着边缘，继续塑形。", detail: "第二次敲击留下新的剥片疤。切换侧面视角，比较原石皮与新断面的质感。", readings: ["修整", "2", "多处断面"] },
      { title: "让材料，成为工具。", detail: "三次预设剥片完成，石片散落在工作面上。演示强调锤石、石核与石片的关系，不模拟真实断裂力学。", readings: ["完成", "3", "石核与石片"] },
    ],
    note: "早期石器制作的艺术概念复原，年代沿用时间线的约 330 万年前入口。石核、锤石与石片只示意剥片关系，不把较晚的对称手斧当作最早石器。",
    source: "https://humanorigins.si.edu/evidence/behavior/stone-tools/early-stone-age-tools", next: "taming-fire",
  },
  "taming-fire": {
    id: "taming-fire", path: "/chronicle/fire", time: -1000000, figure: "100", unit: "万年前", englishDate: ["1", "million years ago"], title: "火的工坊",
    subtitle: "黄昏降临，火留了下来。照料一束火光，也是在延长人类的一天。",
    plate: "/media/art/epochs/taming-fire-1600.webp", action: "照料火堆", unitLabel: "探索距离",
    readingLabels: ["工序", "火堆状态", "获得能力"],
    phases: [
      { title: "先守住一小簇余烬。", detail: "旷野的石头风挡旁留着微弱的余烬。点击火堆，依次添加细枝与木柴，观察火光怎样改变整个空间。", readings: ["余烬", "微弱", "保留火种"] },
      { title: "细枝，让火焰站起来。", detail: "细小燃料被放到余烬上，橙色火焰亮起。周围石块与岩壁开始显出暖色。", readings: ["添细枝", "起焰", "照明"] },
      { title: "木柴，延续光与热。", detail: "更粗的燃料加入火堆，火焰与投影增强。可以走近观察炭化木纹、灰烬与上升的火星。", readings: ["添木柴", "稳定", "取暖"] },
      { title: "围绕火，生活有了新的中心。", detail: "火堆稳定燃烧，成为照明、取暖和处理食物的空间。此处不演示点火发明，也不认定所有能力同时出现。", readings: ["照料", "持续燃烧", "处理食物"] },
    ],
    note: "年代采用时间线的约 100 万年前入口，不表示用火起源已有确切定论。石头风挡、火堆和燃料为概念复原；只借用原画的赭石色与光感，不在此年代安放较晚的洞穴壁画。",
    source: "https://humanorigins.si.edu/evidence/behavior/hearths-shelters", next: "agriculture",
  },
  "agriculture": {
    id: "agriculture", path: "/chronicle/agriculture", time: -9999, figure: "1.2", unit: "万年前", englishDate: ["12", "thousand years ago"], title: "农业工坊",
    subtitle: "把种子留给下一季。田地、粮仓与村落，让生活开始扎根。",
    plate: "/media/art/epochs/agricultural-revolution-1600.webp", action: "推进农时", unitLabel: "探索距离",
    readingLabels: ["农时", "田地", "储粮"],
    phases: [
      { title: "从一小块土地开始。", detail: "走进泥土与茅草构成的村落。田垄、种子篮和磨盘分布在身边，点击田地开始一季种植的简化演示。", readings: ["整地", "待播", "空"] },
      { title: "把种子，留给下一季。", detail: "种子播入田垄，嫩芽开始出现。作物驯化来自许多代人的选择与环境变化，不是一季之内完成的发明。", readings: ["播种", "幼苗", "空"] },
      { title: "等待，也成为一种工作。", detail: "麦秆长高，麦穗渐渐转为金黄。场景把一个生长季压缩为数秒，便于比较播种与成熟时的田地。", readings: ["生长", "成熟", "待收获"] },
      { title: "收获，为明天留下余量。", detail: "收割后的田地留下短茬，粮食进入储存容器。粮食盈余帮助定居与分工逐步发展，磨盘把谷粒加工为食物。", readings: ["收获", "留茬", "已入仓"] },
    ],
    note: "参照新石器彩陶的土色与几何纹样，搭建早期村落概念场景。年代和生长过程经过压缩，建筑、陶器及作物组合不对应一个精确考古遗址。",
    source: "https://humanorigins.si.edu/human-characteristics/change", next: "difference-engine-1822",
  },
  ...CRAFT_WORLDS,
  ...SCIENCE_WORLDS,
  ...MODERN_WORLDS,
};

/** Finite demonstrations stop at the last stage; replay is an explicit reset. */
export function nextPhase(current: number, count: number) { return Math.min(count - 1, current + 1); }
