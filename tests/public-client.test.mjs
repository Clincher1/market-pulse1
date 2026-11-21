import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function client(env = {}) {
  const result = await build({ entryPoints: ['src/lib/supabase.ts'], bundle: true,
    platform: 'node', format: 'esm', write: false, metafile: true,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://project.test', VITE_SUPABASE_ANON_KEY: 'public-test-key', ...env }) },
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
  assert.ok(!Object.keys(result.metafile.inputs).some(p => /node_modules\/@supabase\/(auth-js|realtime-js|storage-js|supabase-js)\//.test(p)), 'public reads must not ship unused session/realtime/storage SDKs');
  return mod;
}

test('slim official client preserves public read URL, headers and maybeSingle behavior', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(url), init });
    return new Response(JSON.stringify([{ id: 'btc', price: '$100' }]), { status: 200 });
  };
  try {
    const { supabase, supabaseEndpoint } = await client();
    assert.equal(supabaseEndpoint, 'https://project.test');
    const { data, error } = await supabase.from('cached_assets').select('id,price').eq('id', 'btc').order('id').limit(1).maybeSingle();
    assert.equal(error, null);
    assert.deepEqual(data, { id: 'btc', price: '$100' });
    const { url, init } = requests[0];
    assert.equal(url.pathname, '/rest/v1/cached_assets');
    assert.equal(url.searchParams.get('select'), 'id,price');
    assert.equal(url.searchParams.get('id'), 'eq.btc');
    assert.equal(url.searchParams.get('limit'), '1');
    assert.equal(init.method, 'GET');
    assert.equal(new Headers(init.headers).get('apikey'), 'public-test-key');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer public-test-key');
  } finally { globalThis.fetch = originalFetch; }
});

test('same-origin proxy and official function invocation retain request contract', async () => {
  const oldWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { location: { origin: 'https://preview.test' } };
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { supabase, supabaseEndpoint } = await client({ VITE_SUPABASE_PROXY: '/sb' });
    assert.equal(supabaseEndpoint, 'https://preview.test/sb');
    const { data, error } = await supabase.functions.invoke('selfcheck', { body: {} });
    assert.equal(error, null);
    assert.deepEqual(data, { ok: true });
    assert.equal(requests[0].url, 'https://preview.test/sb/functions/v1/selfcheck');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.body, '{}');
    assert.equal(new Headers(requests[0].init.headers).get('apikey'), 'public-test-key');
    await supabase.from('cached_assets').select('id');
    assert.match(requests[1].url, /^https:\/\/preview\.test\/sb\/rest\/v1\/cached_assets\?/);
  } finally { globalThis.fetch = originalFetch; if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
});
