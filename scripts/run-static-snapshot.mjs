import { updateSnapshot } from './update-static-snapshot.mjs';
import { runSnapshotWithHeartbeat } from './snapshot-heartbeat.mjs';

const result = await runSnapshotWithHeartbeat({ refresh: () => updateSnapshot() });
if (result.snapshot) {
  console.log(`Snapshot refreshed: ${result.snapshot.items.length} validated observations; exportedAt=${result.snapshot.exportedAt}`);
} else {
  // The original updater intentionally omits unsafe provider details from its output.
  console.error(`Snapshot refresh stopped: ${result.error?.message ?? 'unknown error'}`);
  process.exitCode = 1;
}

