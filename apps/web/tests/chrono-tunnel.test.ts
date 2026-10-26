import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { focusAt, restingPicture, stepPicture, tunnelPictures, workshopStops } from "../app/features/chrono/format.ts";
import { embedPath, FROM_SCENE, readSceneCommand, readSceneEvent, TO_SCENE } from "../app/features/chrono/scene-handoff.ts";

const eras: ChronicleEra[] = [-1e9, 1900].map((from, i) => ({ id: `era-${i}`, from, title: "Era", summary: "", art: `era-${i}`, artStyle: "" }));
const milestones: ChronicleMilestone[] = [{ id: "engine", t: 1822, art: "engine" }, { id: "bare", t: 1850 }, { id: "old", t: -1e6, art: "old" }]
  .map((m) => ({ precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com", ...m }));

test("the tunnel's pictures are the arrow keys' stops in axis order, a scene on its milestone's plate", () => {
  const pictures = tunnelPictures(eras, milestones, new Map([["m-engine", "/chronicle/engine"]]));
  assert.deepEqual(pictures.map((p) => p.src), ["/media/art/epochs/era-0", "/media/art/moments/old", "/media/art/moments/engine", "/media/art/epochs/era-1"]);
  assert.deepEqual(pictures.map((p) => p.scene), [undefined, undefined, "/chronicle/engine", undefined]);
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

test("era scenes attach to their own plate; an illustrated milestone never borrows the era scene", () => {
  const pictures = tunnelPictures(eras, milestones, new Map([["e-era-0", "/chronicle/early"], ["m-engine", "/chronicle/engine"]]));
  assert.equal(pictures[0]!.scene, "/chronicle/early");
  assert.equal(pictures[1]!.scene, undefined);
  assert.equal(pictures[2]!.scene, "/chronicle/engine");
  assert.equal(pictures[3]!.scene, undefined);
});

test("workshop stops deduplicate paths, prefer their illustrated milestone and stay in time order", () => {
  const pictures = [
    { t: 1900, src: "engine-era", scene: "/chronicle/engine" },
    { t: 2025, src: "agents-era", scene: "/chronicle/agents" },
    { t: 1822, src: "engine-milestone", scene: "/chronicle/engine", milestone: milestones[0]! },
    { t: -1e6, src: "early-milestone", scene: "/chronicle/early", milestone: milestones[2]! },
    { t: -2e6, src: "early-era", scene: "/chronicle/early" },
  ];
  const labels = new Map([["/chronicle/agents", "Agent studio"], ["/chronicle/engine", "Engine workshop"], ["/chronicle/early", "Early workshop"]]);
  const expected = [
    { t: -1e6, src: "early-milestone", path: "/chronicle/early", label: "Early workshop" },
    { t: 1822, src: "engine-milestone", path: "/chronicle/engine", label: "Engine workshop" },
    { t: 2025, src: "agents-era", path: "/chronicle/agents", label: "Agent studio" },
  ];
  assert.deepEqual(workshopStops(pictures, labels), expected);
  assert.deepEqual(workshopStops([...pictures].reverse(), labels), expected);
});

test("workshop stops omit unlabeled and non-enterable pictures without inventing an entrance", () => {
  assert.deepEqual(workshopStops([
    { t: 1800, src: "ordinary-plate" },
    { t: 1822, src: "unlabeled-plate", scene: "/chronicle/unlabeled" },
    { t: 1900, src: "empty-label", scene: "/chronicle/empty" },
  ], new Map([["/chronicle/empty", ""], ["/chronicle/absent", "No picture"]])), []);
  assert.deepEqual(workshopStops([], new Map([["/chronicle/absent", "No picture"]])), []);
});

test("every registered workshop has one stop that reaches its own timeline picture", async () => {
  const { SCENES } = await import("../../../modules/scenes/scenes.ts");
  const { eras } = JSON.parse(readFileSync(new URL("../../../industry/chronicle/eras.json", import.meta.url), "utf8")) as { eras: ChronicleEra[] };
  const { milestones } = JSON.parse(readFileSync(new URL("../../../industry/chronicle/milestones.json", import.meta.url), "utf8")) as { milestones: ChronicleMilestone[] };
  const paths = new Map(SCENES.flatMap(scene => [
    ...(scene.era ? [[`e-${scene.era}`, scene.path] as const] : []),
    ...(scene.milestone ? [[`m-${scene.milestone}`, scene.path] as const] : []),
  ]));
  const pictures = tunnelPictures(eras, milestones, paths);
  const stops = workshopStops(pictures, new Map(SCENES.map(scene => [scene.path, scene.label])));
  assert.equal(stops.length, SCENES.length);
  assert.deepEqual(new Set(stops.map(stop => stop.path)), new Set(SCENES.map(scene => scene.path)));
  for (const stop of stops) assert.ok(pictures.some(picture => picture.t === stop.t && picture.scene === stop.path && picture.src === stop.src), stop.path);
});

test("an era opening on an illustrated milestone is one picture, so every arrow step flies exactly one", () => {
  const opening: ChronicleEra[] = [...eras, { id: "era-2", from: 1950, title: "Era", summary: "", art: "era-2", artStyle: "" }];
  const marked: ChronicleMilestone[] = [...milestones, { id: "turn", t: 1950, art: "turn", precision: "year", title: "Moment", detail: "", category: "compute", source: "https://example.com" }];
  const pictures = tunnelPictures(opening, marked, new Map());
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
  const pictures = tunnelPictures(eras, milestones, new Map());
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
