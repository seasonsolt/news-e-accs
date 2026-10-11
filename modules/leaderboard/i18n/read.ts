import type { LbRunInfo } from "../contracts.ts";
import { REASONS } from "../backend/fetch/configuration.ts";
import type { LeaderboardLanguage } from "../backend/registry.ts";
import english from "./en.json" with { type: "json" };

export const CONFIGURATION_LABELS = {
  sourceDefault: "来源默认配置",
  max: "Max 推理",
  xhigh: "xHigh 推理",
  high: "High 推理",
  medium: "Medium 推理",
  low: "Low 推理",
  minimal: "Minimal 推理",
  nonReasoning: "非推理配置",
  adaptiveReasoning: "自适应推理",
  adaptive: "自适应",
  fallback: "含来源回退",
  system: "完整系统",
  unreported: "来源未报告推理档位",
} as const;

export const SELECTION_REASONS = {
  ...REASONS,
  tapTapContributor: "来源的 contributor 别名未对应到已核实的公开模型。",
  terminalReferenceOnly: "保留模型与 Agent 的完整系统成绩供参考，不参与综合或编程排名。",
} as const;

const configurations = new Map<string, string>(Object.entries(CONFIGURATION_LABELS).map(([key, label]) => [label, english.configurationLabels[key as keyof typeof CONFIGURATION_LABELS]]));
const reasons = new Map<string, string>(Object.entries(SELECTION_REASONS).map(([key, reason]) => [reason, english.selectionReasons[key as keyof typeof SELECTION_REASONS]]));

/** Stored configurations retain upstream system names, budgets and version numbers. */
export function configurationLabel(label: string | null, lang: LeaderboardLanguage): string | null {
  if (!label || lang === "zh") return label;
  return label.split(" · ").map((part) => configurations.get(part) ?? part.replace(/^(.*) 推理$/, "$1 reasoning")).join(" · ");
}

export function selectionReason(reason: string | null, lang: LeaderboardLanguage): string | null {
  return reason && lang === "en" ? reasons.get(reason) ?? reason : reason;
}

export function runInfo(run: LbRunInfo, lang: LeaderboardLanguage): LbRunInfo {
  if (lang === "zh" || !run.fx) return run;
  return { ...run, fx: { ...run.fx, sourceName: run.fx.sourceName === "欧洲央行" ? english.fx.ecb : run.fx.sourceName } };
}

export function budgetName(key: string, name: string, lang: LeaderboardLanguage): string {
  return lang === "en" ? english.budgets[key as keyof typeof english.budgets] ?? name : name;
}

export function usageLabel(status: string | undefined, lang: LeaderboardLanguage): string {
  const key = status === "ranked" || status === "cross_reference" ? status : "reference_only";
  if (lang === "en") return english.usage[key];
  return key === "ranked" ? "已计入综合排名" : key === "cross_reference" ? "交叉参考" : "仅供参考";
}

export function rowsNote(systemRows: boolean, lang: LeaderboardLanguage): string {
  if (lang === "en") return english.rowsNotes[systemRows ? "systems" : "models"];
  return systemRows
    ? "下列为模型搭配不同 Agent 的系统成绩，运行条件不同，仅供参考。每项最多展示 30 条配置，匿名测试型号不展示。"
    : "按固定规则，每个公开模型采用一套代表配置。匿名测试型号不展示，保留原榜名次，每项最多 30 个。";
}
