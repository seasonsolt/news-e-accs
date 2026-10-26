import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { pictureProgress, stepPicture, tunnelPictures } from "../app/features/chrono/format.ts";
import { embedPath, FROM_SCENE, readSceneCommand, readSceneEvent, TO_SCENE } from "../app/features/chrono/scene-handoff.ts";

const eras: ChronicleEra[] = [-1e9, 1900].map((from, i) => ({ id: `era-${i}`, from, title: "Era", summary: "", art: `era-${i}`, artStyle: "" }));
const milestones: ChronicleMilestone[] = [{ id: "engine", t: 1822, art: "engine" }, { id: "bare", t: 1850 }, { id: "old", t: -1e6, art: "old" }]
  .map((m) => ({ precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com", ...m }));

test("the tunnel's pictures are the arrow keys' stops in axis order, a scene on its milestone's plate", () => {
  const pictures = tunnelPictures(eras, milestones, new Map([["m-engine", "/chronicle/engine"]]));
  assert.deepEqual(pictures.map((p) => p.src), ["/media/art/epochs/era-0", "/media/art/moments/old", "/media/art/moments/engine", "/media/art/epochs/era-1"]);
  assert.deepEqual(pictures.map((p) => p.scene), [undefined, undefined, "/chronicle/engine", undefined]);
  // Every stop of stepPicture is a picture of the tunnel, and resting on one is an integer position.
  let t = -2e9;
  for (let i = 0; i < pictures.length; i++) {
    t = stepPicture(eras, milestones, t, 1);
    assert.equal(t, pictures[i]!.t);
    assert.equal(pictureProgress(pictures, t, 2026), i);
  }
});

test("era scenes attach to their own plate; an illustrated milestone never borrows the era scene", () => {
  const pictures = tunnelPictures(eras, milestones, new Map([["e-era-0", "/chronicle/early"], ["m-engine", "/chronicle/engine"]]));
  assert.equal(pictures[0]!.scene, "/chronicle/early");
  assert.equal(pictures[1]!.scene, undefined);
  assert.equal(pictures[2]!.scene, "/chronicle/engine");
  assert.equal(pictures[3]!.scene, undefined);
});

test("between two pictures the tunnel is in flight; beyond the ends it rests on the first or the last", () => {
  const pictures = tunnelPictures(eras, milestones, new Map());
  const between = pictureProgress(pictures, 1860, 2026);
  assert.ok(between > 2 && between < 3, String(between));
  assert.ok(pictureProgress(pictures, 1880, 2026) > between);
  assert.equal(pictureProgress(pictures, -5e9, 2026), 0);
  assert.equal(pictureProgress(pictures, 2026, 2026), pictures.length - 1);
});

test("the hand-over accepts only its own messages, same-origin, from the other window", () => {
  const frame = {} as Window, other = {} as Window;
  const event = (data: unknown, source: Window, origin = "https://e-acc.ai") => ({ data, source, origin }) as unknown as MessageEvent;
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "ready" }, frame), frame, "https://e-acc.ai"), "ready");
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "exit" }, frame), frame, "https://e-acc.ai"), "exit");
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "ready" }, other), frame, "https://e-acc.ai"), null);
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "ready" }, frame, "https://evil.example"), frame, "https://e-acc.ai"), null);
  assert.equal(readSceneEvent(event({ source: TO_SCENE, type: "enter" }, frame), frame, "https://e-acc.ai"), null);
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "launch" }, frame), frame, "https://e-acc.ai"), null);
  assert.equal(readSceneEvent(event(null, frame), frame, "https://e-acc.ai"), null);
  assert.equal(readSceneEvent(event({ source: FROM_SCENE, type: "ready" }, frame), null, "https://e-acc.ai"), null);
  assert.equal(readSceneCommand(event({ source: TO_SCENE, type: "enter" }, frame), frame, "https://e-acc.ai"), "enter");
  assert.equal(readSceneCommand(event({ source: FROM_SCENE, type: "ready" }, frame), frame, "https://e-acc.ai"), null);
  assert.equal(embedPath("/chronicle/engine"), "/chronicle/engine?embed");
});
