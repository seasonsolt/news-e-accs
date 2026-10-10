// Small site-wide facts for the web shell (e.g. the changelog red-dot anchor).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChangelogResponse, SiteMeta } from "@aihot/contracts/site";
import { REPO_ROOT } from "../config.ts";

let changelogCache: ChangelogResponse | null = null;

/** Changelog is published as a data file of the site (site/changelog.json), newest first; a release may carry an English form. */
export function loadChangelog(lang: "en" | "zh" = "zh"): ChangelogResponse {
  changelogCache ??= JSON.parse(readFileSync(path.join(REPO_ROOT, "site/changelog.json"), "utf8")) as ChangelogResponse;
  return {
    latestVersion: changelogCache.latestVersion,
    releases: changelogCache.releases.map(({ en, ...release }) =>
      lang === "en" && en ? { ...release, title: en.title, body: en.body } : release),
  };
}

export function siteMeta(): SiteMeta {
  return { changelogVersion: loadChangelog().latestVersion };
}
