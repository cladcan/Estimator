// Export everything to JSON, and import either our own export or the old hub's "Export all data" file.
import { supabase } from './supabase';
import { convertOldHub } from './hubConvert';

const TABLES = ['settings', 'library', 'brands', 'suppliers', 'catalog', 'catalog_log', 'leads', 'jobs', 'change_orders', 'sections', 'phases', 'lines', 'costs', 'attachments'] as const;
const ORDER = ['library', 'brands', 'suppliers', 'catalog', 'leads', 'jobs', 'change_orders', 'sections', 'phases', 'lines', 'costs', 'attachments'] as const;

async function fetchAll(table: string) {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}

export async function exportAll() {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await fetchAll(t);
  const blob = new Blob([JSON.stringify({ format: 'cladcan-estimator', version: 1, exportedAt: new Date().toISOString(), tables }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `cladcan-estimator-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
}

type Rec = Record<string, unknown>;

async function upsert(table: string, rows: Rec[], progress: (m: string) => void) {
  for (let i = 0; i < rows.length; i += 250) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 250));
    if (error) throw new Error(`${table}: ${error.message}`);
    progress(`Importing ${table}… ${Math.min(i + 250, rows.length)}/${rows.length}`);
  }
}

export async function importFile(file: File, progress: (m: string) => void): Promise<string> {
  const src = JSON.parse(await file.text()) as Rec;
  let tables: Record<string, Rec[]>; let pins: { job: string; pin: string }[] = []; let log: Rec[] = [];
  if (src.format === 'cladcan-estimator') { tables = src.tables as Record<string, Rec[]>; log = (tables.catalog_log || []).map(({ id: _id, ...r }) => r); }
  else { const c = convertOldHub(src); tables = c.tables; pins = c.pins; log = c.catalogLog; }
  if (tables.settings?.length) await upsert('settings', tables.settings, progress);
  for (const t of ORDER) {
    let rows = tables[t] || [];
    if (t === 'lines') rows = rows.map(r => ({ ...r, of_line: null, proj_amount: undefined }));
    await upsert(t, rows, progress);
  }
  const withOf = (tables.lines || []).filter(l => l.of_line);
  for (const l of withOf) await supabase.from('lines').update({ of_line: l.of_line }).eq('id', l.id as string);
  if (log.length) await supabase.from('catalog_log').insert(log);
  for (const p of pins) await supabase.rpc('import_pin', { p_job: p.job, p_pin: p.pin });
  return `Imported ${tables.jobs?.length || 0} jobs, ${tables.lines?.length || 0} lines, ${tables.costs?.length || 0} costs, ${tables.library?.length || 0} library sections, ${tables.catalog?.length || 0} catalogue products.`;
}
