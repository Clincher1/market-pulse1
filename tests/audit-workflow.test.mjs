import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/production-audit.yml', 'utf8');
const automatic = readFileSync('.github/workflows/facts-links-audit.yml', 'utf8');
test('manual and consolidated automatic read-only audits are not pinned to a retired work branch', () => {
  assert.match(automatic, /branches: \['arena\/\*\*'\]/);
  assert.match(workflow, /workflow_dispatch:/);
  for (const source of [workflow, automatic]) {
    assert.match(source, /startsWith\(github.ref, 'refs\/heads\/arena\/'\)/);
    assert.doesNotMatch(source, /arena\/[0-9a-f]{8}-/);
  }
});
test('both audit evidence writers are restricted to their own unchanged checkout branch', () => {
  assert.ok(workflow.includes('test "$GITHUB_REF" = "refs/heads/$GITHUB_REF_NAME"'));
  for (const source of [workflow, automatic]) {
    assert.ok(source.includes('case "$GITHUB_REF_NAME" in arena/*) ;; *) exit 1 ;; esac'));
    assert.ok(source.includes('test "$(git rev-parse FETCH_HEAD)" = "$GITHUB_SHA"'));
    assert.ok(source.includes('git push origin "HEAD:$GITHUB_REF_NAME"'));
  }
});
test('consolidated automatic coverage keeps two complete technical/source rounds and the interaction/math audit', () => {
  assert.equal((automatic.match(/run: node scripts\/technical-audit\.mjs/g) || []).length, 2);
  assert.equal((automatic.match(/run: node scripts\/facts-links-check\.mjs/g) || []).length, 2);
  assert.match(automatic, /TECHNICAL_AUDIT_OUTPUT: \.local\/production-audit\/technical-A/);
  assert.match(automatic, /TECHNICAL_AUDIT_OUTPUT: \.local\/production-audit\/technical-B/);
  assert.match(automatic, /run: node scripts\/production-audit\.mjs/);
  assert.match(automatic, /run: node scripts\/wait-production-artifact\.mjs/);
  assert.match(automatic, /install --with-deps chromium firefox webkit/);
  assert.doesNotMatch(workflow, /^  push:/m, 'manual fallback must not race the composite evidence writer');
});
