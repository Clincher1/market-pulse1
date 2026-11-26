import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { updateSnapshot } from './update-static-snapshot.mjs';
import { isCatchUpRun, runSnapshotWithHeartbeat } from './snapshot-heartbeat.mjs';

const snapshotFile = new URL('../data/snapshot.json', import.meta.url);
let lastSuccessfulHeartbeatAt = null;
try {
  const previous = JSON.parse(await readFile(snapshotFile, 'utf8'));
  if (typeof previous.lastSuccessfulHeartbeatAt === 'string') {
    lastSuccessfulHeartbeatAt = previous.lastSuccessfulHeartbeatAt;
  }
} catch {
  // No trustworthy success timestamp means this run catches up and normal snapshot
  // validation below remains responsible for reporting a missing/broken snapshot.
}

// Read the persisted success time before updateSnapshot atomically replaces the file.
const catchUp = isCatchUpRun(lastSuccessfulHeartbeatAt, new Date());
const result = await runSnapshotWithHeartbeat({ refresh: () => updateSnapshot(), catchUp });

if (result.snapshot) {
  const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
  if (result.report.outcome === 'ok' && result.notification?.ok) {
    snapshot.lastSuccessfulHeartbeatAt = new Date().toISOString();
  } else if (lastSuccessfulHeartbeatAt) {
    snapshot.lastSuccessfulHeartbeatAt = lastSuccessfulHeartbeatAt;
  } else {
    delete snapshot.lastSuccessfulHeartbeatAt;
  }

  const temporaryFile = new URL(`.snapshot-heartbeat-${randomUUID()}.tmp`, snapshotFile);
  try {
    await writeFile(temporaryFile, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporaryFile, snapshotFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

if (result.snapshot) {
  console.log(`Snapshot refreshed: ${result.snapshot.items.length} validated observations; exportedAt=${result.snapshot.exportedAt}`);
} else {
  // The original updater intentionally omits unsafe provider details from its output.
  console.error(`Snapshot refresh stopped: ${result.error?.message ?? 'unknown error'}`);
  process.exitCode = 1;
}
