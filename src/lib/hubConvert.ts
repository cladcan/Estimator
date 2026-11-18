// Convert the old hub's "Export all data" file into this app's table rows. No database access here.
import { evalExpr } from './calc';
import { LINE_TYPES, LINE_ROLES } from './types';

export type Rec = Record<string, unknown>;
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return evalExpr(String(v));
};
const s = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const b = (v: unknown) => v === true || v === 'Y' || v === 'true' || v === 1;
const yn = (v: unknown): 'Y' | 'N' | null => (v === 'Y' || v === true ? 'Y' : v === 'N' || v === false ? 'N' : null);
const mode = (v: unknown) => (v === '%' || v === 'pct' || v === 'percent' ? 'pct' : v === '$' || v === 'amt' || v === 'amount' ? 'amt' : undefined);
const date = (v: unknown) => { const t = s(v); if (!t) return null; const d = new Date(t); return isNaN(+d) ? null : d.toISOString().slice(0, 10); };
const ts = (v: unknown) => { const t = s(v) ?? (typeof v === 'number' ? v : null); if (t === null) return null; const d = new Date(t as string); return isNaN(+d) ? null : d.toISOString(); };
const scope = (v: unknown) => { const t = String(v || '').toLowerCase();
  if (!t) return 'supply_install'; if (t.includes('design') && t.includes('supply')) return 'design_supply'; if (t.includes('design')) return 'design';
  if (t.includes('install') && t.includes('supply')) return 'supply_install'; if (t.includes('install')) return 'install'; if (t.includes('supply')) return 'supply'; return 'supply_install'; };
const recs = (x: unknown): { id: string; data: Rec }[] => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.entries(x).map(([id, data]) => ({ id, data })) : [])
  .map((r: Rec) => ({ id: String(r.id), data: (r.data && typeof r.data === 'object' ? r.data : r) as Rec }));

