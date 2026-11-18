// Turns the old hub's "Export all data" JSON into one SQL script for the Supabase SQL editor.
// Bundled for the browser so it can run on the hub page itself (window.__hubToSql(text)).
import { convertOldHub } from '../src/lib/hubConvert';

const ORDER = ['library', 'brands', 'suppliers', 'catalog', 'leads', 'jobs', 'change_orders', 'sections', 'phases', 'lines', 'costs'] as const;

export function hubToSql(text: string): { sql: string; counts: Record<string, number> } {
  const { tables, pins, catalogLog } = convertOldHub(JSON.parse(text));
  const tag = '$cc' + Math.random().toString(36).slice(2, 8) + '$';
  const lit = (v: unknown) => tag + JSON.stringify(v) + tag;
  const ids = (rows: Record<string, unknown>[]) => `select jsonb_array_elements_text(${lit(rows.map(r => r.id))}::jsonb)`;
  const out: string[] = ['begin;'];
  // The hub's section buttons replace the starter set.
  if (tables.library.length) out.push(`delete from library where id not in (${ids(tables.library)});`);
  for (const t of ['jobs', 'library', 'catalog', 'brands', 'suppliers', 'leads'] as const)
    if (tables[t].length) out.push(`delete from ${t} where id in (${ids(tables[t])});`);
  for (const t of ORDER) {
    let rows = tables[t]; if (!rows.length) continue;
    if (t === 'lines') rows = rows.map(r => ({ ...r, of_line: null }));
    out.push(`insert into ${t} select * from jsonb_populate_recordset(null::${t}, ${lit(rows)}::jsonb);`);
  }
  const withOf = tables.lines.filter(l => l.of_line).map(l => ({ id: l.id, of_line: l.of_line }));
  if (withOf.length) out.push(`update lines set of_line = v.of_line from jsonb_to_recordset(${lit(withOf)}::jsonb) v(id text, of_line text) where lines.id = v.id;`);
  if (catalogLog.length) out.push(`insert into catalog_log (at, by_email, item_id, change, data) select v.at, v.by_email, v.item_id, v.change, v.data from jsonb_to_recordset(${lit(catalogLog)}::jsonb) v(at timestamptz, by_email text, item_id text, change text, data jsonb) where not exists (select 1 from catalog_log c where c.at = v.at and c.item_id is not distinct from v.item_id);`);
  if (pins.length) out.push(`update jobs set pin_hash = crypt(v.pin, gen_salt('bf')) from jsonb_to_recordset(${lit(pins)}::jsonb) v(job text, pin text) where jobs.id = v.job;`);
  out.push(`select setval('job_ref_seq', greatest(1, coalesce((select max((regexp_match(ref, '^E-' || to_char(now(),'YYYY') || '-(\\d+)'))[1]::int) from jobs), 0)));`);
  out.push('commit;');
  out.push(`select (select count(*) from jobs) jobs, (select count(*) from sections) sections, (select count(*) from lines) lines, (select count(*) from costs) costs, (select count(*) from library) library, (select count(*) from catalog) catalog, (select count(*) from leads) leads, (select count(*) from brands) brands, (select count(*) from suppliers) suppliers;`);
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  return { sql: out.join('\n'), counts };
}
(globalThis as Record<string, unknown>).__hubToSql = hubToSql;
