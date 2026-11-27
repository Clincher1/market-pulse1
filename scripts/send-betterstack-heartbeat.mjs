import { sendBetterStackHeartbeat } from './betterstack-heartbeat.mjs';

const result = await sendBetterStackHeartbeat();
if (!result.ok) process.exitCode = 1;
