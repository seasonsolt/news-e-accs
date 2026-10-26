import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { SCENES } from "../scenes.ts";
import { WORLDS } from "../web/shared/worlds.ts";
import { messages } from "../web/shared/messages.ts";

test("every workshop entrance points to a real era or illustrated milestone and a registered page", () => {
  const eras = JSON.parse(readFileSync(new URL("../../../industry/chronicle/eras.json", import.meta.url), "utf8")).eras as Array<{ id: string }>;
  const milestones = JSON.parse(readFileSync(new URL("../../../industry/chronicle/milestones.json", import.meta.url), "utf8")).milestones as Array<{ id: string; art?: string }>;
  assert.equal(new Set(SCENES.map((s) => s.path)).size, SCENES.length);
  for (const scene of SCENES) {
    if (scene.id !== "difference-engine-1822") assert.ok((messages.en as Record<string, string>)[scene.label], scene.label);
    assert.ok(scene.era || scene.milestone);
    if (scene.era) assert.ok(eras.some((e) => e.id === scene.era), scene.era);
    if (scene.milestone) assert.ok(milestones.some((m) => m.id === scene.milestone && m.art), scene.milestone);
    assert.ok(existsSync(new URL(`../web/${scene.id}/page.tsx`, import.meta.url)), scene.id);
  }
});

test("new workshops have translated educational copy, local references and a reachable next stop", () => {
  const en: Record<string, string> = messages.en;
  for (const world of Object.values(WORLDS)) {
    assert.ok(SCENES.some((s) => s.id === world.id && s.path === world.path));
    assert.ok(SCENES.some((s) => s.id === world.next));
    assert.ok(existsSync(new URL(`../../../apps/web/public${world.plate}`, import.meta.url)));
    for (const text of [world.title, world.subtitle, world.action, world.unitLabel, world.note, ...world.readingLabels, ...world.phases.flatMap((p) => [p.title, p.detail, ...p.readings])]) {
      if (/[\u3400-\u9fff]/.test(text)) assert.ok(en[text] && !/[\u3400-\u9fff]/.test(en[text]), text);
    }
  }
});
