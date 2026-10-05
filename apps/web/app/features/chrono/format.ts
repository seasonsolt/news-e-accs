// Reader-facing numbers for the four-dimensional view: 79.6 亿人, 1.9×10¹³ 瓦, 3 天, 39,897 千米/时.
import type { ChronicleMetric } from "@aihot/contracts/chronicle";

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** 1.9×10¹³ */
export function scientific(v: number, digits = 1): string {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return trimFixed(v, e < 0 ? 3 : digits);
  const m = v / 10 ** e;
  const exp = String(e).replace("-", "⁻").replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]!);
  return `${trimFixed(m, digits)}×10${exp}`;
}

function trimFixed(v: number, digits: number): string {
  return String(Number(v.toFixed(digits)));
}

/** 79.6 亿 · 520 万 · 3,000 */
export function chineseCount(v: number): string {
  if (v >= 1e8) return `${trimFixed(v / 1e8, v >= 1e9 ? 1 : 2)} 亿`;
  if (v >= 1e4) return `${trimFixed(v / 1e4, v >= 1e6 ? 0 : 1)} 万`;
  return Math.round(v).toLocaleString("en-US");
}

/** A span of seconds as the largest sensible unit: 0.07 秒 · 12 分钟 · 3 天 · 2 个月. */
export function duration(seconds: number): string {
  if (seconds < 1) return `${trimFixed(seconds, 2)} 秒`;
  if (seconds < 60) return `${trimFixed(seconds, 0)} 秒`;
  if (seconds < 3600) return `${trimFixed(seconds / 60, 0)} 分钟`;
  if (seconds < 86400) return `${trimFixed(seconds / 3600, 1)} 小时`;
  if (seconds < 86400 * 45) return `${trimFixed(seconds / 86400, 0)} 天`;
  if (seconds < 86400 * 365) return `${trimFixed(seconds / 86400 / 30.44, 0)} 个月`;
  return `${trimFixed(seconds / 86400 / 365.2425, 1)} 年`;
}

/** The value of a metric with its unit, as the dashboard shows it. */
export function metricValue(metric: ChronicleMetric, v: number): { value: string; unit: string } {
  switch (metric.key) {
    case "population":
      return { value: chineseCount(v), unit: "人" };
    case "energy":
      return { value: scientific(v), unit: "瓦" };
    case "messaging":
      return { value: duration(v), unit: "" };
    case "travel":
      return { value: Math.round(v).toLocaleString("en-US"), unit: "千米/时" };
    default:
      return { value: scientific(v), unit: metric.unit };
  }
}

/** A time for the URL: short, and exact enough to land on the same point of the axis. */
export function timeParam(t: number, now: number): string {
  return Number(t.toPrecision(15)).toString().replace("e+", "e");
}

/** The next capability's distance, using the same units as the moment label. */
export function untilLabel(from: number, to: number): string {
  return to - from < 1 / 365 ? "即将出现" : `${distanceLabel(to, from)}出现`;
}

/** "距今 300 年" or, past now, "300 年后". */
export function distanceLabel(t: number, now: number): string {
  const d = now - t;
  const abs = Math.abs(d);
  const words = abs >= 1e8 ? `${trimFixed(abs / 1e8, 1)} 亿年` : abs >= 1e4 ? `${trimFixed(abs / 1e4, 1)} 万年` : abs >= 1 ? `${Math.round(abs)} 年` : abs >= 1 / 12 ? `${Math.round(abs * 12)} 个月` : `${Math.max(0, Math.round(abs * 365.2425))} 天`;
  if (abs < 1 / 365) return "就是现在";
  return d > 0 ? `距今 ${words}` : `${words}后`;
}
