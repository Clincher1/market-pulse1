/**
 * Browser responses must never be stored, but the Vercel edge may keep its
 * existing shared cache. Vercel-CDN-Cache-Control is intentionally separate:
 * it does not grant browsers a freshness lifetime.
 */
export function setBrowserNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

/** Keep response-level CDN freshness without enabling browser caching. */
export function setVercelCdnCache(res, policy) {
  if (typeof policy === 'string' && policy.trim()) {
    res.setHeader('Vercel-CDN-Cache-Control', policy.trim());
  }
}
