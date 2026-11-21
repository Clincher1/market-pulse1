// One diagnostic run, not an acceptance retry or evidence of stability.
import fs from 'node:fs/promises';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
import lighthouse from '../.local/production-browser/node_modules/lighthouse/core/index.js';
import { launch } from '../.local/production-browser/node_modules/chrome-launcher/dist/index.js';
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const { lhr } = await lighthouse('https://market-pulse1-eta.vercel.app/world', {
    port: chrome.port, logLevel: 'error', output: 'json', onlyCategories: ['performance'],
  });
  const ids = ['mainthread-work-breakdown', 'bootup-time', 'long-tasks', 'forced-reflow-insight', 'dom-size-insight', 'unused-javascript', 'total-blocking-time', 'largest-contentful-paint', 'cumulative-layout-shift'];
  const report = { purpose: 'Diagnosis only; previous failed acceptance results remain failures.', observedAt: new Date().toISOString(), runtimeError: lhr.runtimeError, audits: Object.fromEntries(ids.filter(id => lhr.audits[id]).map(id => [id, lhr.audits[id]])) };
  await fs.mkdir('docs/audit-evidence/performance-profile', { recursive: true });
  await fs.writeFile('docs/audit-evidence/performance-profile/world.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await chrome.kill(); }
