import test from "node:test";
import assert from "node:assert/strict";
import { initialRegisters, advanceRegisters, digits, canWalkTo } from "./calculation.js";

test("finite differences produce the complete 0–99 square table with correct carries", () => {
  let registers = initialRegisters();
  for (let n = 0; n <= 99; n++) {
    assert.equal(registers.n, n);
    assert.equal(registers.a, n * n);
    assert.equal(registers.b, 2 * n + 1);
    assert.equal(registers.c, 2);
    assert.equal(digits(registers.a).join(""), String(n * n).padStart(5, "0"));
    registers = advanceRegisters(registers);
  }
});

test("reset starts a fresh table without retaining the previous calculation", () => {
  const initial = initialRegisters();
  let registers = initial;
  for (let i = 0; i < 12; i++) registers = advanceRegisters(registers);
  assert.equal(registers.a, 144);
  assert.deepEqual(initial, { n: 0, a: 0, b: 1, c: 2 });
  assert.deepEqual(initialRegisters(), initial);
  assert.notEqual(initialRegisters(), initial);
});

test("walking can reach both sides but cannot enter the engine or pass through the walls", () => {
  for (const [x, z] of [[0, 5], [4, 0], [-4, 0], [0, -2.5], [4, 14]]) assert.equal(canWalkTo(x, z), true);
  for (const [x, z] of [[0, 0], [2.7, 1], [7, 2], [-7, 2], [0, -5], [0, 17]]) assert.equal(canWalkTo(x, z), false);
});
