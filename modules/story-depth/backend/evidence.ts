import { MODULES } from "@aihot/site/modules";
import { looksEnglish } from "@aihot/backend/editorial/writing";
import { z } from "zod";
import { digestFactEvidence, digestInputsHash, type DigestReport } from "@aihot/backend/publication/story-evidence";
import type { StoryDepth } from "../contracts.ts";

const text = z.string().trim().min(1).max(4000);
const citation = { reportId: z.string().min(1).max(200), quote: z.string().trim().min(1).max(1000) };
export const DepthSchema = z.object({
  background: text,
  numbers: z.array(z.object({ value: z.string().trim().min(1).max(100), context: text, ...citation })).max(10),
  reactions: z.array(z.object({ who: z.string().trim().min(1).max(200), text, ...citation })).max(10),
  accelerates: text,
  curve: z.object({ path: z.string().regex(/^\/index\/[a-z0-9]+(?:-[a-z0-9]+)*$/), label: z.string().trim().min(1).max(200) }).nullable(),
});

export interface Evidence { id: string; hash: string; title: string; source: string; text: string }
export function snapshot(reports: DigestReport[]): Evidence[] {
  return reports.map((r) => ({ id: r.id, hash: digestInputsHash([r]), title: r.title, source: r.source_name,
    text: `${r.title}\n${r.summary ?? ""}\n${JSON.stringify(digestFactEvidence(r))}` }));
}

export function evidenceCurrent(saved: Evidence[], reports: DigestReport[]): boolean {
  const current = new Map(snapshot(reports).map((r) => [r.id, r.hash]));
  return saved.length > 0 && saved.every((r) => current.get(r.id) === r.hash);
}

export const indexPaths = () => MODULES.flatMap((m) => m.pages ?? []).flatMap((p) => "path" in p && /^index\/[a-z0-9-]+$/.test(p.path) ? [`/${p.path}`] : []);

const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

export function validateDepth(input: unknown, evidence: Evidence[]): StoryDepth {
  const content = DepthSchema.parse(input);
  if (![content.background, content.accelerates, ...content.numbers.map((n) => n.context), ...content.reactions.map((r) => r.text)].every(looksEnglish)) throw invalid("Depth prose must be English; source quotes may keep their original language.");
  if (content.curve && !indexPaths().includes(content.curve.path)) throw invalid("Choose an existing index page.");
  for (const item of [...content.numbers, ...content.reactions]) {
    const report = evidence.find((r) => r.id === item.reportId);
    if (!report || !report.text.includes(item.quote)) throw invalid("Every citation needs an exact quote from its stored report.");
  }
  for (const number of content.numbers) {
    if (!/\d/.test(number.value) || !number.quote.includes(number.value)) throw invalid("Each figure must appear verbatim in its source quote.");
    const sourceNumbers = new Set(number.quote.match(/\d+(?:[.,]\d+)*/g) ?? []);
    const digits = `${number.value} ${number.context}`.match(/\d+(?:[.,]\d+)*/g) ?? [];
    if (digits.some((n) => !sourceNumbers.has(n))) throw invalid("Figure or context contains a number absent from its source quote.");
  }
  return content;
}
