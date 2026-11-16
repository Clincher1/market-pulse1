import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../supabase/migrations/20261116113000_public_status_column_grants.sql',
  import.meta.url,
);

function columnsFromQueries(source, relation) {
  const query = /\.from\('([^']+)'\)([\s\S]*?)\.select\('([^']+)'\)/g;
  const columns = new Set();
  for (const match of source.matchAll(query)) {
    if (match[1] !== relation) continue;
    for (const column of match[3].split(',').map((value) => value.trim())) columns.add(column);
  }
  return columns;
}

function columnsFromGrant(migration, relation) {
  const grants = /grant\s+select\s*\(([\s\S]*?)\)\s*on\s+table\s+public\.([a-z0-9_]+)\s+to\s+anon,\s*authenticated/gi;
  const grant = [...migration.matchAll(grants)].find((match) => match[2] === relation);
  assert.ok(grant, `${relation}: no column-level SELECT grant for browser roles`);
  return new Set(grant[1].split(',').map((value) => value.trim().replaceAll('"', '')));
}

test('public status/source grants match only the columns selected by the frontend', async () => {
  const [migration, systemStatus, sourceMonitor] = await Promise.all([
    readFile(migrationPath, 'utf8'),
    readFile(new URL('../src/data/systemStatus.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/data/sourceMonitor.ts', import.meta.url), 'utf8'),
  ]);

  const revoke = /revoke\s+select\s+on\s+table([\s\S]*?)from\s+public,\s*anon,\s*authenticated/i.exec(migration);
  assert.ok(revoke, 'relation-wide SELECT is not revoked from browser roles');
  const revokedRelations = new Set(revoke[1].match(/public\.[a-z0-9_]+/gi) ?? []);
  const broadGrants = new Set(
    [...migration.matchAll(/grant\s+select\s+on\s+table\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]),
  );
  const relations = [
    { name: 'site_health', source: systemStatus },
    { name: 'site_health_check_stats_7d', source: systemStatus },
    { name: 'slot_sources_view', source: sourceMonitor },
  ];

  let totalColumns = 0;
  for (const { name, source } of relations) {
    assert.ok(revokedRelations.has(`public.${name}`), `${name}: table-level SELECT remains public`);
    assert.equal(broadGrants.has(name), false, `${name}: broad table-level SELECT grant was reintroduced`);
    const selected = columnsFromQueries(source, name);
    const granted = columnsFromGrant(migration, name);
    assert.deepEqual([...granted].sort(), [...selected].sort(), `${name}: grants differ from frontend selectors`);
    totalColumns += granted.size;
  }
  assert.equal(totalColumns, 19);
});
