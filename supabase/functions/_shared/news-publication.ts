/** A publication time belongs to the publisher, never to the ingestion clock. */
export function publicationTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const timestamp = Date.parse(raw.trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
