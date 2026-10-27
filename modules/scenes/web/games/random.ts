/** A source of numbers in [0, 1). Games take it as a parameter: Math.random in the browser, a fixed sequence in tests. */
export type Random = () => number;

export function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Draws `count` different values from `choices`, none of them equal to a value in `avoid`. */
export function drawDistinct<T>(choices: readonly T[], count: number, avoid: readonly T[], random: Random, same: (a: T, b: T) => boolean = (a, b) => a === b): T[] {
  const drawn: T[] = [];
  for (let i = 0; i < count; i++) drawn.push(pick(choices.filter(c => ![...avoid, ...drawn].some(other => same(c, other))), random));
  return drawn;
}
