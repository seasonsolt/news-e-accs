import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const target = '1'.repeat(40);
const previous = '2'.repeat(40);
const update = readFileSync(new URL('../deploy/update.sh', import.meta.url), 'utf8');
function run(options: { fails?: boolean; missingBase?: boolean; offMain?: boolean; status?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'local-release-test-'));
  mkdirSync(path.join(root, 'bin'));
  const script = (name: string, body: string) => writeFileSync(path.join(root, name), '#!/usr/bin/env bash\nset -eu\n' + body, { mode: 0o755 });
  writeFileSync(path.join(root, 'update.sh'), update);
  writeFileSync(path.join(root, 'remote.sh'), '# fixture, never connects to a server\n');
  script('bin/git', `case "$*" in
  *merge-base*) exit ${options.offMain ? 1 : 0} ;;
  *rev-parse*) echo ${target} ;;
  *log*) echo fixture ;;
esac\n`);
  script('bin/ssh', `case "$*" in
  *status*) echo '==> live: ${options.missingBase ? 'none' : previous}' ;;
  *deploy*) echo "$*" > "$RESULT/deployed" ;;
esac\n`);
  script('verify.sh', `printf '%s\\n' "$@" > "$RESULT/checked"\nexit ${options.fails ? 1 : 0}\n`);
  try {
    const result = spawnSync('bash', [path.join(root, 'update.sh'), ...(options.status ? ['--status'] : [])], {
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, RESULT: root, SKIP_CI: '1' }, encoding: 'utf8',
    });
    return { status: result.status, checked: existsSync(path.join(root, 'checked')) ? readFileSync(path.join(root, 'checked'), 'utf8') : null,
      deployed: existsSync(path.join(root, 'deployed')) ? readFileSync(path.join(root, 'deployed'), 'utf8') : null };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('deployment validates the exact target against the live release before switching', () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(result.checked, `${target}\n${previous}\n`);
  assert.match(result.deployed!, new RegExp(`deploy ${target}`));
});
test('failed checks cannot deploy, including with the retired SKIP_CI variable', () => {
  const result = run({ fails: true });
  assert.notEqual(result.status, 0);
  assert.equal(result.deployed, null);
});
test('unknown live release and commits outside main cannot reach verification or deployment', () => {
  for (const options of [{ missingBase: true }, { offMain: true }]) {
    const result = run(options);
    assert.notEqual(result.status, 0);
    assert.equal(result.checked, null);
    assert.equal(result.deployed, null);
  }
});
test('read-only production status does not need Docker or release checks', () => {
  const result = run({ status: true });
  assert.equal(result.status, 0);
  assert.equal(result.checked, null);
  assert.equal(result.deployed, null);
});
