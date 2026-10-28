// Hourly self-check for the whole public contour.
//
// The site claims to be a live analytics system, so it has to be able to prove
// it to itself: this job recomputes the tension index from the raw rows,
// measures how fresh every feed and every cached table is, asks the site
// whether it answers at all, and stores the verdict in `site_health`.
//
// Nothing here sends notifications — it only leaves evidence. Whoever opens
// the project (a person or an assistant) reads one table and sees whether the
// machine is healthy, instead of taking the site's word for it.
//
// pg_cron job 20 (selfcheck-hourly) calls this function.

const SUPABASE_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const SITE = 'https://market-pulse1-eta.vercel.app';

const MIN_IMPORTANCE = 3;
const MIN_CONFIDENCE = 0.5;
const BLOCKED_SOURCES = new Set(['GDELT (Global)', 'GDELT']);
const FRESH_NEWS_HOURS = 6;
const FRESH_ASSETS_MINUTES = 45;
const FRESH_FORECAST_HOURS = 3;
const FRESH_FEED_HOURS = 24;
const MIN_SAMPLE = 20;
const TENSION_TOLERANCE = 2;

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

function isAuthorizedCron(req: Request): boolean {
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

Deno.serve(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
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
        ok: share <= 0.85 && share >= 0.15,
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
  const row = { checked_at: new Date().toISOString(), ok, checks: results };

  await restJson('site_health', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });

  return Response.json({ success: true, ok, checks: results });
});
