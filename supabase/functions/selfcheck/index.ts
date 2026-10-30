// Self-check for the whole public contour.
import { serveWithErrorReporting } from "../_shared/observability.ts";
//
// Two ways in:
//   • pg_cron job 20 calls it every hour at :25 with the shared cron secret;
//   • anyone can call it with the project's public key (that is what the
//     «Проверить сейчас» button on the status page does). Public calls are
//     throttled to one per MANUAL_COOLDOWN_MIN minutes and are recorded with
//     trigger = 'manual', so the hourly record stays clean.
//
// Three things happen with the result:
//   1. it is written to `site_health` — the evidence;
//   2. a red check opens a Linear issue, and it closes itself when the check
//      turns green again;
//   3. where a machine cannot decide, Linear gets a *decision* issue that no
//      automation will close — only a person.
//
// One red check also gets a single retry of the job that should have kept it
// green. Exactly one per run: this is a nudge, not a loop.
//
// The Linear bridge was proven end to end on 2026-10-28: a deliberately broken
// news_fresh threshold made the check fail, the bridge opened issue CLI-5 in
// team «Clincher», and restoring the threshold closed it again with a comment.
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
// Forecasts are written once a day, not every 15 minutes: forecast_latest_v2
// takes its issued_at from pg_cron job shadow-write-forecasts-v2, scheduled at
// 05:45 UTC. The threshold therefore has to cover a day plus slack, or the
// check can never be green between 08:45 and the next morning — it would fail
// 21 hours out of 24, every day, by construction. Green now means "the daily
// run happened"; red means a daily run was missed.
const FRESH_FORECAST_HOURS = 26;
const FRESH_FEED_HOURS = 24;
// Сколько может пройти без новых точек у каждого ряда истории. Это НЕ «задержка
// сайта», а расписание источников: Мосбиржа отдаёт день после закрытия, ЦБ —
// курс на дату и RUONIA на следующий день, резервы — раз в неделю (отчётная
// пятница, публикация на следующей неделе). Если поставить всем один порог,
// проверка будет красной каждые выходные по построению.
const HISTORY_MAX_AGE_DAYS: Record<string, number> = {
  // 7 дней на дневные ряды — не «запас на всякий случай», а цена компромисса:
  // с 5 днями проверка краснела бы на длинных праздниках (Новый год, майские),
  // когда закрыты и Мосбиржа, и публикации ЦБ, и это была бы ложная тревога.
  // Ряд без новых точек дольше недели — уже поломка, а не календарь.
  imoex: 7,
  rgbi: 7,
  'usd-rub': 7,
  ruonia: 7,
  // Резервы: отчётная пятница, публикация на следующей неделе, плюс запас.
  reserves: 21,
  // Ключевой ставки здесь нет намеренно. Это ступень: точка появляется только
  // в день решения ЦБ, поэтому «возраст последней точки» у неё равен времени с
  // прошлого изменения и может быть любым. Проверять её возрастом — значит
  // краснеть каждый месяц без единой поломки; для неё проверяется наличие ряда.
};
const ASSET_HISTORY_MAX_AGE_DAYS = 7;
const MIN_SAMPLE = 20;
const TENSION_TOLERANCE = 2;
const MAX_ONE_SIDED_SHARE = 0.85;

// The calibrated writer first runs at 05:45 UTC on 2026-10-29. Until then this
// check sleeps instead of crying wolf over rows written before the change.
const CALIBRATION_SINCE = '2026-10-29';
const CALIBRATION_MARKER = 'empirical_bayes_v1';
const VERDICT_SCORED_MIN = 30;
const HEAL_TIMEOUT_MS = 25_000;

// Which job is responsible for which red check. One retry, nothing more.
//
// forecasts_fresh is deliberately absent. It watches a daily writer, so the
// only thing a nudge could do is re-run the day's forecast; and because heal()
// retries the FIRST red check in this map, a permanently red entry here used to
// swallow the single attempt that news_fresh needed. A check that cannot be
// healed should not compete for the healer.
const HEAL_BY_CHECK: Record<string, string> = {
  assets_fresh: 'update-assets',
  news_fresh: 'update-news-v2',
};

// Признаки телеметрии в разметке. Проверка 10 ловит чужие домены, эта —
// отправку данных куда бы то ни было: собственный счётчик Vercel ходит по
// своему пути на нашем же домене, и доменным фильтром его не поймать.
const TELEMETRY_MARKERS = [
  '/_vercel/insights',
  'vercel-insights',
  'va.vercel-scripts',
  'vitals.vercel',
  'googletagmanager',
  'gtag/js',
  'mc.yandex',
  'metrika',
  'hotjar',
  'clarity.ms',
  'segment.com/analytics',
];

const DIGEST_TITLE = 'Дайджест недели: Market Pulse';
const VERDICT_TITLE = 'Решение: вердикт по прогнозам готов';

