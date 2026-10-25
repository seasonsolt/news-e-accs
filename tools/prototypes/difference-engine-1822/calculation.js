// A quadratic needs a constant second difference: no multiplication in the engine.
export function initialRegisters() { return { n: 0, a: 0, b: 1, c: 2 }; }

export function advanceRegisters({ n, a, b, c }) {
  return { n: n + 1, a: a + b, b: b + c, c };
}

export function digits(value, width = 5) {
  return String(value).padStart(width, "0").slice(-width).split("").map(Number);
}

// The walls and the engine are solid for keyboard walking.
export function canWalkTo(x, z) {
  return x > -6.4 && x < 6.4 && z > -3.8 && z < 15.8 && !(x > -2.75 && x < 3.1 && z > -1.4 && z < 1.65);
}
