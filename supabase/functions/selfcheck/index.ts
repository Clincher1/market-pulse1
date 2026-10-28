// Self-check for the whole public contour.
//
// Two ways in:
//   • pg_cron job 20 calls it every hour at :25 with the shared cron secret;
//   • anyone can call it with the project's public key (that is what the
//     «Проверить сейчас» button on the status page does). Public calls are
//     throttled to one per MANUAL_COOLDOWN_MIN minutes and are recorded with
//     trigger = 'manual', so the hourly record stays clean.
//
// The result is written to `site_health` either way. Nothing here sends
// notifications: it only leaves evidence, plus — if Linear is connected —
// an issue that opens when a check fails and closes itself when it recovers.
//
// The site must be able to prove that it works without a person standing next
// to it. This is that proof.

const SUPABASE_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const SITE = 'https://market-pulse1-eta.vercel.app';
const MANUAL_COOLDOWN_MIN = 5;

const MIN_IMPORTANCE = 3;
const MIN_CONFIDENCE = 0.5;
const BLOCKED_SOURCES = new Set(['GDELT (Global)', 'GDELT']);
const FRESH_NEWS_HOURS = 6;
const FRESH_ASSETS_MINUTES = 45;
const FRESH_FORECAST_HOURS = 3;
const FRESH_FEED_HOURS = 24;
const MIN_SAMPLE = 20;
const TENSION_TOLERANCE = 2;
const MAX_ONE_SIDED_SHARE = 0.85;

type AnyRecord = Record<string, unknown>;
type Check = { ok: boolean; detail: string };

function serviceKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY');
  if (!key) throw new Error('Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret');
  return key;
}

async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Cron and the dashboard button are different callers: the scheduled job and
// the service role may run at any time, everyone else is throttled.
function isPrivileged(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY') ?? '';
  if (serviceRole && auth === `Bearer ${serviceRole}`) return true;
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !provided || provided.length !== cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < cronSecret.length; i++) diff |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  return diff === 0;
}

const hoursAgo = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? (Date.now() - ts) / 3_600_000 : null;
};

async function check(name: string, run: () => Promise<Check>): Promise<[string, Check]> {
  try {
    return [name, await run()];
  } catch (error) {
    return [name, { ok: false, detail: `ошибка проверки: ${error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160)}` }];
  }
}

// ---------------------------------------------------------------------------
// Linear bridge. Inactive until LINEAR_API_KEY and LINEAR_TEAM_ID exist, and
// never allowed to break the check itself: every failure is swallowed into the
// report text.
// ---------------------------------------------------------------------------

async function linearGraphql(query: string, variables: AnyRecord): Promise<AnyRecord | null> {
  const key = Deno.env.get('LINEAR_API_KEY') ?? '';
  if (!key) return null;
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null) as AnyRecord | null;
  if (!payload || (Array.isArray(payload.errors) && payload.errors.length)) return null;
  return (payload.data as AnyRecord) ?? null;
}

async function syncLinear(results: Record<string, Check>, checkedAt: string): Promise<string> {
  const teamId = Deno.env.get('LINEAR_TEAM_ID') ?? '';
  if (!Deno.env.get('LINEAR_API_KEY') || !teamId) return 'Linear не подключён';
  try {
    const statesReply = await linearGraphql(
      `query($t:String!){ team(id:$t){ states{ nodes{ id name type } } } }`,
      { t: teamId },
    );
    const stateNodes = ((((statesReply?.team as AnyRecord)?.states) as AnyRecord)?.nodes as AnyRecord[]) ?? [];
    const doneState = stateNodes.find((s) => s.type === 'completed');

    const openReply = await linearGraphql(
      `query($t:String!){ team(id:$t){ issues(filter:{ state:{ type:{ nin:["completed","canceled"] } } }){ nodes{ id title } } } }`,
      { t: teamId },
    );
    const issueNodes = ((((openReply?.team as AnyRecord)?.issues) as AnyRecord)?.nodes as AnyRecord[]) ?? [];
    const openById = new Map<string, string>(issueNodes.map((n) => [String(n.title), String(n.id)]));

    const created: string[] = [];
    const closed: string[] = [];

    for (const [name, value] of Object.entries(results)) {
      const title = `Самопроверка сайта: ${name}`;
      const openId = openById.get(title);

      if (!value.ok) {
        if (openId) continue; // already tracked, one issue per failing check
        const reply = await linearGraphql(
          `mutation($team:String!,$title:String!,$description:String!){ issueCreate(input:{ teamId:$team, title:$title, description:$description, priority:2 }){ success } }`,
          {
            team: teamId,
            title,
            description: [
              `Проверка \`${name}\` провалилась ${checkedAt} (UTC).`,
              '',
              value.detail,
              '',
              `Отчёт целиком: ${SITE}/#status`,
              'Задача заведена автоматически; закроется сама, когда проверка снова станет зелёной.',
            ].join('\n'),
          },
        );
        if ((reply?.issueCreate as AnyRecord)?.success) created.push(name);
        continue;
      }

      if (openId && doneState) {
        await linearGraphql(
          `mutation($issue:String!,$body:String!){ commentCreate(input:{ issueId:$issue, body:$body }){ success } }`,
          { issue: openId, body: `Вновь в норме ${checkedAt} (UTC): ${value.detail}` },
        );
        await linearGraphql(
          `mutation($id:String!,$state:String!){ issueUpdate(id:$id, input:{ stateId:$state }){ success } }`,
          { id: openId, state: String(doneState.id) },
        );
        closed.push(name);
      }
    }

    return `Linear: заведено ${created.length}, закрыто ${closed.length}`;
  } catch (error) {
    return `Linear недоступен: ${(error instanceof Error ? error.message : String(error)).slice(0, 120)}`;
  }
}