type AnyRecord = Record<string, unknown>;
type Check = { ok: boolean; detail: string };

function serviceKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY');
  if (!key) throw new Error('Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret');
  return key;
}

// The browser calls this function straight from the status page button, so the
// preflight OPTIONS request has to be answered and every response has to carry
// the headers.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
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
// Self-healing: one nudge at the job that should have kept the check green.
// ---------------------------------------------------------------------------

async function invokeFunction(name: string): Promise<string> {
  try {
    const key = serviceKey();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      signal: AbortSignal.timeout(HEAL_TIMEOUT_MS),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await res.text().catch(() => '');
    return `код ${res.status}${res.ok ? '' : `: ${text.slice(0, 70)}`}`;
  } catch (error) {
    return `не удалось вызвать: ${(error instanceof Error ? error.message : String(error)).slice(0, 70)}`;
  }
}

// At most one attempt per run, on purpose: two red checks must not turn the
// hourly check into a traffic jam of retries.
// Anything that happens after the report is written must not be able to fail
// the run: a missing view or a silent Linear costs a line, not the check.
async function guard(what: string, run: () => Promise<string>): Promise<string> {
  try {
    return await run();
  } catch (error) {
    return `${what} не сработало: ${(error instanceof Error ? error.message : String(error)).slice(0, 100)}`;
  }
}

async function heal(results: Record<string, Check>): Promise<string> {
  const name = Object.keys(HEAL_BY_CHECK).find((key) => results[key] && !results[key].ok);
  if (!name) return '';
  const target = HEAL_BY_CHECK[name];
  return `повторный запуск: ${name} → ${target} (${await invokeFunction(target)})`;
}

// ---------------------------------------------------------------------------
// Linear bridge. Inactive until LINEAR_API_KEY exists, and never allowed to
// break the check itself: every failure is swallowed into the report text.
//
// The key needs read AND write, not just "create issues": the bridge also moves
// a recovered issue to Done and comments on it.
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

// The team does not have to be configured: without LINEAR_TEAM_ID or
// LINEAR_TEAM_NAME the first available team is used, and its name goes into the
// report — so it is always visible where the issues land and fixable with one
// environment variable.
async function resolveTeam(): Promise<{ id: string; name: string } | null> {
  const wantedId = Deno.env.get('LINEAR_TEAM_ID') ?? '';
  const wantedName = (Deno.env.get('LINEAR_TEAM_NAME') ?? '').trim().toLowerCase();
  const reply = await linearGraphql('query { teams { nodes { id name key } } }', {});
  const nodes = ((((reply?.teams) as AnyRecord)?.nodes) as AnyRecord[]) ?? [];
  if (!nodes.length) return null;
  const pick = (n: AnyRecord): { id: string; name: string } => ({ id: String(n.id), name: String(n.name) });
  const byId = wantedId ? nodes.find((n) => String(n.id) === wantedId) : undefined;
  if (byId) return pick(byId);
  const byName = wantedName
    ? nodes.find((n) => String(n.name).toLowerCase() === wantedName || String(n.key).toLowerCase() === wantedName)
    : undefined;
  if (byName) return pick(byName);
  return pick(nodes[0]);
}

interface LinearCtx {
  teamId: string;
  teamName: string;
  doneStateId: string | null;
  openByTitle: Map<string, string>;
}

async function linearContext(): Promise<LinearCtx | null> {
  if (!Deno.env.get('LINEAR_API_KEY')) return null;
  const team = await resolveTeam();
  if (!team) return null;

  const statesReply = await linearGraphql(
    `query($t:String!){ team(id:$t){ states{ nodes{ id name type } } } }`,
    { t: team.id },
  );
  const stateNodes = ((((statesReply?.team as AnyRecord)?.states) as AnyRecord)?.nodes as AnyRecord[]) ?? [];
  const done = stateNodes.find((s) => s.type === 'completed');

  const openReply = await linearGraphql(
    `query($t:String!){ team(id:$t){ issues(filter:{ state:{ type:{ nin:["completed","canceled"] } } }){ nodes{ id title } } } }`,
    { t: team.id },
  );
  const issueNodes = ((((openReply?.team as AnyRecord)?.issues) as AnyRecord)?.nodes as AnyRecord[]) ?? [];

  return {
    teamId: team.id,
    teamName: team.name,
    doneStateId: done ? String(done.id) : null,
    openByTitle: new Map(issueNodes.map((n) => [String(n.title), String(n.id)])),
  };
}

function linearUnavailable(): string {
  return Deno.env.get('LINEAR_API_KEY')
    ? 'Linear: ключ есть, но команда не видна — проверьте права ключа'
    : 'Linear не подключён';
}