/** Convert the old hub's export into our table rows. */
export function convertOldHub(file: Rec) {
  // The hub's file is { exportedAt, source, collections: { jobs: [{id, data}], … } }; older files had the collections at the top.
  const src = (file.collections && typeof file.collections === 'object' ? file.collections : file) as Rec;
  const T: Record<string, Rec[]> = { library: [], brands: [], suppliers: [], catalog: [], leads: [], jobs: [], change_orders: [], sections: [], phases: [], lines: [], costs: [] };
  const pins: { job: string; pin: string }[] = [];
  for (const { id, data: d } of recs(src.library))
    T.library.push({ id, name: s(d.name) || id, pos: n(d.pos) ?? 0, mk: yn(d.mk), items: d.items || [], sheet_sqft: n(d.sheetSqft), ctext: s(d.ctext), presets: d.presets || [], raw: d });
  for (const t of ['brands', 'suppliers'] as const) for (const { id, data: d } of recs(src[t])) T[t].push({ id, name: s(d.name) || id });
  for (const { id, data: d } of recs(src.catalog)) {
    const pack = (d.pack || {}) as Rec; const inc = (d.increase || {}) as Rec;
    const tiersRaw = (d.prices || d.tiers || []) as unknown;
    const tiers = (Array.isArray(tiersRaw) ? tiersRaw : Object.entries(tiersRaw as Rec).map(([tier, v]) => (typeof v === 'object' ? { tier, ...(v as Rec) } : { tier, price: v })))
      .map((t: Rec) => ({ ...t, tier: s(t.tier) || 'Standard', price: n(t.price ?? t.amt) ?? 0, source: s(t.source ?? t.src) ?? undefined }));
    const use = String(d.use ?? d.useUnit ?? d.use_unit ?? '');
    const acc = ((d.accessories || []) as unknown[]).map(a => (typeof a === 'string' ? { catId: a } : a));
    T.catalog.push({ id, name: s(d.name) || id, brand: s(d.brand), supplier: s(d.supplier), category: s(d.cat ?? d.category) ?? s(d.line),
      sell_unit: s(d.sell ?? d.sellUnit ?? d.sell_unit),
      use_unit: use.toUpperCase() === 'SF' ? 'SF' : use.toUpperCase() === 'LF' ? 'LF' : use === 'pc' ? 'pc' : null,
      pack: { qty: n(pack.qty), lenFt: n(pack.lenFt ?? pack.len_ft ?? pack.lf ?? pack.len), sf: n(pack.sf ?? pack.sf_per_pc) },
      tiers, increase_pct: n(inc.pct ?? d.increasePct), increase_from: date(inc.from ?? d.increaseFrom),
      accessories: acc, notes: s(d.notes ?? d.desc), raw: d, updated_at: ts(d.updatedAt) || new Date().toISOString() });
  }
  for (const { id, data: d } of recs(src.leads))
    T.leads.push({ id, name: s(d.name), client: s(d.client), phase: s(d.phase), priority: s(d.priority), owner: s(d.owner), url: s(d.url), contact_id: s(d.contactId), drive: s(d.drive), updated_at: ts(d.updatedAt), data: d });

  const secIdMap = new Map<string, string>(); const refs = new Set<string>();
  for (const { id: jobId, data: j } of recs(src.jobs)) {
    let ref = s(j.ref); if (ref) { let k = 2; const base = ref; while (refs.has(ref)) ref = `${base}-${k++}`; refs.add(ref); }
    const pr = { ...((j.pr || {}) as Rec) }; pr.cm = mode(pr.cm) || 'pct'; pr.dm = mode(pr.dm) || 'pct';
    for (const k of ['m', 't', 'c', 'd']) pr[k] = n(pr[k]);
    const tax = n(j.tax);
    T.jobs.push({ id: jobId, ref, name: s(j.name) || jobId, client: s(j.client), estimate_no: s(j.estimate), scope: scope(j.scope),
      monday_id: s(j.mondayId), monday_url: s(j.mondayUrl), monday_contact_id: s(j.mondayContactId), drive: s(j.drive),
      contract: n(j.contract) ?? 0, mode: j.mode === 'project' || (j.mode !== 'estimation' && j.started) ? 'project' : 'estimation', pr, wave: j.wave || {}, quoted: n(j.quoted) ?? 0,
      tax: tax !== null && tax > 0 && tax < 1 ? tax : null, started: ts(j.started), started_by: s(j.startedBy), approved_at: ts(j.approvedAt),
      created_at: ts(j.createdAt) || new Date().toISOString(), updated_at: ts(j.updatedAt) || new Date().toISOString(), updated_by: s(j.updatedBy) });
    if (j.pin) pins.push({ job: jobId, pin: String(j.pin) });
    for (const co of (j.cos || []) as Rec[])
      T.change_orders.push({ id: `${jobId}.${co.id}`, job_id: jobId, opened_at: ts(co.at) || new Date().toISOString(), issued: date(co.issued), type: co.type === 'client' || co.type === 'internal' ? co.type : null, price: n(co.price) ?? 0 });
    for (const c of (j.cats || []) as Rec[]) {
      const sid = `${jobId}.${c.id}`; secIdMap.set(sid, sid);
      T.sections.push({ id: sid, job_id: jobId, pos: n(c.pos) ?? 0, name: s(c.name) || 'Section', lib: s(c.lib), preset: s(c.preset), area: n(c.sqft ?? c.area), sheet_sqft: n(c.sheetSqft),
        mk: yn(c.mk), fmk: n(c.fmk), fmkm: mode(c.fmkm) || 'amt', fin: b(c.fin), ctext: s(c.ctext), wgrp: s(c.wgrp), tier: s(c.tier),
        proj_only: b(c.projOnly), proj_off: b(c.projOff ?? c.off), co_id: c.co ? `${jobId}.${c.co}` : null, act_override: n(c.actOverride) });
      ((c.phases || []) as Rec[]).forEach((p, i) => T.phases.push({ id: `${sid}.${p.id}`, section_id: sid, job_id: jobId, name: s(p.name) || `Phase ${i + 2}`, pos: i }));
    }
  }
  const lineIds = new Set<string>();
  for (const { id, data: l } of recs(src.lines)) {
    const job = s(l.job) || id.split('.')[0]; const sid = `${job}.${l.cat}`;
    if (!secIdMap.has(sid)) continue;
    const lid = id.includes('.') ? id : `${job}.${l.key ?? id}`; lineIds.add(lid);
    T.lines.push({ id: lid, job_id: job, section_id: sid, kind: l.kind === 'todo' ? 'todo' : 'item', pos: n(l.pos) ?? 0, name: s(l.name) || '',
      type: LINE_TYPES.includes(l.type as never) ? l.type : 'Other', role: LINE_ROLES.includes(l.role as never) ? l.role : null,
      est_qty: n(l.estQty), est_rate: n(l.estRate), est_amount: n(l.estAmount) ?? 0, eff_qty: n(l.effQty), eff_rate: n(l.effRate),
      bud_qty: n(l.budQty), bud_rate: n(l.budRate), budget: n(l.budget), act_qty: n(l.actQty), act_rate: n(l.actRate), act_amount: n(l.actAmount) ?? 0,
      act_date: date(l.actDate), act_eff_qty: n(l.actEffQty), act_eff_rate: n(l.actEffRate), mk: yn(l.mk),
      phase_id: l.phase ? `${sid}.${l.phase}` : null, of_line: l.of ? `${job}.${l.of}` : null, proj_only: b(l.projOnly), co_id: l.co ? `${job}.${l.co}` : null,
      done: b(l.done), date: date(l.date), custom: b(l.custom), cat_id: s(l.catId), tier: s(l.tier), unit: s(l.unit), rate_note: s(l.rateNote) });
  }
  const phaseIds = new Set(T.phases.map(p => p.id));
  for (const l of T.lines) { if (l.phase_id && !phaseIds.has(l.phase_id as string)) l.phase_id = null; if (l.of_line && !lineIds.has(l.of_line as string)) l.of_line = null; }
  for (const { id, data: c } of recs(src.costs)) {
    const job = s(c.job) || id.split('.')[0]; const lid = `${job}.${c.line}`; if (!lineIds.has(lid)) continue;
    T.costs.push({ id: id.includes('.') ? id : `${job}.${id}`, job_id: job, line_id: lid, section_id: c.cat ? `${job}.${c.cat}` : null, type: s(c.type), pos: n(c.pos) ?? 0,
      name: s(c.name) || '', qty: n(c.qty), rate: n(c.rate), amount: n(c.amount) ?? (n(c.qty) ?? 0) * (n(c.rate) ?? 0), date: date(c.date) });
  }
  return { tables: T, pins, catalogLog: recs(src.catalog_log).map(({ data }) => ({ at: ts(data.at) || new Date().toISOString(), by_email: s(data.by), item_id: s(data.id ?? data.item), change: s(data.change ?? data.what), data })) };
}
