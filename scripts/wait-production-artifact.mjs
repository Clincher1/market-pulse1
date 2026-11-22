// Synchronize a read-only audit with an explicitly requested deployment.
// This waits only for the exact built artifact; it never retries audit metrics.
import { readFile } from 'node:fs/promises';
const expected = (await readFile('dist/index.html', 'utf8')).match(/src="([^"]+\/index-[^"]+\.js)"/)?.[1];
if (!expected) throw new Error('No built frontend entry found');
const origin = 'https://market-pulse1-eta.vercel.app';
const deadline = Date.now() + 300000;
while (true) {
  try {
    const response = await fetch(origin + '/?artifact-readiness=' + Date.now(), { signal: AbortSignal.timeout(15000) });
    if (response.ok && (await response.text()).includes(expected)) {
      console.log(`Published artifact ready: ${expected}`);
      break;
    }
  } catch (error) { console.log(`Waiting for deployment: ${error.message}`); }
  if (Date.now() >= deadline) throw new Error(`Expected production artifact not published within 5 minutes: ${expected}`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}