async function createIssue(ctx: LinearCtx, title: string, description: string, priority: number): Promise<string | null> {
  const reply = await linearGraphql(
    `mutation($team:String!,$title:String!,$description:String!,$priority:Int){ issueCreate(input:{ teamId:$team, title:$title, description:$description, priority:$priority }){ success issue{ id } } }`,
    { team: ctx.teamId, title, description, priority },
  );
  const created = reply?.issueCreate as AnyRecord | undefined;
  if (!created?.success) return null;
  const id = String((created.issue as AnyRecord)?.id ?? '');
  if (id) ctx.openByTitle.set(title, id);
  return id || null;
}

async function syncLinear(ctx: LinearCtx | null, results: Record<string, Check>, checkedAt: string): Promise<string> {
  if (!ctx) return linearUnavailable();
  const created: string[] = [];
  const closed: string[] = [];

  for (const [name, value] of Object.entries(results)) {
    const title = `Самопроверка сайта: ${name}`;
    const openId = ctx.openByTitle.get(title);

    if (!value.ok) {
      if (openId) continue; // already tracked, one issue per failing check
      const id = await createIssue(ctx, title, [
        `Проверка \`${name}\` провалилась ${checkedAt} (UTC).`,
        '',
        value.detail,
        '',
        `Отчёт целиком: ${SITE}/#status`,
        'Задача заведена автоматически; закроется сама, когда проверка снова станет зелёной.',
      ].join('\n'), 2);
      if (id) created.push(name);
      continue;
    }

    if (openId && ctx.doneStateId) {
      await linearGraphql(
        `mutation($issue:String!,$body:String!){ commentCreate(input:{ issueId:$issue, body:$body }){ success } }`,
        { issue: openId, body: `Вновь в норме ${checkedAt} (UTC): ${value.detail}` },
      );
      await linearGraphql(
        `mutation($id:String!,$state:String!){ issueUpdate(id:$id, input:{ stateId:$state }){ success } }`,
        { id: openId, state: ctx.doneStateId },
      );
      closed.push(name);
    }
  }

  return `Linear: команда «${ctx.teamName}», заведено ${created.length}, закрыто ${closed.length}`;
}

// ---------------------------------------------------------------------------
// Escalations. A machine can notice; only a person can decide. These issues are
// never closed by automation — that is the whole point.
// ---------------------------------------------------------------------------

async function raiseDecision(ctx: LinearCtx | null, title: string, body: string): Promise<boolean> {
  if (!ctx) return false;
  if (ctx.openByTitle.has(title)) return false; // the question is already asked
  return Boolean(await createIssue(ctx, title, body, 3));
}

// The honest moment for the forecast block: enough scored calls to say whether
// the system beats a coin. What to do with the answer is a human decision.
async function escalateForecastVerdict(ctx: LinearCtx | null): Promise<string> {
  const rows = (await restJson(
    'forecast_track_record?select=asset_key,issued,resolved,scored,verdict,hit_rate,mean_brier,pending&asset_key=eq.ALL&limit=1',
  )) as AnyRecord[];
  const row = rows[0];
  if (!row) return '';
  const scored = Number(row.scored ?? 0);
  if (scored < VERDICT_SCORED_MIN) return '';

  const hitRate = Number(row.hit_rate ?? 0);
  const brier = Number(row.mean_brier ?? 0);
  const verdict = String(row.verdict ?? '');
  const better = brier < 0.25;

  const raised = await raiseDecision(ctx, VERDICT_TITLE, [
    `Проверенных прогнозов: **${scored}** — порог в ${VERDICT_SCORED_MIN} пройден, молчаливое обещание пора either подтвердить или снять.`,
    '',
    `- Попаданий: ${Math.round(hitRate * 100)} %`,
    `- Брайер: ${brier.toFixed(3)} против 0.250 у подбрасывания монетки (${better ? 'лучше монетки' : 'не лучше монетки'})`,
    `- Вердикт системы: \`${verdict}\``,
    '',
    '**Что решить человеку:**',
    '',
    '1. Оставить блок прогнозов как есть — если преимущество над монеткой подтвердилось.',
    '2. Честно упростить до «сигнала нет» и убрать направление — если не подтвердилось.',
    '3. Поднять порог и копить дальше — если разница в пределах шума.',
    '',
    `Отчёт и текущий счёт: ${SITE}/#status`,
    'Эту задачу автоматика не закроет: она ждёт решения.',
  ].join('\n'));

  return raised ? `задача на решение: «${VERDICT_TITLE}»` : '';
}

// ---------------------------------------------------------------------------
// Weekly digest: one standing issue, one comment a week. Notifications are for
// exceptions; this is for the person who wants to see the trend.
// ---------------------------------------------------------------------------

async function lastCommentHoursAgo(issueId: string): Promise<number | null> {
  const reply = await linearGraphql(
    `query($id:String!){ issue(id:$id){ comments(last:1){ nodes{ createdAt } } } }`,
    { id: issueId },
  );
  const nodes = ((((reply?.issue as AnyRecord)?.comments) as AnyRecord)?.nodes as AnyRecord[]) ?? [];
  return hoursAgo(String(nodes[0]?.createdAt ?? ''));
}

