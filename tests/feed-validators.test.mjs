import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanEtag,
  cleanLastModified,
  conditionalFeedHeaders,
  sameFeedValidators,
  validatorsAfterResponse,
} from '../supabase/functions/_shared/feed-validators.ts';

const NONE = { etag: null, lastModified: null };

test('conditional RSS requests send only validators that exist', () => {
  assert.deepEqual(conditionalFeedHeaders(NONE), {});
  assert.deepEqual(
    conditionalFeedHeaders({ etag: ' W/"feed-17" ', lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' }),
    {
      'If-None-Match': 'W/"feed-17"',
      'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
    },
  );
});

test('304 keeps prior validators when the server omits them', () => {
  const previous = { etag: '"stable"', lastModified: 'Tue, 10 Nov 2026 10:00:00 GMT' };
  assert.deepEqual(validatorsAfterResponse(304, new Headers(), previous), previous);
});

test('304 may refresh validator values without requiring a response body', () => {
  const previous = { etag: '"old"', lastModified: null };
  assert.deepEqual(
    validatorsAfterResponse(304, new Headers({ etag: '"new"' }), previous),
    { etag: '"new"', lastModified: null },
  );
});

test('a valid 200 replaces validators and clears ones no longer supplied', () => {
  const previous = { etag: '"old"', lastModified: 'Tue, 10 Nov 2026 10:00:00 GMT' };
  assert.deepEqual(
    validatorsAfterResponse(200, new Headers({ etag: '"new"' }), previous),
    { etag: '"new"', lastModified: null },
  );
  assert.equal(validatorsAfterResponse(503, new Headers(), previous), null);
});

test('untrusted or oversized response header values are not retained', () => {
  assert.equal(cleanEtag('   '), null);
  assert.equal(cleanEtag(`"${'x'.repeat(512)}"`), null);
  assert.equal(cleanLastModified('Wed, 21 Oct 2015\r\nX-Injected: yes'), null);
  assert.equal(
    validatorsAfterResponse(200, new Headers({ etag: `"${'x'.repeat(600)}"` }), NONE)?.etag,
    null,
  );
});

test('validator equality is independent of whitespace around stored values', () => {
  assert.equal(
    sameFeedValidators(
      { etag: '  "etag" ', lastModified: ' Wed, 21 Oct 2015 07:28:00 GMT ' },
      { etag: '"etag"', lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' },
    ),
    true,
  );
});
