# English-native production release — 2026-10-10

News release: `dfa187fd5034bcb9df60f8b0cdf47f2d528aef14` (implementation `42ddd17` plus receipt-test compatibility fix). Entry repository commit: `d9476a1`; Worker version: `996b8a7d-fcde-445f-a68d-5303a167d64e`.

## Deployment and configuration

- User authorized production publication. Excluded local `.claude/launch.json` and `.claude/worktrees/` from commits.
- GitHub Check for implementation initially failed five legacy receipt tests. Changed receipt lookups to include source fingerprint/language direction; subsequent exact-release Check passed: https://github.com/seasonsolt/news-e-accs/actions/runs/38027989095 . No SKIP_CI override.
- Deployed news exclusively with `deploy/update.sh dfa187f`; build, incremental migration startup, API/web/worker health and built-site smoke passed.
- Updated entry Worker only to recognize Chinese news sections; existing English news, Pages tools, static files and sitemap ownership preserved. Six route tests and deployment dry-run passed, then Worker published after news origin.
- Created/configured a distinct empty English Resend segment via `RESEND_SEGMENT_ID_EN`; backed up the shared env privately on server. Existing Chinese segment/subscribers untouched; no manual email or broadcast sent.
- REPORT_TIME_ZONE remains default Asia/Shanghai. MODEL_CALLS_ENABLED and CONTENT_TRANSLATION_ENABLED were already true; no timezone cutover or historical rewriting requested/executed. Existing production NEWSLETTER_ENABLED=true retained.

## Verification

- Public /api/health reports `dfa187fd5034bcb9df60f8b0cdf47f2d528aef14`.
- Public `/`, `/all`, `/hot`, three concepts return English with unchanged canonical even when requests include Chinese Accept-Language and cookie. `/zh`, `/zh/all`, `/zh/daily` return Chinese with self-canonical.
- Public `/what-is-eacc.data`, `/zh/all.data`, `/zh/_.data`, English and Chinese v2 RSS all return 200; personalized HTML/data private,no-store.
- `/pricing`, `/calculator`, `/coding-plan` remain at original URLs/origins and self-canonical; coding-plan retains its existing Chinese body.
- Captured pre/post news sitemap: 1026 URLs before and after, zero removed/added. Checked all 1026 directly against live news origin: 200, English HTML, unchanged self-canonical, no noindex, no errors. This validates sitemap URL preservation, not a Search Console index/ranking guarantee.
- Local implementation checks and independent review are recorded in docs/internationalization.md and workflow artifacts: final focused backend95 pass, web65 pass/1 existing skip, typecheck/build/smoke pass. Exact-release GitHub Check passed both check and docker jobs.

Evidence files: `/tmp/eacc-release-42ddd17/{deploy.log,edge-deploy.log,public-checks.json,sitemap-comparison.json,all-news-url-checks.json}`. Private temporary Worker secret file removed after deployment.

## Operational limits and rollback

Real model editorial quality and ongoing edition completion need monitoring. New English segment starts empty; old contacts are not migrated or emailed by this release. Report timezone remains unchanged. No claim that Search Console indexing/rankings were observed. Application schemas are additive, but do not operate the old and new newsletter workers concurrently; historical old wildcard and new per-language claims differ. Any rollback must evaluate new English-main rows and language-send claims before switching to a pre-compatibility build. Standard production rollback is only through deploy/update.sh; do not hand-edit deployed builds or systemd.

> 后续清理：Coding Plan 工具在 2026-10-18 的改动中退役；上文保留 2026-10-10 当时的验证事实，当前升级说明见 [部署文档](../../docs/deploy.md#2026-10-18移除旧站配置生成器)。