async function weeklyDigest(ctx: LinearCtx | null, now: Date): Promise<string> {
  // Monday, early enough to be the first run of the week.
  if (!ctx || now.getUTCDay() !== 1 || now.getUTCHours() > 3) return '';

  let id = ctx.openByTitle.get(DIGEST_TITLE) ?? null;
  if (!id) {
    id = await createIssue(ctx, DIGEST_TITLE, [
      'Сюда раз в неделю (в понедельник, UTC) сайт пишет сводку: сколько проверок прошло,',
      'сколько было красных, как движется честный счёт прогнозов, какие ленты молчат.',
      '',
      'Задача не закрывается — она накапливает историю. Если сводка не нужна,',
      'закройте задачу и удалите её: новая не заведётся, пока эта открыта.',
    ].join('\n'), 4);
  }
  if (!id) return '';

  const sinceLastComment = await lastCommentHoursAgo(id);
  if (sinceLastComment !== null && sinceLastComment < 24 * 6) return ''; // already wrote this week

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const history = (await restJson(
    `site_health?select=ok,checked_at&checked_at=gte.${encodeURIComponent(weekAgo)}`,
  )) as AnyRecord[];
  const red = history.filter((r) => !r.ok).length;

  const track = (await restJson(
    'forecast_track_record?select=scored,issued,resolved,hit_rate,mean_brier,verdict&asset_key=eq.ALL&limit=1',
  )) as AnyRecord[];
  const scored = Number(track[0]?.scored ?? 0);
  const hit = Math.round(Number(track[0]?.hit_rate ?? 0) * 100);
  const brier = Number(track[0]?.mean_brier ?? 0);

  const tension = (await restJson('cached_tension?select=value,news_count&id=eq.1')) as AnyRecord[];
  const feeds = (await restJson('news_source_health?select=source,last_new_at')) as AnyRecord[];
  const silent = feeds.filter((f) => {
    const age = hoursAgo(String(f.last_new_at ?? ''));
    return age === null || age > FRESH_FEED_HOURS;
  }).map((f) => String(f.source));

  const lines = [
    `**Неделя ${now.toISOString().slice(0, 10)} (UTC)**`,
    '',
    `- Самопроверок: ${history.length}, из них красных: ${red}`,
    `- Индекс напряжённости: ${tension[0]?.value ?? '—'} (${tension[0]?.news_count ?? 0} материалов в окне)`,
    `- Прогнозы: выдано ${track[0]?.issued ?? 0}, проверено ${scored}, попаданий ${hit} %, Брайер ${brier.toFixed(3)}`,
    `- Ленты: ${silent.length ? `молчат ${silent.join(', ')}` : `все ${feeds.length} давали материалы`}`,
    '',
    `Полный отчёт: ${SITE}/#status`,
  ];

  await linearGraphql(
    `mutation($issue:String!,$body:String!){ commentCreate(input:{ issueId:$issue, body:$body }){ success } }`,
    { issue: id, body: lines.join('\n') },
  );
  return 'дайджест недели добавлен в Linear';
}

