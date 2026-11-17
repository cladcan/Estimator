'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcSection, countsInProject, inEstimate, newId, pricing, r2, type LineCalc } from '@/lib/calc';
import type { ChangeOrder, Cost, Job, Line, Phase, Section, Settings } from '@/lib/types';

export type JobData = { job: Job; sections: Section[]; lines: Line[]; costs: Cost[]; phases: Phase[]; cos: ChangeOrder[] };
type Status = { pending: number; error: string; offline: boolean; savedAt: Date | null };

const blankLine = (p: Partial<Line> & Pick<Line, 'job_id' | 'section_id'>): Line => ({
  id: newId('l'), kind: 'item', pos: 0, name: '', type: 'Material', role: null, est_qty: null, est_rate: null, est_amount: 0, eff_qty: null, eff_rate: null,
  bud_qty: null, bud_rate: null, budget: null, act_qty: null, act_rate: null, act_amount: 0, act_date: null, act_eff_qty: null, act_eff_rate: null, proj_amount: 0,
  mk: null, phase_id: null, of_line: null, proj_only: false, co_id: null, done: false, date: null, custom: false, cat_id: null, tier: null, unit: null, rate_note: null, ...p,
});
export { blankLine };

export function useJob(id: string, st: Settings) {
  const [d, setD] = useState<JobData | null>(null);
  const [status, setStatus] = useState<Status>({ pending: 0, error: '', offline: false, savedAt: null });
  const pending = useRef(0); const reloadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dRef = useRef(d); dRef.current = d;

  const load = useCallback(async () => {
    try {
      const [j, s, l, c, p, co] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('sections').select('*').eq('job_id', id).order('pos'),
        supabase.from('lines').select('*').eq('job_id', id).order('pos'),
        supabase.from('costs').select('*').eq('job_id', id).order('pos'),
        supabase.from('phases').select('*').eq('job_id', id).order('pos'),
        supabase.from('change_orders').select('*').eq('job_id', id).order('opened_at'),
      ]);
      const err = [j, s, l, c, p, co].find(r => r.error)?.error; if (err) throw new Error(err.message);
      const data = { job: j.data, sections: s.data!, lines: l.data!, costs: c.data!, phases: p.data!, cos: co.data! } as JobData;
      setD(data); setStatus(x => ({ ...x, offline: false }));
      try { localStorage.setItem('job-copy:' + id, JSON.stringify(data)); } catch {}
    } catch (e) {
      try { const c = localStorage.getItem('job-copy:' + id); if (c) { setD(JSON.parse(c)); setStatus(x => ({ ...x, offline: true, error: '' })); return; } } catch {}
      setStatus(x => ({ ...x, error: (e as Error).message }));
    }
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase.channel('job-' + id);
    for (const t of ['lines', 'costs', 'sections', 'phases', 'change_orders']) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `job_id=eq.${id}` }, () => schedule());
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `id=eq.${id}` }, () => schedule()).subscribe();
    const schedule = () => { clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => { if (pending.current === 0) load(); else schedule(); }, 800); };
    const wake = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', wake); window.addEventListener('online', load);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', load); };
  }, [id, load]);

  /** Run a database write, tracking the save status. */
  const run = useCallback(async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    pending.current++; setStatus(x => ({ ...x, pending: pending.current }));
    let error: { message: string } | null = null;
    for (let i = 0; i < 3; i++) { ({ error } = await fn()); if (!error || /violates|denied|not allowed|permission/i.test(error.message)) break; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
    pending.current--; setStatus(x => ({ ...x, pending: pending.current, error: error ? error.message : x.error && pending.current ? x.error : '', savedAt: error ? x.savedAt : new Date() }));
    if (error) throw new Error(error.message);
  }, []);

  // ───── calculated values ─────
  const calc = useMemo(() => {
    if (!d) return null;
    const all = { sections: d.sections, lines: d.lines, costs: d.costs };
    const est = new Map<string, LineCalc>(), act = new Map<string, LineCalc>();
    for (const s of d.sections) { for (const [k, v] of calcSection(s, d.lines, all, 'est', st)) est.set(k, v); for (const [k, v] of calcSection(s, d.lines, all, 'act', st)) act.set(k, v); }
    for (const l of d.lines) if (l.phase_id && l.kind === 'item') {
      const ca = d.costs.filter(c => c.line_id === l.id).reduce((a, c) => a + Number(c.amount || 0), 0);
      act.set(l.id, { qty: l.act_qty, rate: l.act_rate, amount: r2(Number(l.act_qty || 0) * Number(l.act_rate || 0) + ca), qtyAuto: false, rateAuto: false });
    }
    const pr = pricing(d.job, d.sections, d.lines, est, st);
    const secTotals = new Map<string, { est: number; budget: number; actual: number; rawActual: number }>();
    for (const s of d.sections) {
      let e = 0, b = 0, a = 0;
      for (const l of d.lines) {
        if (l.section_id !== s.id || l.kind !== 'item') continue;
        if (inEstimate(l, s)) e += est.get(l.id)?.amount ?? 0;
        if (!countsInProject(l, s, d.cos)) continue;
        if (!l.of_line) b += Number(l.budget || 0);
        a += act.get(l.id)?.amount ?? 0;
      }
      secTotals.set(s.id, { est: r2(e), budget: r2(b), rawActual: r2(a), actual: s.act_override !== null && s.act_override !== undefined ? Number(s.act_override) : r2(a) });
    }
    let budget = 0, actual = 0;
    for (const s of d.sections) { if (!countsInProject({ co_id: null } as Line, s, d.cos)) continue; const t = secTotals.get(s.id)!; budget += t.budget; actual += t.actual; }
    const coPrice = d.cos.filter(c => c.issued && c.type === 'client').reduce((a, c) => a + Number(c.price || 0), 0);
    return { est, act, pr, secTotals, budget: r2(budget), actual: r2(actual), coPrice, contractTotal: Number(d.job.contract || 0) + coPrice };
  }, [d, st]);

  // Persist derived amounts so totals in the database stay right.
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!d || !calc || status.offline) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const ups: Partial<Line>[] = [];
      for (const l of d.lines) {
        if (l.kind !== 'item') continue;
        const e = calc.est.get(l.id), a = calc.act.get(l.id);
        const costsAmt = d.costs.filter(c => c.line_id === l.id).reduce((x, c) => x + Number(c.amount || 0), 0);
        const p: Partial<Line> = {};
        if (e && !l.phase_id) { if (Number(l.est_amount) !== e.amount) p.est_amount = e.amount; if (l.eff_qty !== e.qty) p.eff_qty = e.qty; if (l.eff_rate !== e.rate) p.eff_rate = e.rate; }
        if (a) { const aa = r2(a.amount - costsAmt); if (Number(l.act_amount) !== aa) p.act_amount = aa; if (l.act_eff_qty !== a.qty) p.act_eff_qty = a.qty; if (l.act_eff_rate !== a.rate) p.act_eff_rate = a.rate; }
        if (Object.keys(p).length) ups.push({ id: l.id, ...p });
      }
      if (ups.length && dRef.current) { for (const u of ups) run(() => supabase.from('lines').update(u).eq('id', u.id!)).catch(() => {}); }
      if (!d.job.started && Number(d.job.quoted) !== calc.pr.Q) run(() => supabase.from('jobs').update({ quoted: calc.pr.Q }).eq('id', d.job.id)).catch(() => {});
    }, 1500);
  }, [d, calc, run, status.offline]);

  // ───── mutations (optimistic) ─────
  const set = (fn: (x: JobData) => JobData) => setD(x => (x ? fn(x) : x));
  const stamp = () => ({ updated_at: new Date().toISOString() });

  const api = {
    patchJob: (p: Partial<Job>) => { set(x => ({ ...x, job: { ...x.job, ...p } })); return run(() => supabase.from('jobs').update({ ...p, ...stamp() }).eq('id', id)); },
    patchSection: (sid: string, p: Partial<Section>) => { set(x => ({ ...x, sections: x.sections.map(s => s.id === sid ? { ...s, ...p } : s) })); return run(() => supabase.from('sections').update(p).eq('id', sid)); },
    patchLine: (lid: string, p: Partial<Line>) => { set(x => ({ ...x, lines: x.lines.map(l => l.id === lid ? { ...l, ...p } : l) })); return run(() => supabase.from('lines').update({ ...p, ...stamp() }).eq('id', lid)); },
    patchCost: (cid: string, p: Partial<Cost>) => { set(x => ({ ...x, costs: x.costs.map(c => c.id === cid ? { ...c, ...p } : c) })); return run(() => supabase.from('costs').update(p).eq('id', cid)); },
    patchPhase: (pid: string, p: Partial<Phase>) => { set(x => ({ ...x, phases: x.phases.map(c => c.id === pid ? { ...c, ...p } : c) })); return run(() => supabase.from('phases').update(p).eq('id', pid)); },
    patchCO: (cid: string, p: Partial<ChangeOrder>) => { set(x => ({ ...x, cos: x.cos.map(c => c.id === cid ? { ...c, ...p } : c) })); return run(() => supabase.from('change_orders').update(p).eq('id', cid)); },

    /** Insert sections and lines together, then renumber section positions. */
    insertSections: async (secs: Section[], lines: Line[], order: string[]) => {
      set(x => ({ ...x, sections: order.map((sid, i) => ({ ...(x.sections.find(s => s.id === sid) || secs.find(s => s.id === sid)!), pos: i })), lines: [...x.lines, ...lines] }));
      await run(() => supabase.from('sections').insert(secs.map(s => ({ ...s, pos: order.indexOf(s.id) }))));
      if (lines.length) await run(() => supabase.from('lines').insert(lines));
      await Promise.all(order.map((sid, i) => (secs.find(s => s.id === sid) ? null : run(() => supabase.from('sections').update({ pos: i }).eq('id', sid)))));
    },
    deleteSection: (sid: string) => { set(x => ({ ...x, sections: x.sections.filter(s => s.id !== sid), lines: x.lines.filter(l => l.section_id !== sid) })); return run(() => supabase.from('sections').delete().eq('id', sid)); },
    moveSection: (sid: string, dir: -1 | 1) => {
      const cur = dRef.current; if (!cur) return;
      const list = [...cur.sections]; const i = list.findIndex(s => s.id === sid); const j = i + dir; if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      set(x => ({ ...x, sections: list.map((s, k) => ({ ...s, pos: k })) }));
      return Promise.all([run(() => supabase.from('sections').update({ pos: j }).eq('id', list[j].id)), run(() => supabase.from('sections').update({ pos: i }).eq('id', list[i].id))]);
    },
    addLine: (l: Line) => { set(x => ({ ...x, lines: [...x.lines, l] })); return run(() => supabase.from('lines').insert(l)); },
    deleteLine: (lid: string) => { set(x => ({ ...x, lines: x.lines.filter(l => l.id !== lid && l.of_line !== lid), costs: x.costs.filter(c => c.line_id !== lid) })); return run(() => supabase.from('lines').delete().eq('id', lid)); },
    addCost: (l: Line) => {
      const c: Cost = { id: newId('c'), job_id: id, line_id: l.id, section_id: l.section_id, type: l.type, pos: Date.now(), name: '', qty: null, rate: null, amount: 0, date: new Date().toISOString().slice(0, 10) };
      set(x => ({ ...x, costs: [...x.costs, c] })); return run(() => supabase.from('costs').insert(c));
    },
    deleteCost: (cid: string) => { set(x => ({ ...x, costs: x.costs.filter(c => c.id !== cid) })); return run(() => supabase.from('costs').delete().eq('id', cid)); },

    addPhase: async (sec: Section) => {
      const cur = dRef.current!; const existing = cur.phases.filter(p => p.section_id === sec.id);
      const ph: Phase = { id: newId('p'), section_id: sec.id, job_id: id, name: `Phase ${existing.length + 2}`, pos: existing.length };
      const originals = cur.lines.filter(l => l.section_id === sec.id && l.kind === 'item' && !l.phase_id);
      const copies = originals.map(o => blankLine({ job_id: id, section_id: sec.id, name: o.name, type: o.type, role: o.role, pos: o.pos, phase_id: ph.id, of_line: o.id, mk: o.mk, unit: o.unit, act_rate: o.bud_rate ?? o.eff_rate ?? o.est_rate }));
      set(x => ({ ...x, phases: [...x.phases, ph], lines: [...x.lines, ...copies] }));
      await run(() => supabase.from('phases').insert(ph));
      if (copies.length) await run(() => supabase.from('lines').insert(copies));
    },
    removePhase: (ph: Phase) => { set(x => ({ ...x, phases: x.phases.filter(p => p.id !== ph.id), lines: x.lines.filter(l => l.phase_id !== ph.id) })); return run(() => supabase.from('phases').delete().eq('id', ph.id)); },

    openCO: () => { const co: ChangeOrder = { id: newId('co'), job_id: id, opened_at: new Date().toISOString(), issued: null, type: null, price: 0, note: null }; set(x => ({ ...x, cos: [...x.cos, co] })); return run(() => supabase.from('change_orders').insert(co)); },
    deleteCO: (cid: string) => { set(x => ({ ...x, cos: x.cos.filter(c => c.id !== cid), sections: x.sections.filter(s => s.co_id !== cid), lines: x.lines.filter(l => l.co_id !== cid) })); return run(() => supabase.from('change_orders').delete().eq('id', cid)); },

    startProject: async (pin: string, contract: number) => { const { error } = await supabase.rpc('start_project', { p_job: id, p_pin: pin, p_contract: contract }); if (error) throw new Error(error.message); await load(); },
    reopen: async (pin: string) => { const { error } = await supabase.rpc('reopen_estimate', { p_job: id, p_pin: pin }); if (error) throw new Error(error.message); await load(); },
    deleteJob: () => run(() => supabase.from('jobs').delete().eq('id', id)),
    reload: load,
  };
  return { d, calc, status, api };
}
