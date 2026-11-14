/** HTTP validators for a source's most recent successful RSS/Atom response. */
export type FeedValidators = {
  etag: string | null;
  lastModified: string | null;
};

const MAX_ETAG_LENGTH = 512;
const MAX_LAST_MODIFIED_LENGTH = 128;

function cleanHeader(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

export function cleanEtag(value: string | null | undefined): string | null {
  return cleanHeader(value, MAX_ETAG_LENGTH);
}

export function cleanLastModified(value: string | null | undefined): string | null {
  return cleanHeader(value, MAX_LAST_MODIFIED_LENGTH);
}

export function conditionalFeedHeaders(validators: FeedValidators): Record<string, string> {
  const headers: Record<string, string> = {};
  const etag = cleanEtag(validators.etag);
  const lastModified = cleanLastModified(validators.lastModified);
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  return headers;
}

/**
 * A 304 means the cached representation is still current; servers are allowed
 * to omit validators on that response, so retain the values we sent. A 200
 * replaces them (including clearing a validator the server stopped providing).
 */
export function validatorsAfterResponse(
  status: number,
  headers: Pick<Headers, 'get'>,
  previous: FeedValidators,
): FeedValidators | null {
  if (status === 304) {
    return {
      etag: cleanEtag(headers.get('etag')) ?? cleanEtag(previous.etag),
      lastModified: cleanLastModified(headers.get('last-modified')) ?? cleanLastModified(previous.lastModified),
    };
  }
  if (status === 200) {
    return {
      etag: cleanEtag(headers.get('etag')),
      lastModified: cleanLastModified(headers.get('last-modified')),
    };
  }
  return null;
}

export function sameFeedValidators(left: FeedValidators, right: FeedValidators): boolean {
  return cleanEtag(left.etag) === cleanEtag(right.etag)
    && cleanLastModified(left.lastModified) === cleanLastModified(right.lastModified);
}
