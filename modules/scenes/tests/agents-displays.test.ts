import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { drawWorkspace, drawTerminal, drawHardware, type ScreenContext } from "../web/agents-2026/screens.ts";
import { curvedPanel } from "../web/agents-2026/display-geometry.ts";

function drawnText(draw: (c: ScreenContext, phase: number, time?: number) => void, phase: number, time = 0) {
  const values: string[] = [];
  const target: Record<string, unknown> = { fillText: (value: string) => values.push(value) };
  const context = new Proxy(target, { get: (object, key: string) => key in object ? object[key] : () => {}, set: (object, key: string, value) => { object[key] = value; return true; } });
  draw(context as unknown as ScreenContext, phase, time); return values;
}

test("all physical display text stays English through standby, plan, build, verify", () => {
  for (const draw of [drawWorkspace, drawTerminal, drawHardware]) {
    for (let phase = 0; phase <= 3; phase++) for (const time of [0, .5, 1, 4, 12]) {
      const values = drawnText(draw, phase, time); assert.ok(values.length > 10);
      for (const value of values) assert.match(value, /^[\x20-\x7e]*$/, value);
    }
  }
  for (let phase = 0; phase < 3; phase++) assert.equal(drawnText(drawWorkspace, phase).filter(v => v === "PASS").length, 0);
  assert.equal(drawnText(drawWorkspace, 3).filter(v => v === "PASS").length, 3);
  assert.ok(drawnText(drawHardware, 0).includes("STANDBY"));
  assert.ok(drawnText(drawHardware, 3).includes("VERIFIED"));
});

test("coding playback moves the highlight and blinks the cursor without advancing verification", () => {
  const frame = (draw: typeof drawWorkspace, phase: number, time: number) => {
    const calls: unknown[] = [];
    const context = new Proxy({} as Record<string, unknown>, {
      get: (object, key: string) => key in object ? object[key] : (...args: unknown[]) => calls.push([key, object.fillStyle, ...args]),
      set: (object, key: string, value) => { object[key] = value; return true; },
    });
    draw(context as unknown as ScreenContext, phase, time); return calls;
  };
  for (const draw of [drawWorkspace, drawTerminal]) {
    assert.notDeepEqual(frame(draw, 2, 0), frame(draw, 2, .5));
    assert.notDeepEqual(frame(draw, 2, 0), frame(draw, 2, 1));
    for (const phase of [0, 1, 3]) assert.deepEqual(frame(draw, phase, 0), frame(draw, phase, 4));
    assert.deepEqual(frame(draw, 2, 0), frame(draw, 2, NaN));
    for (const time of [0, .5, 1, 12]) {
      const values = drawnText(draw, 2, time);
      assert.ok(values.some(value => value.includes("local playback")));
      assert.equal(values.filter(value => value === "PASS" || value === "3 checks passed.").length, 0);
    }
  }
});

test("the ultrawide has continuous physical curvature, readable UVs and a pickable front face", () => {
  const geometry = curvedPanel(1.75, .48, 1.3), positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv"), normals = geometry.getAttribute("normal");
  geometry.computeBoundingBox(); assert.ok(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z > .25);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    assert.ok(Math.abs(Math.hypot(x, 1.3 - z) - 1.3) < 1e-6);
    assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
    assert.ok(normals.getZ(i) > .75);
  }
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(); const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(mesh).length > 0);
  geometry.dispose(); material.dispose();
});
