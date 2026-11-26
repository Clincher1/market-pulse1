import test from 'node:test';
import assert from 'node:assert/strict';
import { formatObservationTimestamp } from '../src/lib/dateDisplay.mjs';

test('formats full timestamps in one explicit UTC display style and drops seconds', () => {
  assert.equal(formatObservationTimestamp('2026-11-26T12:54:48.000000Z'), '26.11.2026 12:54 UTC');
  assert.equal(formatObservationTimestamp('2026-10-27T20:00:59+03:00'), '27.10.2026 17:00 UTC');
});

test('date-only values stay date-only and invalid inputs do not leak raw timestamps', () => {
  assert.equal(formatObservationTimestamp('2026-11-26'), '26.11.2026');
  assert.equal(formatObservationTimestamp('2026-02-30T12:00:00Z'), '');
  assert.equal(formatObservationTimestamp('not a date'), '');
  assert.equal(formatObservationTimestamp(null), '');
});
