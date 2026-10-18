import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { migrationPlan } from "../../../scripts/migration-safety.ts";
test("wallpaper migrations are single online statements and swap the signup constraint safely", () => {
  for (const directory of [new URL("../migrations/", import.meta.url), new URL("../../../database/migrations/", import.meta.url)]) {
    for (const file of readdirSync(directory).filter((name) => /^01(?:29|3[0-4])_/.test(name))) assert.ok(migrationPlan(readFileSync(new URL(file, directory), "utf8")));
  }
  assert.match(readFileSync(new URL("../../../database/migrations/0133_newsletter_wallpaper_source.sql", import.meta.url), "utf8"), /NOT VALID/);
});
