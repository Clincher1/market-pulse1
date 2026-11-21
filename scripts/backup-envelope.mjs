// Authenticated, streaming encryption. Only the public recipient belongs in Git/CI.
import { createCipheriv, createDecipheriv, createHash, createPublicKey, publicEncrypt, privateDecrypt, randomBytes, constants } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, link, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('MPBAK001');
const TAG_BYTES = 16;
export function recipientId(key) {
  return createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex');
}
async function differentFiles(source, destination) {
  if (source === destination) throw new Error('Input and output must differ');
  try {
    const [a, b] = await Promise.all([stat(source), stat(destination)]);
    if (a.dev === b.dev && a.ino === b.ino) throw new Error('Input and output must differ');
    throw new Error('Output already exists');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export async function encryptFile(source, destination, publicPem) {
  await differentFiles(source, destination);
  const key = randomBytes(32), iv = randomBytes(12);
  const publicKey = createPublicKey(publicPem);
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('RSA recipient must be at least 3072 bits');
  const wrappedKey = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  const metadata = Buffer.from(JSON.stringify({ algorithm: 'AES-256-GCM+RSA-OAEP-SHA256', recipient: recipientId(publicPem), iv: iv.toString('base64'), wrappedKey: wrappedKey.toString('base64') }));
  const length = Buffer.alloc(4); length.writeUInt32BE(metadata.length);
  const header = Buffer.concat([MAGIC, length, metadata]);
  const partial = `${destination}.partial`;
  let handle;
  try {
    handle = await open(partial, 'wx', 0o600);
    await handle.writeFile(header);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);
    await pipeline(createReadStream(source), cipher, createWriteStream(partial, { fd: handle.fd, autoClose: false, start: header.length }));
    await handle.write(cipher.getAuthTag(), 0, TAG_BYTES, (await handle.stat()).size);
    await handle.sync(); await handle.close(); handle = null;
    await link(partial, destination); await rm(partial);
  } catch (e) { await handle?.close().catch(() => {}); await rm(partial, { force: true }); throw e; }
  finally { key.fill(0); }
}
export async function decryptFile(source, destination, privatePem) {
  await differentFiles(source, destination);
  const input = await open(source, 'r');
  const partial = `${destination}.partial`;
  let output, key;
  try {
    const size = (await input.stat()).size;
    const prefix = Buffer.alloc(12);
    if ((await input.read(prefix, 0, 12, 0)).bytesRead !== 12 || !prefix.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid backup header');
    const length = prefix.readUInt32BE(8);
    if (length > 16384 || length < 1 || size <= 12 + length + TAG_BYTES) throw new Error('Invalid backup length');
    const metadata = Buffer.alloc(length); await input.read(metadata, 0, length, 12);
    const header = Buffer.concat([prefix, metadata]), info = JSON.parse(metadata);
    if (info.algorithm !== 'AES-256-GCM+RSA-OAEP-SHA256' || info.recipient !== recipientId(privatePem)) throw new Error('Wrong recipient or algorithm');
    key = privateDecrypt({ key: privatePem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(info.wrappedKey, 'base64'));
    const iv = Buffer.from(info.iv, 'base64');
    if (key.length !== 32 || iv.length !== 12) throw new Error('Invalid encryption parameters');
    const tag = Buffer.alloc(TAG_BYTES); await input.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(header); decipher.setAuthTag(tag);
    output = await open(partial, 'wx', 0o600);
    await pipeline(createReadStream(source, { start: header.length, end: size - TAG_BYTES - 1 }), decipher,
      createWriteStream(partial, { fd: output.fd, autoClose: false }));
    await output.sync(); await output.close(); output = null;
    await link(partial, destination); await rm(partial);
  } catch (e) { await output?.close().catch(() => {}); await rm(partial, { force: true }); throw e; }
  finally { key?.fill(0); await input.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, source, destination, keyPath] = process.argv.slice(2);
  try {
    if (!['encrypt', 'decrypt'].includes(operation) || !source || !destination || !keyPath) throw new Error('Usage: backup-envelope.mjs encrypt|decrypt input output key.pem');
    const key = await readFile(keyPath);
    await (operation === 'encrypt' ? encryptFile : decryptFile)(source, destination, key);
    console.log(`${operation}: complete`);
  } catch { console.error('Backup encryption/decryption failed; no completed output was produced.'); process.exitCode = 1; }
}
