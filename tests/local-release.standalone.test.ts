import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const target = '1'.repeat(40);
const previous = '2'.repeat(40);
const update = readFileSync(new URL('../deploy/update.sh', import.meta.url), 'utf8');
function run(options: { fails?: boolean; missingBase?: boolean; offMain?: boolean; status?: boolean; rollback?: boolean; core?: boolean; models?: boolean } = {}) {
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
  *status*) if [ -e "$RESULT/deployed" ]; then echo '==> live: ${target}'; else echo '==> live: ${options.missingBase ? 'none' : previous}'; fi
    echo '==> worker role: ${options.core ? 'core' : 'all'}' ;;
  *deploy*|*rollback*) echo "$*" > "$RESULT/deployed" ;;
esac\n`);
  script('models.sh', `echo "$*" > "$RESULT/models"\n`);
  script('verify.sh', `printf '%s\\n' "$@" > "$RESULT/checked"\nexit ${options.fails ? 1 : 0}\n`);
  try {
    const result = spawnSync('bash', [path.join(root, 'update.sh'), ...(options.status ? ['--status'] : options.rollback ? ['--rollback'] : [])], {
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, RESULT: root, SKIP_CI: '1', MODELS_UPDATE: options.models ? path.join(root, 'models.sh') : '' }, encoding: 'utf8',
    });
    const read = (name: string) => existsSync(path.join(root, name)) ? readFileSync(path.join(root, name), 'utf8') : null;
    return { status: result.status, checked: read('checked'), deployed: read('deployed'), models: read('models') };
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
test('a site whose model work runs elsewhere switches that worker to the live build after a deploy or rollback, and needs the command to start', () => {
  const missing = run({ core: true });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.checked, null, 'refused before the release checks');
  assert.equal(missing.deployed, null);
  const deployed = run({ core: true, models: true });
  assert.equal(deployed.status, 0);
  assert.equal(deployed.models, `${target}\n`);
  const rolledBack = run({ core: true, models: true, rollback: true });
  assert.equal(rolledBack.status, 0);
  assert.match(rolledBack.deployed!, /rollback/);
  assert.equal(rolledBack.models, `${target}\n`, 'the build the server reports live after the rollback');
  assert.equal(run({ rollback: true, core: true }).deployed, null);
  assert.equal(run().models, null, 'a single worker needs no command');
});
