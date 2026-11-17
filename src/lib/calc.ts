// The estimating maths. Pure functions, no database access.
import type { Cost, Job, Line, Section, Settings, ChangeOrder } from './types';

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const z = (v: unknown) => num(v) ?? 0;

/** Evaluate a typed number that may be a simple sum like "10+5" or "12*3.5". Returns null for blank. */
export function evalExpr(s: string): number | null {
  const t = s.replace(/[\s,$]/g, '');
  if (!t) return null;
  if (!/^[-+*/().\d]+$/.test(t)) return null;
  let i = 0;
  const peek = () => t[i];
  const factor = (): number => {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; return v; }
    const m = /^\d*\.?\d+|^\d+\./.exec(t.slice(i)); if (!m) throw new Error('bad');
    i += m[0].length; return parseFloat(m[0]);
  };
  const term = (): number => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = t[i++]; const w = factor(); v = op === '*' ? v * w : v / w; } return v; };
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = t[i++]; const w = term(); v = op === '+' ? v + w : v - w; } return v; };
  try { const v = expr(); return i === t.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

export const kindOf = (s: Pick<Section, 'lib'>) => (s.lib || '').toLowerCase();
export const isSubtrade = (s: Section, st: Settings) => st.no_markup_kinds.includes(kindOf(s));
export const isFinishedFace = (s: Section, st: Settings) => s.fin || st.finished_face_kinds.includes(kindOf(s)) || /^acm/i.test(s.name);

/** A line's markup flag after defaults: line → section → kind default. */
export function lineMk(l: Line, s: Section, st: Settings): 'Y' | 'N' {
  if (isSubtrade(s, st)) return 'N';
  if (l.mk) return l.mk;
  if (s.mk) return s.mk;
  return st.markup_default_kinds.includes(kindOf(s)) ? 'Y' : 'N';
}

export type Side = 'est' | 'act';
export type LineCalc = { qty: number | null; rate: number | null; amount: number; qtyAuto: boolean; rateAuto: boolean; sheetArea?: number };

/** Is a line part of the live estimate (not project-only, not a phase copy, not a change-order line)? */
export const inEstimate = (l: Line, s: Section) => l.kind === 'item' && !l.proj_only && !l.of_line && !l.co_id && !s.proj_only && !s.co_id;

/**
 * Calculate every item line of one section, on the estimate side or the actual side.
 * Role-linked lines (sheets, fab, cut & bend, wastage, WSIB) fill blanks from the other lines.
 */
export function calcSection(sec: Section, lines: Line[], all: { sections: Section[]; lines: Line[]; costs: Cost[] }, side: Side, st: Settings): Map<string, LineCalc> {
  const out = new Map<string, LineCalc>();
  const items = lines.filter(l => l.kind === 'item' && l.section_id === sec.id && !l.phase_id);
  const typedQ = (l: Line) => num(side === 'est' ? l.est_qty : l.act_qty);
  const typedR = (l: Line) => num(side === 'est' ? l.est_rate : l.act_rate);
  const costsFor = (l: Line) => all.costs.filter(c => c.line_id === l.id);
  const costQty = (l: Line) => side === 'act' ? costsFor(l).reduce((a, c) => a + z(c.qty), 0) : 0;
  const costAmt = (l: Line) => side === 'act' ? costsFor(l).reduce((a, c) => a + z(c.amount), 0) : 0;

  const byRole = (r: string) => items.find(l => l.role === r);
  const sheets = byRole('sheets'), fab = byRole('fab'), cb = byRole('cutbend');
  const sheetArea = sheets ? z(typedQ(sheets)) * z(sec.sheet_sqft) : 0;
  const fabRate = fab ? typedR(fab) : null;
  const effQty = (l?: Line) => (l ? z(typedQ(l)) + costQty(l) : 0);

  for (const l of items) {
    let q = typedQ(l), rt = typedR(l), qAuto = false, rAuto = false, amount: number;
    if (l.role === 'sheets') { out.set(l.id, { qty: q, rate: rt, amount: 0, qtyAuto: false, rateAuto: false, sheetArea }); continue; }
    if (l.role === 'cutbend' && rt === null && fabRate !== null) { rt = Math.max(0, fabRate - st.cut_bend_offset); rAuto = true; }
    if (l.role === 'wastage' && q === null && sheets) { q = Math.max(0, sheetArea - effQty(fab) - effQty(cb)); qAuto = true; }
    if (l.role === 'wsib') {
      if (q === null) { q = st.wsib_pct; qAuto = true; }
      if (rt === null) { rt = wsibBase(sec, all, side, st); rAuto = true; }
      amount = r2(z(q) / 100 * z(rt));
    } else amount = r2(z(q) * z(rt));
    if (side === 'act') amount = r2(amount + costAmt(l));
    out.set(l.id, { qty: q, rate: rt, amount, qtyAuto: qAuto, rateAuto: rAuto });
  }
  return out;
}

/** WSIB base: Labour lines in this section + every line in PM and shop-drawing sections. */
export function wsibBase(sec: Section, all: { sections: Section[]; lines: Line[]; costs: Cost[] }, side: Side, st: Settings): number {
  const amt = (l: Line) => {
    const q = z(side === 'est' ? l.est_qty : l.act_qty), r = z(side === 'est' ? l.est_rate : l.act_rate);
    return q * r + (side === 'act' ? all.costs.filter(c => c.line_id === l.id).reduce((a, c) => a + z(c.amount), 0) : 0);
  };
  const ok = (l: Line, s: Section) => l.kind === 'item' && !l.proj_only && !l.co_id && !l.phase_id && !s.proj_only && !s.co_id && !s.proj_off && l.role !== 'wsib';
  let base = 0;
  for (const l of all.lines) {
    const s = all.sections.find(x => x.id === l.section_id); if (!s || !ok(l, s)) continue;
    if (s.id === sec.id && l.type === 'Labour') base += amt(l);
    else if (s.id !== sec.id && st.wsib_base_kinds.includes(kindOf(s))) base += amt(l);
  }
  return r2(base);
}

/** Job area for $/SF: finished-face sections + extra areas, adjusted by the override. */
export function jobArea(job: Pick<Job, 'pr'>, sections: Section[], st: Settings): { auto: number; area: number } {
  const auto = sections.filter(s => !s.proj_off && !s.proj_only && !s.co_id && isFinishedFace(s, st)).reduce((a, s) => a + z(s.area), 0)
    + (job.pr.x || []).reduce((a, x) => a + z(x.sf), 0);
  const o = (job.pr.sf ?? '').toString().trim();
  if (!o) return { auto, area: auto };
  if (/^[+-]/.test(o)) return { auto, area: auto + z(evalExpr(o)) };
  return { auto, area: z(evalExpr(o)) };
}

export const taxRate = (job: Pick<Job, 'tax'>, st: Settings) => (job.tax !== null && job.tax !== undefined && job.tax >= 0 && job.tax < 1 ? job.tax : st.tax_pct / 100);

export type Pricing = { A: number; B: number; P: number; FM: number; U: number; T: number; C: number; S0: number; D: number; Q: number; area: number; autoArea: number; m: number; t: number; c: number; d: number };

/** The pricing panel. Uses estimate amounts (est side) of estimate lines. */
export function pricing(job: Job, sections: Section[], lines: Line[], estCalc: Map<string, LineCalc>, st: Settings): Pricing {
  let A = 0, B = 0, FM = 0;
  for (const s of sections) {
    if (s.proj_only || s.co_id) continue;
    let secSum = 0;
    for (const l of lines) {
      if (l.section_id !== s.id || !inEstimate(l, s)) continue;
      const a = estCalc.get(l.id)?.amount ?? z(l.est_amount);
      secSum += a;
      if (lineMk(l, s, st) === 'Y') A += a; else B += a;
    }
    if (s.fmk) FM += s.fmkm === 'pct' ? secSum * z(s.fmk) / 100 : z(s.fmk);
  }
  const pr = job.pr || {};
  const m = num(pr.m) ?? st.markup_pct, t = num(pr.t) ?? st.contingency_pct, c = num(pr.c) ?? z(st.commission_pct), d = z(pr.d);
  const P = A + B;
  const U = A * m / 100 + FM;
  const T = P * t / 100;
  const C = pr.cm === 'amt' ? c : P * c / 100;
  const S0 = P + U + T + C;
  const D = Math.min(Math.max(pr.dm === 'amt' ? d : S0 * d / 100, 0), S0);
  const Q = S0 - D;
  const { auto, area } = jobArea(job, sections, st);
  return { A: r2(A), B: r2(B), P: r2(P), FM: r2(FM), U: r2(U), T: r2(T), C: r2(C), S0: r2(S0), D: r2(D), Q: r2(Q), area, autoArea: auto, m, t, c, d };
}

/** Issued change orders only. */
export const issuedCOs = (cos: ChangeOrder[]) => cos.filter(c => c.issued);
export const coLabel = (cos: ChangeOrder[], id: string | null) => { const i = [...cos].sort((a, b) => a.opened_at.localeCompare(b.opened_at)).findIndex(c => c.id === id); return i >= 0 ? `CO ${i + 1}` : ''; };

/** Does a line count in project totals (not on an unissued change order)? */
export function countsInProject(l: Line, s: Section, cos: ChangeOrder[]) {
  const coId = l.co_id || s.co_id;
  return !coId || !!cos.find(c => c.id === coId)?.issued;
}

export const money = (v: number, dec = 2) => (Number.isFinite(v) ? v : 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtN = (v: number | null | undefined, dec = 2) => (v === null || v === undefined ? '' : Number(v.toFixed(dec)).toLocaleString('en-CA', { maximumFractionDigits: dec }));
export const newId = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