serveWithErrorReporting("selfcheck", async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // ВРЕМЕННЫЙ ЗАМЕР (снимается после настройки классификатора): статистика по
  // связям «событие → актив», чтобы чинить качество оснований по числам, а не
  // на глаз. Наружу отдаются только агрегаты и короткие обрывки.
  if (new URL(req.url).searchParams.get('diagnose') === 'evidence' && isPrivileged(req)) {
    const rows = (await restJson(
      'news_event_classifications_shadow?select=relevance,importance,transmission_channel,impacts,rationale_ru,prompt_version,raw_response' +
        '&status=eq.classified&order=updated_at.desc&limit=400',
    )) as AnyRecord[];
    const flat: AnyRecord[] = [];
    for (const row of rows) {
      const impacts = Array.isArray(row.impacts) ? row.impacts as AnyRecord[] : [];
      for (const impact of impacts) {
        flat.push({
          channel: String(row.transmission_channel ?? ''),
          importance: Number(row.importance ?? 0),
          relevance: Number(row.relevance ?? 0),
          asset: String(impact.asset ?? ''),
          strength: Number(impact.strength ?? 0),
          direction: String(impact.direction ?? ''),
          version: String(row.prompt_version ?? ''),
          link: String(impact.link ?? 'нет поля'),
          why: String(impact.rationale_ru ?? '').slice(0, 70),
        });
      }
    }
    const pairs: Record<string, { n: number; sum: number; weak: number }> = {};
    for (const item of flat) {
      const key = `${item.channel} → ${item.asset}`;
      const bucket = pairs[key] ?? { n: 0, sum: 0, weak: 0 };
      bucket.n += 1;
      bucket.sum += Number(item.strength);
      if (Number(item.importance) <= 5 && Number(item.strength) >= 0.5) bucket.weak += 1;
      pairs[key] = bucket;
    }
    const ranked = Object.entries(pairs)
      .map(([key, value]) => `${key}: ${value.n} шт, средняя сила ${(value.sum / value.n).toFixed(2)}, слабых связей ${value.weak}`)
      .sort((a, b) => b.length - a.length)
      .slice(0, 14);
    const suspicious = flat
      .filter((item) => Number(item.importance) <= 5 && Number(item.strength) >= 0.5)
      .sort((a, b) => Number(b.strength) - Number(a.strength))
      .slice(0, 12)
      .map((item) => `${item.channel} имп.${item.importance} рел.${item.relevance} → ${item.asset} ${item.direction} ${item.strength}: ${item.why}`);
    const byVersion: Record<string, { n: number; direct: number; derived: number; sum: number }> = {};
    for (const item of flat) {
      const key = String(item.version);
      const bucket = byVersion[key] ?? { n: 0, direct: 0, derived: 0, sum: 0 };
      bucket.n += 1;
      if (item.link === 'direct') bucket.direct += 1; else bucket.derived += 1;
      bucket.sum += Number(item.strength);
      byVersion[key] = bucket;
    }
    // The model's full answer is kept in raw_response, so what was proposed and
    // what survived can be compared instead of taken on trust.
    let proposed = 0;
    let droppedAsDerived = 0;
    for (const row of rows) {
      if (!String(row.prompt_version ?? '').includes('v4')) continue;
      const raw = (row.raw_response ?? {}) as Record<string, unknown>;
      const content = typeof raw.content === 'string' ? raw.content : '';
      let rawImpacts: unknown[] = [];
      if (content) {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          if (Array.isArray(parsed.impacts)) rawImpacts = parsed.impacts;
        } catch { rawImpacts = []; }
      }
      proposed += rawImpacts.length;
      droppedAsDerived += rawImpacts.filter((item) => {
        const value = (item ?? {}) as Record<string, unknown>;
        return String(value.link ?? '') !== 'direct';
      }).length;
    }
    const versions = Object.entries(byVersion).map(([version, value]) =>
      `${version}: связей ${value.n}, прямых ${value.direct}, выводных ${value.derived}, средняя сила ${(value.sum / value.n).toFixed(2)}`);
    const samples = flat
      .filter((item) => String(item.version).includes('v4'))
      .slice(0, 6)
      .map((item) => `${item.link} | ${item.channel} → ${item.asset} ${item.direction} ${item.strength}: ${item.why}`);
    return json({ ok: true, classifications: rows.length, impacts: flat.length, versions, samples, rejected: { proposed, droppedAsDerived }, pairs: ranked, suspicious });
  }

  const privileged = isPrivileged(req);
  const now = new Date();

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
  // Linear is still synced here, so rapid presses never leave issues unattended.
  if (!privileged && lastAge !== null && lastAge * 60 < MANUAL_COOLDOWN_MIN) {
    const storedChecks = (latest[0]?.checks ?? {}) as Record<string, Check>;
    const ctx = await linearContext();
    const linear = await syncLinear(ctx, storedChecks, String(latest[0]?.checked_at ?? now.toISOString()));
    return json({
      success: true,
      ok: Boolean(latest[0]?.ok),
      skipped: true,
      detail: `проверка уже запускалась ${(lastAge * 60).toFixed(1)} мин назад (${String(latest[0]?.trigger ?? 'cron')}); повторно можно через ${MANUAL_COOLDOWN_MIN} мин`,
      checked_at: latest[0]?.checked_at ?? null,
      linear,
      checks: storedChecks,
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
      const rows = (await restJson('forecast_latest_v2?select=issued_at&order=issued_at.desc&limit=1')) as AnyRecord[];
      const age = hoursAgo(String(rows[0]?.issued_at ?? ''));
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

    // 13a. The «Россия» block is built by our own Vercel function, which reads
    //     the CBR rates and the Russian feeds on the server. When it breaks the
    //     browser gets an empty block and says nothing: the page stays green and
    //     a whole section is quietly gone. Nothing watched it, so it is watched
    //     here — asked the same way the page asks.
    check('ru_insights', async () => {
      const started = Date.now();
      const res = await fetch(`${SITE}/api/russia-insights`, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) {
        return { ok: false, detail: `HTTP ${res.status} за ${Date.now() - started} мс` };
      }
      const payload = (await res.json().catch(() => null)) as
        | { markets?: Array<{ id?: string; provider?: string }>; headlines?: unknown[]; errors?: unknown[] }
        | null;
      if (!payload) return { ok: false, detail: 'ответ пришёл, но это не JSON' };
      const markets = Array.isArray(payload.markets) ? payload.markets : [];
      const headlines = Array.isArray(payload.headlines) ? payload.headlines.length : 0;
      const errors = Array.isArray(payload.errors) ? payload.errors.length : 0;
      // Раньше проверялись только счётчики «ЦБ ≥ 3, биржевых ≥ 3». Этого мало:
      // курсов ЦБ приходит шесть, поэтому смерть RUONIA или недельных резервов
      // проходила при зелёном счётчике. Теперь сверяется список по именам —
      // каждый из девяти индикаторов, которые страница обещает показать.
      const present = new Set(markets.map((m) => String(m?.id ?? '')));
      const expected: Array<[string, string]> = [
        ['usd-rub', 'USD/RUB ЦБ'],
        ['eur-rub', 'EUR/RUB ЦБ'],
        ['cny-rub-cbr', 'CNY/RUB ЦБ'],
        ['imoex', 'IMOEX'],
        ['rgbi', 'RGBI'],
        ['cny-rub-moex', 'CNY на Мосбирже'],
        ['key-rate', 'ключевая ставка'],
        ['ruonia', 'RUONIA'],
        ['ofz-10y', 'ОФЗ 10 лет'],
        ['reserves', 'международные резервы'],
      ];
      const missing = expected.filter(([id]) => !present.has(id)).map(([, label]) => label);
      return {
        ok: missing.length === 0 && headlines > 0,
        detail: missing.length
          ? `не пришли: ${missing.join(', ')}; заголовков ${headlines} за ${Date.now() - started} мс`
          : `все ${expected.length} индикаторов и ${headlines} заголовков за ${Date.now() - started} мс` +
            `${errors ? `, ошибок источников ${errors}` : ''}`,
      };
    }),

    // 13. The site promises no trackers, no analytics, no telemetry. Promise is
    //     cheap: this looks for the actual markers in the shipped markup, so a
    //     metric quietly switched on in the dashboard shows up here — even when
    //     the beacon is served from our own domain.
    check('no_telemetry', async () => {
      const html = (await (await fetch(SITE, { signal: AbortSignal.timeout(20000) })).text()).toLowerCase();
      const found = TELEMETRY_MARKERS.filter((marker) => html.includes(marker));
      return {
        ok: found.length === 0,
        detail: found.length
          ? `в разметке найдены счётчики: ${found.join(', ')}`
          : `счётчиков нет: проверено ${TELEMETRY_MARKERS.length} признаков, ни одного в разметке`,
      };
    }),

    // 12. The calibrated forecast writer must stay calibrated. Without this, a
    //     later edit could quietly undo the fix that stopped two weak headlines
    //     from producing a score of 1.000, and nobody would notice for weeks.
    check('calibration_applied', async () => {
      const rows = (await restJson(
        `market_forecasts_v2?select=issue_date,raw&issue_date=gte.${CALIBRATION_SINCE}&order=issue_date.desc&limit=200`,
      )) as AnyRecord[];
      if (!rows.length) {
        return { ok: true, detail: `записей после ${CALIBRATION_SINCE} пока нет — проверка встанет на дежурство сама` };
      }
      const latestDate = String(rows[0]?.issue_date ?? '').slice(0, 10);
      const sameDay = rows.filter((r) => String(r.issue_date ?? '').slice(0, 10) === latestDate);
      // A snapshot with no directional evidence is a normal outcome, not a
      // broken row: the writer stores score_raw and score_calibrated as null
      // when no forecast-bearing event pointed either way. BTC sat like that on
      // 18 of its first 21 days. Demanding a number there made this check fail
      // on any day when at least one of the five assets stayed quiet — most
      // days — and every failure filed an issue that could never close.
      const hasDirectional = (row: AnyRecord): boolean => {
        const aggregation = ((row.raw as AnyRecord)?.aggregation as AnyRecord) ?? {};
        return typeof aggregation.score_raw === 'number';
      };
      const quiet = sameDay.filter((row) => !hasDirectional(row)).length;
      const calibrated = sameDay.filter((row) => {
        const aggregation = ((row.raw as AnyRecord)?.aggregation as AnyRecord) ?? {};
        if (aggregation.calibration !== CALIBRATION_MARKER) return false;
        if (typeof aggregation.base_rate_up !== 'number') return false;
        // Null is required, not tolerated: it proves the row was written by a
        // writer that knew there was nothing to calibrate, rather than by an
        // older one that never set the field at all.
        return hasDirectional(row)
          ? typeof aggregation.score_calibrated === 'number'
          : aggregation.score_calibrated === null;
      });
      return {
        ok: calibrated.length === sameDay.length,
        detail: `за ${latestDate}: ${calibrated.length} из ${sameDay.length} прогнозов записаны с калибровкой` +
          (quiet ? ` (${quiet} без направленных доказательств — «нет сигнала», а не поломка)` : ''),
      };
    }),

    // 14. История за три месяца — это отдельный блок на странице, который
    //     собирает наш Vercel-функция из Мосбиржи и ЦБ. Если она упадёт, блок
    //     просто напишет «историю получить не удалось», и никто об этом не
    //     узнает: до сих пор её не смотрела ни одна проверка.
    //     Порог у каждого ряда свой (HISTORY_MAX_AGE_DAYS): недельные резервы
    //     и дневные котировки нельзя мерить одной линейкой.
    check('ru_history_api', async () => {
      const started = Date.now();
      const res = await fetch(`${SITE}/api/russia-history`, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} за ${Date.now() - started} мс` };
      const payload = (await res.json().catch(() => null)) as
        | { series?: Array<{ id?: string; points?: Array<{ date?: string }> }> }
        | null;
      if (!payload) return { ok: false, detail: 'ответ пришёл, но это не JSON' };
      const series = Array.isArray(payload.series) ? payload.series : [];
      const byId = new Map(series.map((item) => [String(item.id ?? ''), item]));
      const today = Date.now();
      const problems: string[] = [];
      const okParts: string[] = [];
      // Ступенчатый ряд проверяется на наличие, а не на возраст: между
      // решениями ЦБ новых точек у него быть не может.
      const step = byId.get('key-rate');
      if (!step || !Array.isArray(step.points) || step.points.length === 0) {
        problems.push('key-rate: ступени ставки нет в окне');
      } else {
        okParts.push('key-rate ступень на месте');
      }
      for (const [id, maxDays] of Object.entries(HISTORY_MAX_AGE_DAYS)) {
        const row = byId.get(id);
        const points = Array.isArray(row?.points) ? row!.points! : [];
        const last = points.at(-1)?.date;
        if (!row || !last) {
          problems.push(`${id}: ряда нет`);
          continue;
        }
        const ageDays = (today - Date.parse(`${String(last).slice(0, 10)}T00:00:00Z`)) / 86_400_000;
        if (!Number.isFinite(ageDays)) {
          problems.push(`${id}: дата не читается`);
        } else if (ageDays > maxDays) {
          problems.push(`${id}: последняя точка ${String(last)} (${Math.round(ageDays)} дн при допуске ${maxDays})`);
        } else {
          okParts.push(`${id} ${Math.round(ageDays)}/${maxDays} дн`);
        }
      }
      return {
        ok: problems.length === 0,
        detail: problems.length
          ? `просрочено: ${problems.join(', ')}`
          : `все ${okParts.length} рядов в своём сроке: ${okParts.join(', ')} за ${Date.now() - started} мс`,
      };
    }),

    // 15. Панель «Проверить данные» под мировой плиткой берёт датированные
    //     закрытия из asset_price_history_v1. Если писатель истории встанет,
    //     плитка будет показывать свежую цену, а панель — старую историю, и
    //     расхождение никто не заметит.
    check('asset_history_panel', async () => {
      const rows = (await restJson(
        'asset_price_history_v1?select=frontend_asset_id,observation_date&order=observation_date.desc&limit=400',
      )) as AnyRecord[];
      const latest = new Map<string, string>();
      for (const row of rows) {
        const id = String(row.frontend_asset_id ?? '');
        const date = String(row.observation_date ?? '').slice(0, 10);
        if (!id || !date) continue;
        const seen = latest.get(id);
        if (!seen || date > seen) latest.set(id, date);
      }
      const expected = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];
      const today = Date.now();
      const stale = expected.filter((id) => {
        const date = latest.get(id);
        if (!date) return true;
        const ageDays = (today - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
        return !Number.isFinite(ageDays) || ageDays > ASSET_HISTORY_MAX_AGE_DAYS;
      });
      return {
        ok: stale.length === 0,
        detail: stale.length
          ? `нет свежих датированных точек: ${stale.map((id) => `${id}${latest.get(id) ? ` (${latest.get(id)})` : ' (нет строк)'}`).join(', ')}`
          : `по всем ${expected.length} активам есть точки не старше ${ASSET_HISTORY_MAX_AGE_DAYS} дн`,
      };
    }),

    // 16. «Память рынка» — исследовательский раздел, который читает три
    //     публичных представления. Пустое представление не роняет страницу:
    //     раздел просто тихо показывает меньше, поэтому пустоту надо ловить.
    check('market_memory', async () => {
      const [stats, events, analogues, forecasts] = await Promise.all([
        restJson('market_memory_stats_v1?select=*&limit=1'),
        restJson('market_memory_events_v1?select=latest_published_at&order=latest_published_at.desc&limit=1'),
        restJson('market_memory_analogues_v1?select=sample_size&order=sample_size.desc&limit=1'),
        restJson('market_memory_forecasts_v1?select=issued_at&order=issued_at.desc&limit=1'),
      ]) as [AnyRecord[], AnyRecord[], AnyRecord[], AnyRecord[]];
      const missing: string[] = [];
      if (!Array.isArray(stats) || stats.length === 0) missing.push('нет итоговой статистики');
      if (!Array.isArray(events) || events.length === 0) missing.push('нет событий');
      if (!Array.isArray(analogues) || analogues.length === 0) missing.push('нет аналогов');
      if (!Array.isArray(forecasts) || forecasts.length === 0) missing.push('нет прогнозов раздела');
      if (missing.length) return { ok: false, detail: missing.join(', ') };
      const eventAge = hoursAgo(String(events[0]?.latest_published_at ?? ''));
      const forecastAge = hoursAgo(String(forecasts[0]?.issued_at ?? ''));
      const stale: string[] = [];
      // Аналоги считаются по накопленной истории и не обязаны обновляться каждый
      // день; события и прогнозы — обязаны.
      if (eventAge === null || eventAge > 72) stale.push(`последнее событие ${eventAge?.toFixed(0) ?? '—'} ч назад`);
      if (forecastAge === null || forecastAge > 48) stale.push(`прогнозы раздела ${forecastAge?.toFixed(0) ?? '—'} ч назад`);
      return {
        ok: stale.length === 0,
        detail: stale.length
          ? `раздел отстал: ${stale.join(', ')}`
          : `событие ${eventAge!.toFixed(0)} ч назад, прогнозы ${forecastAge!.toFixed(0)} ч назад, аналоги ${analogues.length ? 'есть' : 'нет'}`,
      };
    }),

    // 17. Честный счёт прогнозов — то, что читатель проверяет первым. Если
    //     представление опустеет, раздел покажет прочерки, а не ошибку.
    check('track_record', async () => {
      const rows = (await restJson(
        'forecast_track_record?select=asset_key,issued,scored,last_evaluated_at&asset_key=eq.ALL&limit=1',
      )) as AnyRecord[];
      const row = rows[0];
      if (!row) return { ok: false, detail: 'счёта прогнозов нет: представление пустое' };
      const issued = Number(row.issued ?? 0);
      const scored = Number(row.scored ?? 0);
      const age = hoursAgo(String(row.last_evaluated_at ?? ''));
      return {
        ok: issued > 0 && age !== null && age <= 36,
        detail: `выдано ${issued}, проверено ${scored}, последняя проверка ${age === null ? '—' : `${age.toFixed(1)} ч`} назад`,
      };
    }),

    // 18. PNG-карточка для Telegram собирается на лету из тех же чисел. Она
    //     не видна на странице, поэтому её поломку не заметит никто, кроме
    //     того, кто нажмёт ссылку.
    check('brief_image', async () => {
      const started = Date.now();
      // ?diag=1 меняет только ответ при ошибке: вместо голого 500 приходит
      // JSON со стадией и текстом ошибки рендерера. Так в отчёте видно, что
      // именно сломалось, а не просто «не собралась».
      const res = await fetch(`${SITE}/api/brief-image?diag=1`, { signal: AbortSignal.timeout(25000) });
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('application/json')) {
        const payload = (await res.json().catch(() => null)) as
          | { stage?: string; error?: string }
          | null;
        return {
          ok: false,
          detail: `не собралась на стадии «${payload?.stage ?? '?'}»: ${(payload?.error ?? 'без текста').slice(0, 200)}`,
        };
      }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} за ${Date.now() - started} мс` };
      const bytes = (await res.arrayBuffer()).byteLength;
      return {
        ok: type.startsWith('image/png') && bytes > 10_000,
        detail: `${type || 'без типа'}, ${Math.round(bytes / 1024)} КБ за ${Date.now() - started} мс`,
      };
    }),
  ])) {
    results[name] = value;
  }

  const ok = Object.values(results).every((r) => r.ok);
  const checkedAt = now.toISOString();
  const row = { checked_at: checkedAt, ok, checks: results, trigger: privileged ? 'cron' : 'manual' };

  try {
    await restJson('site_health', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    return json({
      success: false,
      ok,
      error: `не удалось записать site_health: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
      checks: results,
    }, 500);
  }

  // One nudge, then the paperwork. The report is already written by now, so
  // nothing below is allowed to fail the run: a broken Linear or a missing view
  // costs a line in the report, never the whole check.
  const healing = ok ? '' : await guard('самолечение', () => heal(results));
  const ctx = await linearContext();
  const linear = await syncLinear(ctx, results, checkedAt);
  const decisions = await guard('эскалация', () => escalateForecastVerdict(ctx));
  const digest = await guard('дайджест', () => weeklyDigest(ctx, now));

  return json({
    success: true,
    ok,
    checked_at: checkedAt,
    trigger: row.trigger,
    healing: healing || '',
    linear,
    decisions,
    digest,
    checks: results,
  });
});
