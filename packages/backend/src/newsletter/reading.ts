// The daily letter's closing reading: where the chronicle's axis stands today and how fast the curve is
// moving, the figures of the front page's first screen.
import { chronicleNow, type ChronicleNow, type CostReading } from "@aihot/contracts/chronicle";
import { FEATURES } from "@aihot/industry/features";
import { sql } from "../db.ts";
import { serverModules, type LetterFeature } from "../modules.ts";
import type { DistributionLanguage } from "../publication/distribution.ts";
import { kardashevNow, loadChronicle } from "../publication/chronicle.ts";

export interface LetterReading {
  axis: ChronicleNow;
  kardashev: number | null;
  cost: CostReading | null;
}

export async function letterReading(language: DistributionLanguage): Promise<LetterReading | null> {
  if (!FEATURES.timeMachine) return null;
  const axis = chronicleNow(loadChronicle(language), null);
  if (!axis) return null;
  const reader = serverModules().find((m) => m.newsletter?.cost)?.newsletter?.cost;
  return { axis, kardashev: kardashevNow(), cost: reader ? await reader() : null };
}

/** Before a language's first letter, what was published in the last two days. */
const FIRST_LETTER_WINDOW_MS = 48 * 3600_000;

/** The modules' pieces for the letter: those first published since the language's last letter went out. */
export async function letterFeatures(language: DistributionLanguage): Promise<LetterFeature[]> {
  const modules = serverModules().filter((m) => m.newsletter?.features);
  if (!modules.length) return [];
  const [last] = await sql<{ at: Date | null }[]>`SELECT max(sent_at) AS at FROM newsletter_language_sends WHERE language = ${language} AND status = 'sent'`;
  const since = last?.at ?? new Date(Date.now() - FIRST_LETTER_WINDOW_MS);
  return (await Promise.all(modules.map((m) => m.newsletter!.features!(since, language)))).flat();
}
