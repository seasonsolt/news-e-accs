// What /api/site/indices/* returns; the web pages read these shapes.

/** One step of a tier's line: from `date` the cheapest model at or above the threshold cost `price`. */
export interface CoiPoint {
  date: string;
  /** Blended USD per million tokens: (3 × input + output) / 4. */
  price: number;
  model: { slug: string; name: string; provider: string | null };
  /** GPQA Diamond accuracy, 0–1. */
  score: number;
  /** The listed price in its own currency, per million tokens. */
  currency: "USD" | "CNY";
  input: number;
  output: number;
  source: string | null;
  /** False while the price awaits a check against an archived vendor page. */
  verified: boolean;
}

export interface CoiTier {
  key: string;
  /** GPQA Diamond accuracy the model must reach, 0–1. */
  threshold: number;
  /** The models that first reached it, for orientation. */
  reference: string;
  points: CoiPoint[];
  /** First price ÷ current price; null with fewer than two points. */
  ratio: number | null;
  /** Months for the price to halve, from a log-linear fit of the line sampled monthly; null when it is not falling. */
  halvingMonths: number | null;
}

export interface CostOfIntelligence {
  asOf: string;
  tiers: CoiTier[];
  /** Models with both a GPQA score and a first-party price. */
  modelCount: number;
  fx: { rate: number; asOf: string } | null;
  gpqa: { fetchedAt: string; url: string | null; license: string | null };
}