Deno.serve(async (req: Request) => {
  const privileged = isPrivileged(req);

  let latest: AnyRecord[] = [];
  try {
    latest = (await restJson(
      'site_health?select=checked_at,ok,checks,trigger&order=checked_at.desc&limit=1',
    )) as AnyRecord[];
  } catch {
    latest = [];
  }
  const lastAge = hoursAgo(String(latest[0]?.checked_at ?? ''));

  // A public caller gets the stored report back instead of a fresh run when the
  // previous check is recent: the button cannot be used to hammer the database.
  if (!privileged && lastAge !== null && lastAge * 60 < MANUAL_COOLDOWN_MIN) {
    return Response.json({
      success: true,
      ok: Boolean(latest[0]?.ok),
      skipped: true,
      detail: `проверка уже запускалась ${(lastAge * 60).toFixed(1)} мин назад (${String(latest[0]?.trigger ?? 'cron')}); повторно можно через ${MANUAL_COOLDOWN_MIN} мин`,
      checked_at: latest[0]?.checked_at ?? null,
      checks: latest[0]?.checks ?? {},
    });
  }

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const results: Record<string, Check> = {};

  for (const [name, value] of await Promise.all([
    // 1. The index, recomputed here from raw rows, must match what is published.
    check('tension_matches', async () => {
      const news = (await restJson(
        `cached_news?select=sentiment,importance,confidence,source,published_at` +
          `&published_at=gte.${encodeURIComponent(since)}&limit=500`,
      )) as AnyRecord[];
      const rows = news.filter(
        (r) =>
          Number(r.importance) >= MIN_IMPORTANCE &&
          Number(r.confidence) >= MIN_CONFIDENCE &&
          !BLOCKED_SOURCES.has(String(r.source ?? '')),
      );
      let negative = 0;
      let total = 0;
      for (const row of rows) {
        const weight = Number(row.importance) * Number(row.confidence);
        total += weight;
        negative += Math.max(0, -Number(row.sentiment)) * weight;
      }
      const computed = total > 0 ? Math.round((negative / total) * 100) : 0;
      const published = (await restJson('cached_tension?select=value,news_count&id=eq.1')) as AnyRecord[];
      const value = Number(published[0]?.value ?? 0);
      const diff = Math.abs(value - computed);
      return {
        ok: diff <= TENSION_TOLERANCE,
        detail: `опубликовано ${value}, пересчитано ${computed}, расхождение ${diff}, выборка ${rows.length}`,
      };
    }),

    // 2. News must keep arriving.
    check('news_fresh', async () => {
      const rows = (await restJson(
        'cached_news?select=published_at&order=published_at.desc&limit=1',
      )) as AnyRecord[];
      const age = hoursAgo(String(rows[0]?.published_at ?? ''));
      return {
        ok: age !== null && age <= FRESH_NEWS_HOURS,
        detail: age === null ? 'нет данных' : `свежему материалу ${age.toFixed(1)} ч`,
      };
    }),

    // 3. The sample must be big enough for the index to mean anything.
    check('sample_size', async () => {
      const rows = (await restJson(
        `cached_news?select=importance,confidence,source&published_at=gte.${encodeURIComponent(since)}&limit=500`,
      )) as AnyRecord[];
      const n = rows.filter(
        (r) =>
          Number(r.importance) >= MIN_IMPORTANCE &&
          Number(r.confidence) >= MIN_CONFIDENCE &&
          !BLOCKED_SOURCES.has(String(r.source ?? '')),
      ).length;
      return { ok: n >= MIN_SAMPLE, detail: `подходящих материалов ${n}` };
    }),

    // 4. Prices must stay current.
    check('assets_fresh', async () => {
      const rows = (await restJson('cached_assets?select=updated_at&order=updated_at.desc&limit=1')) as AnyRecord[];
      const age = hoursAgo(String(rows[0]?.updated_at ?? ''));
      return {
        ok: age !== null && age * 60 <= FRESH_ASSETS_MINUTES,
        detail: age === null ? 'нет данных' : `котировкам ${(age * 60).toFixed(0)} мин`,
      };
    }),

    // 5. Forecasts must be recalculated on schedule.
    check('forecasts_fresh', async () => {
      const rows = (await restJson('cached_forecasts?select=updated_at&order=updated_at.desc&limit=1')) as AnyRecord[];
      const age = hoursAgo(String(rows[0]?.updated_at ?? ''));
      return {
        ok: age !== null && age <= FRESH_FORECAST_HOURS,
        detail: age === null ? 'нет данных' : `прогнозам ${age.toFixed(1)} ч`,
      };
    }),

    // 6. The daily memory snapshot must be taken.
    check('snapshot_taken', async () => {
      const rows = (await restJson('daily_snapshots?select=date&order=date.desc&limit=1')) as AnyRecord[];
      const date = String(rows[0]?.date ?? '');
      const todayIso = new Date().toISOString().slice(0, 10);
      const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      return { ok: date === todayIso || date === yesterdayIso, detail: `последний снимок за ${date || '—'}` };
    }),

    // 7. Every feed must have produced something recently. This is the check
    //    that would have caught the frozen WSJ feed in a day instead of two years.
    check('feeds_fresh', async () => {
      const rows = (await restJson('news_source_health?select=source,last_new_at,last_seen_at')) as AnyRecord[];
      if (!rows.length) return { ok: false, detail: 'здоровье источников ещё не пишется' };
      const stale = rows.filter((r) => {
        const age = hoursAgo(String(r.last_new_at ?? ''));
        return age === null || age > FRESH_FEED_HOURS;
      });
      const names = stale.map((r) => `${String(r.source)} (${hoursAgo(String(r.last_new_at ?? ''))?.toFixed(0) ?? 'нет даты'} ч)`);
      return {
        ok: stale.length === 0,
        detail: stale.length ? `молчат: ${names.join(', ')}` : `все ${rows.length} лент давали материалы за сутки`,
      };
    }),

    // 8. A forecast that always points the same way is not a forecast. This is
    //    the blind spot that let nine of the first eleven calls say "up" on a
    //    falling market without anything noticing.
    check('forecast_bias', async () => {
      const rows = (await restJson(
        'market_forecasts_v2?select=direction,issue_date&order=issue_date.desc&limit=40',
      )) as AnyRecord[];
      const directional = rows.filter((r) => r.direction === 'up' || r.direction === 'down');
      if (directional.length < 10) {
        return { ok: true, detail: `направленных прогнозов ${directional.length} — мало для вывода о перекосе` };
      }
      const up = directional.filter((r) => r.direction === 'up').length;
      const share = up / directional.length;
      return {
        ok: share <= MAX_ONE_SIDED_SHARE && share >= 1 - MAX_ONE_SIDED_SHARE,
        detail: `из ${directional.length} направленных ${Math.round(share * 100)} % «вверх»`,
      };
    }),

    // 9. Forecasts must actually reach a verdict, otherwise the track record
    //    stays empty forever and the site can claim anything it likes.
    check('forecasts_resolving', async () => {
      const rows = (await restJson(
        'forecast_outcomes_v2?select=evaluated_at&status=eq.evaluated&order=evaluated_at.desc&limit=1',
      )) as AnyRecord[];
      const age = hoursAgo(String(rows[0]?.evaluated_at ?? ''));
      return {
        ok: age !== null && age <= 36,
        detail: age === null ? 'ни один прогноз ещё не проверен' : `последняя проверка ${age.toFixed(1)} ч назад`,
      };
    }),

    // 10. The site promises no trackers and no third-party resources. Once this
    //     check exists, a font CDN, an analytics snippet or any other outside
    //     host reappearing in the markup shows up here within the hour.
    check('no_third_party', async () => {
      const html = await (await fetch(SITE, { signal: AbortSignal.timeout(20000) })).text();
      const hosts = [...new Set(
        [...html.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)].map((m) => String(m[1]).toLowerCase()),
      )];
      // w3.org is an XML namespace in inline markup, not a request.
      const allowed = ['vercel.app', 'supabase.co', 'w3.org'];
      const foreign = hosts.filter((h) => !allowed.some((a) => h === a || h.endsWith(`.${a}`)));
      return {
        ok: foreign.length === 0,
        detail: foreign.length
          ? `в разметке чужие домены: ${foreign.join(', ')}`
          : `в разметке только свои домены (${hosts.join(', ')})`,
      };
    }),

    // 11. The site itself must answer.
    check('site_online', async () => {
      const started = Date.now();
      const res = await fetch(SITE, { signal: AbortSignal.timeout(20000) });
      return { ok: res.ok, detail: `HTTP ${res.status} за ${Date.now() - started} мс` };
    }),
  ])) {
    results[name] = value;
  }

  const ok = Object.values(results).every((r) => r.ok);
  const checkedAt = new Date().toISOString();
  const row = { checked_at: checkedAt, ok, checks: results, trigger: privileged ? 'cron' : 'manual' };

  try {
    await restJson('site_health', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    return Response.json({
      success: false,
      ok,
      error: `не удалось записать site_health: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
      checks: results,
    }, { status: 500 });
  }

  const linear = await syncLinear(results, checkedAt);
  return Response.json({ success: true, ok, checked_at: checkedAt, trigger: row.trigger, linear, checks: results });
});
