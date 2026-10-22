/** Finite distribution labels; never accept arbitrary campaign or reader identifiers. */
export const DISTRIBUTION_CHANNELS = ["newsletter", "share"] as const;
export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];
export function distributionChannel(value: unknown): DistributionChannel | null {
  return value === "newsletter" || value === "share" ? value : null;
}
export function distributionUrl(url: string, channel: DistributionChannel): string {
  const result = new URL(url);
  result.searchParams.set("via", channel);
  return result.href;
}
