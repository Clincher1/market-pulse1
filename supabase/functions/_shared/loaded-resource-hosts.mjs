const RESOURCE_LINK_RELS = new Set([
  'stylesheet',
  'alternate stylesheet',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  'mask-icon',
  'manifest',
  'preload',
  'modulepreload',
  'prefetch',
  'preconnect',
  'dns-prefetch',
]);

const DEFAULT_ALLOWED_HOSTS = ['supabase.co'];

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function attributesFrom(source) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

/** Collect URL values that make the browser load or initiate a network resource. */
export function findForeignResourceHosts(html, siteUrl, allowedHosts = DEFAULT_ALLOWED_HOSTS) {
  const base = new URL(siteUrl);
  const allowed = [base.hostname.toLowerCase(), ...allowedHosts.map((host) => host.toLowerCase())];
  const hosts = new Set();

  const inspectUrl = (raw) => {
    const value = decodeHtml(String(raw ?? '').trim()).replace(/^(["'])(.*)\1$/, '$2');
    if (!value || value.startsWith('#')) return;
    try {
      const url = new URL(value, base);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      const host = url.hostname.toLowerCase();
      if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) hosts.add(host);
    } catch {
      // An invalid/non-URL attribute does not represent a network resource.
    }
  };

  const inspectSrcset = (srcset) => {
    // Data URLs can contain commas; they are ignored by inspectUrl, and any
    // fragments split off by the candidate delimiter are harmless local names.
    for (const candidate of String(srcset ?? '').split(',')) {
      const url = candidate.trim().split(/\s+/, 1)[0];
      if (url) inspectUrl(url);
    }
  };

  const inspectCss = (css) => {
    const urls = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
    for (const match of css.matchAll(urls)) inspectUrl(match[1] ?? match[2] ?? match[3]);
    const imports = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?/gi;
    for (const match of css.matchAll(imports)) inspectUrl(match[1] ?? match[2]);
  };

  const inspectTag = (tagName, rawAttributes) => {
    const tag = tagName.toLowerCase();
    const attributes = attributesFrom(rawAttributes);
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);

    if (tag === 'script') inspectUrl(attributes.get('src'));
    if (tag === 'link' && rel.some((value) => RESOURCE_LINK_RELS.has(value))) {
      inspectUrl(attributes.get('href'));
      inspectSrcset(attributes.get('imagesrcset'));
    }
    if (['img', 'iframe', 'source', 'video', 'audio'].includes(tag)) {
      inspectUrl(attributes.get('src'));
      inspectSrcset(attributes.get('srcset'));
    }
    if (tag === 'video') inspectUrl(attributes.get('poster'));
    if (attributes.has('style')) inspectCss(attributes.get('style'));
  };

  let markup = String(html ?? '').replace(/<!--[\s\S]*?-->/g, '');
  markup = markup.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_whole, attributes, css) => {
    inspectTag('style', attributes);
    inspectCss(css);
    return '';
  });
  markup = markup.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_whole, attributes) => {
    inspectTag('script', attributes);
    return '';
  });

  const tags = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const match of markup.matchAll(tags)) inspectTag(match[1], match[2]);
  return [...hosts].sort();
}
