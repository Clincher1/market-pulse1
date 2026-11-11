// Генератор SQL для реестра слотов.
//
// Зачем генератор, а не написанный руками seed. Реестр живёт в коде
// (`_shared/slots.ts`), а база должна видеть ту же картину, чтобы страница
// состояния могла показать номера и выбор без выката. Если писать seed руками,
// он разойдётся с кодом на первой же правке — и мониторинг начнёт показывать
// не то, что работает.
//
// Проверка `slots_registry` в selfcheck сверяет копию в базе с кодом: это и
// есть сторож от расхождения. Скрипт печатает только идемпотентные `insert …
// on conflict do update`, поэтому его вывод можно применять повторно.
//
//   node scripts/slots-sql.mjs > /tmp/slots.sql
import { SLOTS } from '../supabase/functions/_shared/slots.ts';

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;

const rows = SLOTS.map((slot) =>
  [
    quote(slot.id),
    slot.number,
    quote(slot.section),
    quote(slot.title),
    quote(slot.kind),
    json(slot.columns),
    slot.canChoose ? 'true' : 'false',
    json(slot.sources),
    quote(slot.note),
  ].join(', '),
);

const sql = `insert into public.data_slot_registry
  (slot_id, number, section, title, kind, columns, can_choose, sources, note, updated_at)
values
${rows.map((row) => `  (${row}, now())`).join(',\n')}
on conflict (slot_id) do update set
  number = excluded.number,
  section = excluded.section,
  title = excluded.title,
  kind = excluded.kind,
  columns = excluded.columns,
  can_choose = excluded.can_choose,
  sources = excluded.sources,
  note = excluded.note,
  updated_at = now();
`;

process.stdout.write(sql);
