import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptFile, decryptFile, recipientId } from '../scripts/backup-envelope.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

test('encrypted backup round-trips exact bytes without embedding plaintext', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mp-crypto-'));
  try {
    const source = join(directory, 'original'), sealed = join(directory, 'sealed'), restored = join(directory, 'restored');
    const bytes = Buffer.concat([Buffer.from('INTERNAL HISTORY — NOT PUBLIC\n'), randomBytes(200000)]);
    await writeFile(source, bytes);
    await encryptFile(source, sealed, pair.publicKey);
    assert.ok(!(await readFile(sealed)).includes(Buffer.from('INTERNAL HISTORY')));
    assert.equal((await stat(sealed)).mode & 0o777, 0o600);
    assert.equal(recipientId(pair.publicKey), recipientId(pair.privateKey));
    await decryptFile(sealed, restored, pair.privateKey);
    assert.deepEqual(await readFile(restored), bytes);
    await assert.rejects(encryptFile(source, sealed, pair.publicKey), /already exists/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('tampered backups fail authentication and do not leave usable plaintext output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mp-tamper-'));
  try {
    const source = join(directory, 'original'), sealed = join(directory, 'sealed');
    await writeFile(source, randomBytes(1024));
    await encryptFile(source, sealed, pair.publicKey);
    const original = await readFile(sealed);
    for (const offset of [0, 12, original.length - 20, original.length - 1]) {
      const broken = Buffer.from(original); broken[offset] ^= 1;
      const input = join(directory, `bad-${offset}`), output = join(directory, `out-${offset}`);
      await writeFile(input, broken);
      await assert.rejects(decryptFile(input, output, pair.privateKey));
      await assert.rejects(stat(output), { code: 'ENOENT' });
      await assert.rejects(stat(output + '.partial'), { code: 'ENOENT' });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('wrong private recipient cannot decrypt a backup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mp-wrong-key-'));
  try {
    const other = generateKeyPairSync('rsa', { modulusLength: 3072, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).privateKey;
    await writeFile(join(directory, 'source'), 'private content');
    await encryptFile(join(directory, 'source'), join(directory, 'sealed'), pair.publicKey);
    await assert.rejects(decryptFile(join(directory, 'sealed'), join(directory, 'output'), other), /Wrong recipient/);
    await assert.rejects(stat(join(directory, 'output')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
