import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { focusAt, restingPicture, stepPicture, tunnelPictures } from "../app/features/chrono/format.ts";

const eras: ChronicleEra[] = [-1e9, 1900].map((from, i) => ({ id: `era-${i}`, from, title: "Era", summary: "", art: `era-${i}`, artStyle: "" }));
const milestones: ChronicleMilestone[] = [{ id: "engine", t: 1822, art: "engine" }, { id: "bare", t: 1850 }, { id: "old", t: -1e6, art: "old" }]
  .map((m) => ({ precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com", ...m }));

test("the tunnel's pictures are the arrow keys' stops in axis order", () => {
  const pictures = tunnelPictures(eras, milestones);
  assert.deepEqual(pictures.map((p) => p.src), ["/media/art/epochs/era-0", "/media/art/moments/old", "/media/art/moments/engine", "/media/art/epochs/era-1"]);
  // The deck shows the picture's own milestone, and an era's opening shows the era.
  assert.deepEqual(pictures.map((p) => p.milestone?.id), [undefined, "old", "engine", undefined]);
  // Every stop of stepPicture is a picture of the tunnel, and the view rests on that very picture.
  let t = -2e9;
  for (let i = 0; i < pictures.length; i++) {
    t = stepPicture(eras, milestones, t, 1);
    assert.equal(t, pictures[i]!.t);
    assert.equal(restingPicture(pictures, t, 2026), i);
  }
});

test("an era opening on an illustrated milestone is one picture, so every arrow step flies exactly one", () => {
  const opening: ChronicleEra[] = [...eras, { id: "era-2", from: 1950, title: "Era", summary: "", art: "era-2", artStyle: "" }];
  const marked: ChronicleMilestone[] = [...milestones, { id: "turn", t: 1950, art: "turn", precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com" }];
  const pictures = tunnelPictures(opening, marked);
  assert.equal(pictures.filter((p) => Math.abs(p.t - 1950) < 1e-6).map((p) => p.src).join(), "/media/art/moments/turn");
  for (const direction of [1, -1] as const) {
    let at = direction === 1 ? 0 : pictures.length - 1;
    for (;;) {
      const next = stepPicture(opening, marked, pictures[at]!.t, direction);
      if (next === pictures[at]!.t) break;
      const resting = restingPicture(pictures, next, 2026);
      assert.equal(resting, at + direction, `${pictures[at]!.t} → ${next}`);
      at = resting;
    }
    assert.equal(at, direction === 1 ? pictures.length - 1 : 0);
  }
});

test("between two pictures the view rests on the nearer one, and the arrows step on from it by one", () => {
  const pictures = tunnelPictures(eras, milestones);
  assert.equal(restingPicture(pictures, 1823, 2026), 2);
  assert.equal(restingPicture(pictures, 1899, 2026), 3);
  assert.equal(restingPicture(pictures, -5e9, 2026), 0);
  assert.equal(restingPicture(pictures, 2026, 2026), pictures.length - 1);
  assert.equal(restingPicture([], 2026, 2026), -1);
  // Resting on 1900's plate at 1899, ‹ goes back one picture, not to 1900 itself.
  assert.equal(stepPicture(eras, milestones, pictures[restingPicture(pictures, 1899, 2026)]!.t, -1), 1822);
  assert.equal(stepPicture(eras, milestones, pictures[restingPicture(pictures, 1823, 2026)]!.t, 1), 1900 + 1e-9);
});

test("of two milestones at one moment the deck shows the illustrated one, the picture in view", () => {
  const twins: ChronicleMilestone[] = [{ id: "bare", t: 2026.7 }, { id: "drawn", t: 2026.7, art: "drawn" }]
    .map((m) => ({ precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com", ...m }));
  assert.equal(focusAt(twins, 2026.7, 2026.8)?.id, "drawn");
  assert.equal(focusAt([...twins].reverse(), 2026.7, 2026.8)?.id, "drawn");
});
