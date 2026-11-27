import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync('.github/workflows/production-audit.yml', 'utf8');
const automatic = readFileSync('.github/workflows/facts-links-audit.yml', 'utf8');
const comparison = readFileSync('.github/workflows/capture-market-comparison.yml', 'utf8');
const profile = readFileSync('.github/workflows/profile-world-startup.yml', 'utf8');

test('read-only production audits are manual-only and not pinned to retired branches', () => {
  for (const source of [workflow, automatic, comparison, profile]) {
    assert.match(source, /workflow_dispatch:/);
    assert.doesNotMatch(source, /^  (push|pull_request):/m);
    assert.match(source, /contents: read/);
    assert.doesNotMatch(source, /contents: write/);
    assert.match(source, /startsWith\(github.ref, 'refs\/heads\/arena\/'\)/);
    assert.doesNotMatch(source, /arena\/[0-9a-f]{8}-/);
  }
});
test('manual audit evidence is kept as artifacts, never committed or pushed by a workflow', () => {
  for (const source of [workflow, automatic, comparison, profile]) {
    assert.match(source, /actions\/upload-artifact@/);
    assert.doesNotMatch(source, /git (commit|push)/);
  }
});
test('consolidated manual coverage keeps two complete technical/source rounds and the interaction/math audit', () => {
  assert.equal((automatic.match(/run: node scripts\/technical-audit\.mjs/g) || []).length, 2);
  assert.equal((automatic.match(/run: node scripts\/facts-links-check\.mjs/g) || []).length, 2);
  assert.match(automatic, /TECHNICAL_AUDIT_OUTPUT: \.local\/production-audit\/technical-A/);
  assert.match(automatic, /TECHNICAL_AUDIT_OUTPUT: \.local\/production-audit\/technical-B/);
  assert.match(automatic, /run: node scripts\/production-audit\.mjs/);
  assert.match(automatic, /run: node scripts\/wait-production-artifact\.mjs/);
  assert.match(automatic, /install --with-deps chromium firefox webkit/);
});
