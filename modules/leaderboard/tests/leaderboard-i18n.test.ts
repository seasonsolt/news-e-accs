import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { LB_CONFIDENCE_LABELS, LB_SOURCE_STATUS_LABELS } from "../contracts.ts";
import { LEADERBOARD_BOARD_LABELS } from "../taxonomy.ts";
import { BOARD_COPY, SOURCE_GROUPS, boardCopy, sourceGroups } from "../backend/registry.ts";
import { BUDGETS } from "../backend/method/v16.ts";
import { configurationOf, scaffolded } from "../backend/fetch/configuration.ts";
import { CONFIGURATION_LABELS, SELECTION_REASONS, configurationLabel, selectionReason, rowsNote, usageLabel } from "../i18n/read.ts";
import english from "../i18n/en.json" with { type: "json" };
import { CHINESE, ENGLISH } from "../i18n/messages.ts";
import { ENGLISH as engineEnglish } from "../../../apps/web/app/lib/messages.ts";

const CJK = /[㐀-鿿＀-￯]/;

function covered(original: unknown, translated: unknown, path: string) {
  if (typeof original === "string") {
    assert.equal(typeof translated, "string", `${path}: English entry is missing`);
    assert.ok((translated as string).length > 0, `${path}: English entry is empty`);
    assert.doesNotMatch(translated as string, CJK, path);
  } else if (original && typeof original === "object") {
    for (const [key, value] of Object.entries(original)) covered(value, (translated as Record<string, unknown>)?.[key], `${path}.${key}`);
  }
}

test("English covers every board, source, group, lineage and stored vocabulary by id", () => {
  covered(LEADERBOARD_BOARD_LABELS, Object.fromEntries(Object.entries(english.boards).map(([key, copy]) => [key, copy.name])), "boards");
  for (const [key, copy] of Object.entries(BOARD_COPY)) {
    const { key: _key, ...text } = copy;
    covered(text, english.boards[key as keyof typeof english.boards], `boards.${key}`);
    assert.doesNotMatch(JSON.stringify(boardCopy(key as keyof typeof BOARD_COPY, "en")), CJK);
  }
  covered(LB_SOURCE_STATUS_LABELS, english.statuses, "statuses");
  covered(LB_CONFIDENCE_LABELS, english.confidence, "confidence");
  for (const budget of BUDGETS) covered(budget.name, english.budgets[budget.key], `budgets.${budget.key}`);
  for (const group of SOURCE_GROUPS) {
    const copy = english.groups[group.key as keyof typeof english.groups];
    covered({ name: group.name, blurb: group.blurb }, copy, `groups.${group.key}`);
    for (const step of group.lineage ?? []) {
      const { current: _current, ...text } = step;
      covered(text, ("lineage" in copy ? copy.lineage as Record<string, unknown> : {})[step.name], `groups.${group.key}.lineage.${step.name}`);
    }
    for (const source of group.sources) {
      const { key, status: _status, logo: _logo, officialUrl: _url, allRows: _allRows, ...text } = source;
      covered(text, english.sources[key as keyof typeof english.sources], `sources.${key}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(sourceGroups("en")), CJK);
  covered(CONFIGURATION_LABELS, english.configurationLabels, "configurationLabels");
  covered(SELECTION_REASONS, english.selectionReasons, "selectionReasons");
  for (const reason of Object.values(SELECTION_REASONS)) {
    assert.doesNotMatch(selectionReason(reason, "en")!, CJK);
    assert.equal(selectionReason(reason, "zh"), reason);
  }
  for (const system of [false, true]) assert.doesNotMatch(rowsNote(system, "en"), CJK);
  for (const status of Object.keys(LB_SOURCE_STATUS_LABELS)) assert.doesNotMatch(usageLabel(status, "en"), CJK);
  assert.doesNotMatch(JSON.stringify(english), CJK);
});

test("stored configuration templates translate tiers and keep system names and budgets", () => {
  for (const tier of ["max", "xhigh", "high", "medium", "low", "minimal", "non-reasoning", "thinking-64k", "default-fallback"]) {
    for (const descriptors of [[tier], ["Adaptive Reasoning", tier], [tier, "default-fallback"]]) {
      const configuration = configurationOf(descriptors);
      for (const label of [configuration.label, scaffolded(configuration, ["codex"], ["Codex 1.2"]).label]) {
        assert.doesNotMatch(configurationLabel(label, "en")!, CJK, label);
        assert.equal(configurationLabel(label, "zh"), label);
      }
    }
  }
  assert.equal(configurationLabel("High 推理 · 自适应 · 64k · Codex 1.2", "en"), "High reasoning · Adaptive · 64k · Codex 1.2");
  assert.equal(configurationLabel("mini-SWE 1.0 · custom 推理", "en"), "mini-SWE 1.0 · custom reasoning");
  assert.equal(configurationLabel("Codex 1.2 · 来源未报告推理档位", "en"), "Codex 1.2 · Reasoning tier not reported by the source");
});

test("module UI copy has English entries and status keys preserve the Chinese labels", () => {
  for (const [key, value] of Object.entries(ENGLISH)) assert.doesNotMatch(value, CJK, key);
  for (const [status, label] of Object.entries(LB_SOURCE_STATUS_LABELS)) {
    assert.equal(CHINESE[`leaderboard.status.${status}`], label);
    assert.equal(ENGLISH[`leaderboard.status.${status}`], english.statuses[status as keyof typeof english.statuses]);
  }
  const directories = [new URL("../web/routes/", import.meta.url), new URL("../web/features/", import.meta.url), new URL("../web/admin/", import.meta.url)];
  for (const directory of directories) for (const file of readdirSync(directory).filter((file) => file.endsWith(".tsx"))) {
    const source = readFileSync(new URL(file, directory), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const match of source.matchAll(/"(?:\\.|[^"\\\r\n])*"/g)) {
      const key = JSON.parse(match[0]) as string;
      if (!CJK.test(key)) continue;
      assert.ok(key in ENGLISH || key in engineEnglish, `${file}: missing English UI entry for ${key}`);
    }
  }
  assert.equal(ENGLISH["前沿"], "Frontier", "the navigation names the frontier hub");
  assert.equal(engineEnglish["观察中"], "Monitoring", "leaderboard statuses do not override event labels");
});
