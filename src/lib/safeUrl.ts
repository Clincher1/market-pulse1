/**
 * External article URLs come from the database/feed layer. Only web URLs are
 * allowed into an href: this prevents accidental or malicious non-web schemes
 * from becoming clickable links if an upstream row is ever corrupted.
 */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
