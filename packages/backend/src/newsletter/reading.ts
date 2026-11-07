// The daily letter's closing reading: where the chronicle's axis stands today and how fast the curve is
// moving, the figures of the front page's first screen.
import { chronicleNow, type ChronicleNow, type CostReading } from "@aihot/contracts/chronicle";
import { FEATURES } from "@aihot/industry/features";
import { serverModules } from "../modules.ts";
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
