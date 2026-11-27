import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = await readFile(new URL('../.github/workflows/update-static-snapshot.yml', import.meta.url), 'utf8');
const names = [
  'Check changed files (snapshot and generated charts only)',
  'Check main is still current',
  'Commit validated snapshot and charts locally',
  'Push snapshot commit (approved App, no force)',
];
function step(name) {
  const block = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0];
  assert.ok(block, `missing step ${name}`);
  return block;
}
function script(name) {
  return step(name).split('        run: |\n')[1].split('\n')
    .map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
}

// Execute the actual workflow Bash with a strict fake git. No network, credentials,
// real commits/branches/pushes, or changes to the repository under test.
const fakeGit = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2), e = process.env;
fs.appendFileSync(e.MOCK_COMMANDS, JSON.stringify(args) + '\\n');
const command = args.join(' ');
const out = value => { if (value) console.log(value); };
if (command === 'diff --name-only') out(e.MOCK_CHANGED);
else if (command === 'diff --cached --name-only') out(fs.existsSync(e.MOCK_ADDED) ? e.MOCK_STAGED_AFTER_ADD : e.MOCK_STAGED);
else if (command === 'ls-files --others --exclude-standard') out(e.MOCK_UNTRACKED);
else if (command === 'fetch origin main') { out(e.MOCK_REMOTE_OUTPUT); process.exit(Number(e.MOCK_FETCH_EXIT || 0)); }
else if (command === 'rev-parse FETCH_HEAD') out(e.MOCK_REMOTE_SHA);
else if (command === 'rev-parse HEAD') out(e.MOCK_LOCAL_SHA);
else if (command === "config user.name Clincher1" || command === 'config user.email 88886535+Clincher1@users.noreply.github.com') {}
else if (command === 'add -A -- data/snapshot.json public/snapshot-charts/brent.svg public/snapshot-charts/sp500.svg public/snapshot-charts/gold.svg') fs.writeFileSync(e.MOCK_ADDED, 'yes');
else if (args[0] === 'commit' && args[1] === '-m' && args[2] === 'Refresh validated static market snapshot and charts') process.exit(Number(e.MOCK_COMMIT_EXIT || 0));
else if (command === 'push origin HEAD:main') {
  fs.writeFileSync(e.MOCK_AUTH, JSON.stringify({count:e.GIT_CONFIG_COUNT,key:e.GIT_CONFIG_KEY_0,value:e.GIT_CONFIG_VALUE_0}));
  out(e.MOCK_REMOTE_OUTPUT); process.exit(Number(e.MOCK_PUSH_EXIT || 0));
}
else { console.error('unexpected git command'); process.exit(99); }
`;
async function fixture(overrides, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-workflow-'));
  await writeFile(join(dir, 'git'), fakeGit, { mode: 0o700 });
  const summary = join(dir, 'summary');
  const output = join(dir, 'output');
  const commands = join(dir, 'commands');
  await Promise.all([summary, output, commands].map(file => writeFile(file, '')));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`,
    RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output,
    SNAPSHOT_BASE_SHA: 'a'.repeat(40), MOCK_REMOTE_SHA: 'a'.repeat(40), MOCK_LOCAL_SHA: 'a'.repeat(40),
    MOCK_AUTH: join(dir, 'auth.json'), SNAPSHOT_APP_TOKEN: 'FAKE_APP_TOKEN_FOR_UNIT_TEST',
    MOCK_COMMANDS: commands, MOCK_ADDED: join(dir, 'added'), MOCK_CHANGED: 'data/snapshot.json',
    MOCK_STAGED: '', MOCK_STAGED_AFTER_ADD: 'data/snapshot.json', MOCK_UNTRACKED: '',
    MOCK_REMOTE_OUTPUT: '', MOCK_FETCH_EXIT: '0', MOCK_COMMIT_EXIT: '0', MOCK_PUSH_EXIT: '0',
    ...overrides,
  };
  const run = async name => {
    const result = spawnSync('bash', ['-c', script(name)], { cwd: dir, env, encoding: 'utf8' });
    assert.ifError(result.error);
    return { ...result, summary: await readFile(summary, 'utf8'), output: await readFile(output, 'utf8'),
      commands: (await readFile(commands, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) };
  };
  try { await callback(run, dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('four ordered stages retain read-only GITHUB_TOKEN and success gating', () => {
  let position = -1;
  for (const name of names) {
    const next = workflow.indexOf(`      - name: ${name}\n`);
    assert.ok(next > position); position = next;
  }
  assert.match(workflow, /\npermissions:\n  contents: read\n/);
  assert.match(workflow, /\n    permissions:\n      contents: read\n    steps:/);
  assert.doesNotMatch(workflow, /pull-requests: write|actions: write|write-all|--admin/);
  const notification = step('Notify Telegram if snapshot update failed');
  assert.match(notification, /continue-on-error: true/);
  assert.doesNotMatch(workflow.replace(notification, ''), /continue-on-error/);
  const heartbeat = step('Send Better Stack heartbeat after scheduled refresh');
  assert.match(heartbeat, /if: success\(\) && github\.event_name == 'schedule'/);
  assert.match(heartbeat, /BETTERSTACK_HEARTBEAT_URL: \$\{\{ secrets\.BETTERSTACK_HEARTBEAT_URL \}\}/);
  const successNotification = step('Notify Telegram on successful snapshot update');
  assert.match(successNotification, /if: success\(\)/);
  assert.match(successNotification, /steps\.betterstack_heartbeat\.outputs\.result/);
  assert.match(step(names[0]), /id: snapshot_changes/);
  for (const name of names.slice(1)) {
    assert.match(step(name), /if: steps.snapshot_changes.outputs.has_changes == 'true'/);
    assert.doesNotMatch(step(name), /always\(\)/);
  }
  assert.doesNotMatch(workflow, /git push[^\n]*(?:--force|-f\b)|git (?:rebase|reset)|gh pr merge/);
});

test('only snapshot is accepted and empty changes skip commit/push', async () => {
  await fixture({}, async run => {
    const r = await run(names[0]);
    assert.equal(r.status, 0); assert.match(r.output, /has_changes=true/);
    assert.match(r.summary, /PASS: only snapshot data and generated chart assets changed/);
    assert.ok(!r.commands.some(args => ['commit', 'push'].includes(args[0])));
  });
  await fixture({ MOCK_CHANGED: '' }, async run => {
    const r = await run(names[0]);
    assert.equal(r.status, 0); assert.match(r.output, /has_changes=false/);
  });
});
for (const [label, overrides] of [
  ['extra tracked file', { MOCK_CHANGED: 'data/snapshot.json\npackage.json' }],
  ['different tracked file', { MOCK_CHANGED: 'package.json' }],
  ['untracked file', { MOCK_UNTRACKED: 'unexpected.tmp' }],
  ['staged file', { MOCK_STAGED: 'package.json' }],
  ['even staged snapshot', { MOCK_STAGED: 'data/snapshot.json' }],
  ['no candidate but untracked file', { MOCK_CHANGED: '', MOCK_UNTRACKED: 'unexpected.tmp' }],
]) {
  test(`changed-file guard rejects ${label} with diagnostic, without commit/push`, async () => fixture(overrides, async run => {
    const r = await run(names[0]);
    assert.equal(r.status, 1); assert.match(r.stdout, /::error::Changed-file guard failed/);
    assert.match(r.summary, /FAILED:/); assert.doesNotMatch(r.output, /has_changes=true/);
    assert.ok(!r.commands.some(args => ['add', 'commit', 'push'].includes(args[0])));
  }));
}

test('main guard compares actual fetched main and local HEAD with checkout base', async () => fixture({}, async run => {
  const r = await run(names[1]); assert.equal(r.status, 0);
  assert.match(r.summary, /Checkout base: a{40}\nFetched main: a{40}\nLocal HEAD: a{40}/);
}));
for (const overrides of [{ MOCK_REMOTE_SHA: 'b'.repeat(40) }, { MOCK_LOCAL_SHA: 'b'.repeat(40) }]) {
  test(`revision guard stops on ${Object.keys(overrides)[0]} movement before commit`, async () => fixture(overrides, async run => {
    const r = await run(names[1]); assert.equal(r.status, 1);
    assert.match(r.summary, /main or local HEAD moved/);
    assert.ok(!r.commands.some(args => ['add', 'commit', 'push'].includes(args[0])));
  }));
}
test('fetch failure preserves exit code and withholds remote output', async () => fixture({ MOCK_FETCH_EXIT: '128', MOCK_REMOTE_OUTPUT: 'SENSITIVE_SENTINEL' }, async run => {
  const r = await run(names[1]); assert.equal(r.status, 128);
  assert.match(r.summary, /fetch main \(exit 128\)/);
  assert.doesNotMatch(r.stdout + r.stderr + r.summary, /SENSITIVE_SENTINEL/);
}));

test('commit stages only snapshot, reports local SHA, never pushes', async () => fixture({}, async run => {
  const r = await run(names[2]); assert.equal(r.status, 0);
  assert.match(r.summary, /local snapshot commit a{40}. Not yet pushed/);
  assert.deepEqual(r.commands.filter(args => args[0] === 'add'), [['add', '-A', '--', 'data/snapshot.json', 'public/snapshot-charts/brent.svg', 'public/snapshot-charts/sp500.svg', 'public/snapshot-charts/gold.svg']]);
  assert.ok(!r.commands.some(args => args[0] === 'push'));
}));
for (const overrides of [
  { MOCK_CHANGED: 'package.json' }, { MOCK_STAGED: 'package.json' }, { MOCK_UNTRACKED: 'extra.tmp' },
  { MOCK_STAGED_AFTER_ADD: 'data/snapshot.json\npackage.json' },
]) {
  test(`commit rechecks file allowlist: ${Object.keys(overrides)[0]}`, async () => fixture(overrides, async run => {
    const r = await run(names[2]); assert.equal(r.status, 1);
    assert.match(r.summary, /FAILED: .*guard/);
    assert.ok(!r.commands.some(args => ['commit', 'push'].includes(args[0])));
  }));
}
test('local commit failure is distinguished from push failure', async () => fixture({ MOCK_COMMIT_EXIT: '128' }, async run => {
  const r = await run(names[2]); assert.equal(r.status, 128);
  assert.match(r.summary, /local commit \(exit 128\); no push/);
  assert.ok(!r.commands.some(args => args[0] === 'push'));
}));

for (const [output, expected] of [
  ['GH006 protected branch SENSITIVE_SENTINEL', /Branch protection or repository rules/],
  ['GH013 repository rule violations SENSITIVE_SENTINEL', /Branch protection or repository rules/],
  ['required status check verify SENSITIVE_SENTINEL', /Branch protection or repository rules/],
  ['non-fast-forward SENSITIVE_SENTINEL', /Main changed after the revision check/],
  ['403 permission denied SENSITIVE_SENTINEL', /authentication\/permission rejected/],
  ['network error SENSITIVE_SENTINEL', /Unclassified push failure/],
]) {
  test(`push refusal is classified safely: ${output.split(' ')[0]}`, async () => fixture({ MOCK_PUSH_EXIT: '1', MOCK_REMOTE_OUTPUT: output }, async (run, dir) => {
    const r = await run(names[3]); assert.equal(r.status, 1);
    assert.match(r.summary, expected);
    assert.doesNotMatch(r.stdout + r.stderr + r.summary, /SENSITIVE_SENTINEL/);
    assert.deepEqual(r.commands, [['push', 'origin', 'HEAD:main']]);
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('snapshot-push.')));
  }));
}
test('normal push success reports SHA and cleans up private remote output', async () => fixture({ MOCK_REMOTE_OUTPUT: 'SENSITIVE_SENTINEL' }, async (run, dir) => {
  const r = await run(names[3]); assert.equal(r.status, 0);
  assert.match(r.summary, /commit a{40} pushed to main/);
  assert.doesNotMatch(r.stdout + r.stderr + r.summary, /SENSITIVE_SENTINEL/);
  assert.deepEqual(r.commands, [['push', 'origin', 'HEAD:main'], ['rev-parse', 'HEAD']]);
  assert.ok(!(await readdir(dir)).some(name => name.startsWith('snapshot-push.')));
}));

test('App write token is scoped, pinned, minted after commit and revoked by the action', () => {
  const token = step('Create short-lived snapshot App write token');
  const identity = step('Check approved snapshot App identity');
  assert.ok(workflow.indexOf('      - name: Create short-lived snapshot App write token')
    > workflow.indexOf('      - name: Commit validated snapshot and charts locally'));
  assert.match(token, /if: steps.snapshot_changes.outputs.has_changes == 'true'/);
  assert.match(identity, /if: steps.snapshot_changes.outputs.has_changes == 'true'/);
  assert.match(token, /uses: actions\/create-github-app-token@[a-f0-9]{40}/);
  assert.match(token, /app-id: \$\{\{ vars.SNAPSHOT_APP_ID \}\}/);
  assert.match(token, /private-key: \$\{\{ secrets.SNAPSHOT_APP_PRIVATE_KEY \}\}/);
  assert.match(token, /owner: Clincher1\n          repositories: market-pulse1/);
  assert.match(token, /permission-contents: write/);
  assert.match(token, /skip-token-revoke: 'false'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(step(names[3]), /SNAPSHOT_APP_TOKEN: \$\{\{ steps.snapshot-app-token.outputs.token \}\}/);
  assert.doesNotMatch(workflow, /permission-(?:administration|actions|pull-requests):/);
  for (const name of names.slice(0, 3)) assert.doesNotMatch(step(name), /SNAPSHOT_APP_TOKEN|PRIVATE_KEY/);
});

test('only approved App ID passes the runtime identity guard', async () => {
  for (const id of ['', '1234', '5872216']) {
    await fixture({ SNAPSHOT_APP_ID: id }, async run => {
      const r = await run('Check approved snapshot App identity');
      assert.equal(r.status, id === '5872216' ? 0 : 1);
      assert.deepEqual(r.commands, []);
    });
  }
});

test('missing App token stops before git push; never falls back to GITHUB_TOKEN', async () => fixture({ SNAPSHOT_APP_TOKEN: '' }, async run => {
  const r = await run(names[3]); assert.equal(r.status, 1);
  assert.match(r.stdout, /App token is missing/);
  assert.deepEqual(r.commands, []);
}));

test('App authentication reaches git only via process-scoped config, not logs or command arguments', async () => fixture({}, async (run, dir) => {
  const r = await run(names[3]); assert.equal(r.status, 0);
  const auth = JSON.parse(await readFile(join(dir, 'auth.json'), 'utf8'));
  assert.equal(auth.count, '1');
  assert.equal(auth.key, 'http.https://github.com/.extraheader');
  const basic = Buffer.from('x-access-token:FAKE_APP_TOKEN_FOR_UNIT_TEST').toString('base64');
  assert.equal(auth.value, `AUTHORIZATION: basic ${basic}`);
  const visible = r.stdout + r.stderr + r.summary + JSON.stringify(r.commands);
  assert.ok(!visible.includes('FAKE_APP_TOKEN_FOR_UNIT_TEST'));
  assert.ok(!visible.includes(basic));
  assert.deepEqual(r.commands, [['push', 'origin', 'HEAD:main'], ['rev-parse', 'HEAD']]);
}));
