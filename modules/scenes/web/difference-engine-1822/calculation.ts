export interface Registers { n: number; a: number; b: number; c: number }

// A quadratic needs a constant second difference: no multiplication in the engine.
export function initialRegisters(): Registers { return { n: 0, a: 0, b: 1, c: 2 }; }

export function advanceRegisters({ n, a, b, c }: Registers): Registers {
  return { n: n + 1, a: a + b, b: b + c, c };
}

export function digits(value: number, width = 5): number[] {
  return String(value).padStart(width, "0").slice(-width).split("").map(Number);
}

// The apparatus is solid; paths remain open around the work terrace.
export function canWalkTo(x: number, z: number): boolean {
  return x > -30 && x < 30 && z > -20 && z < 32 && !(x > -2.75 && x < 3.1 && z > -1.4 && z < 1.65);
}
