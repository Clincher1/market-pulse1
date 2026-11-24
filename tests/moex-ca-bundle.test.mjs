import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rootPem = await readFile(new URL('../certs/russian_trusted_root_ca_pem.crt', import.meta.url), 'utf8');
const subPem = await readFile(new URL('../certs/russian_trusted_sub_ca_pem.crt', import.meta.url), 'utf8');
const bundle = await readFile(new URL('../certs/moex-ca-bundle.pem', import.meta.url), 'utf8');
const root = new X509Certificate(rootPem);
const sub = new X509Certificate(subPem);

test('Russian Trusted Root CA matches the official SHA-1 fingerprint', () => {
  assert.equal(root.fingerprint, '8F:F9:15:CC:AB:7B:C1:6F:8C:5C:80:99:D5:3E:0E:11:5B:3A:EC:2F');
  assert.match(root.subject, /CN=Russian Trusted Root CA/);
});

test('MOEX CA bundle contains the official root and issuing sub CA in chain order', () => {
  assert.equal(bundle, `${rootPem}${subPem}`);
  assert.equal(sub.issuer, root.subject);
  assert.match(sub.subject, /CN=Russian Trusted Sub CA/);
});

test('Vercel bundles the CA file into the Russia insights function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/russia-insights.js'].includeFiles, 'certs/moex-ca-bundle.pem');
});
