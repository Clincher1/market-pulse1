import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/production-audit.yml', 'utf8');
test('read-only audit is not pinned to a retired work branch', () => {
  assert.match(workflow, /branches: \['arena\/\*\*'\]/);
  assert.match(workflow, /startsWith\(github.ref, 'refs\/heads\/arena\/'\)/);
  assert.doesNotMatch(workflow, /arena\/[0-9a-f]{8}-/);
});
test('audit evidence can only be pushed to its own unchanged checkout branch', () => {
  assert.ok(workflow.includes('test "$GITHUB_REF" = "refs/heads/$GITHUB_REF_NAME"'));
  assert.ok(workflow.includes('case "$GITHUB_REF_NAME" in arena/*) ;; *) exit 1 ;; esac'));
  assert.ok(workflow.includes('test "$(git rev-parse FETCH_HEAD)" = "$GITHUB_SHA"'));
  assert.ok(workflow.includes('git push origin "HEAD:$GITHUB_REF_NAME"'));
});
