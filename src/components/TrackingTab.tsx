'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/pricing';
import type { Job, SectionType } from '@/lib/types';

type Actual = { id: string; section_type_id: string | null; phase_id: string | null; date: string; vendor: string; description: string; amount: number };
type Phase = { id: string; name: string; start_date: string | null; end_date: string | null; pct_complete: number; sort: number };
type CO = { id: string; number: number; description: string; cost: number; price: number; status: 'pending' | 'approved' | 'rejected' };

export default function TrackingTab({ job, tab, types }: { job: Job; tab: string; types: SectionType[] }) {
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [cos, setCos] = useState<CO[]>([]);
  const load = useCallback(async () => {
    setActuals((await supabase.from('actual_costs').select('*').eq('job_id', job.id).order('date')).data || []);
    setPhases((await supabase.from('phases').select('*').eq('job_id', job.id).order('sort')).data || []);
    setCos((await supabase.from('change_orders').select('*').eq('job_id', job.id).order('number')).data || []);
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  const upd = (table: string, id: string, p: object) => supabase.from(table).update(p).eq('id', id).then(load);
  const del = (table: string, id: string) => supabase.from(table).delete().eq('id', id).then(load);
  const typeName = (id: string | null) => types.find(t => t.id === id)?.name || 'Unassigned';

  if (tab === 'Budget vs actual') {
    const b = job.budget_snapshot;
    if (!b) return <div className="card text-gray-500">Start the project to lock a budget.</div>;
    const approved = cos.filter(c => c.status === 'approved');
    const coCost = approved.reduce((a, c) => a + Number(c.cost), 0), coPrice = approved.reduce((a, c) => a + Number(c.price), 0);
    const budgetByType = new Map<string, number>();
    b.bySection.forEach(s => budgetByType.set(s.section_type_id || '', (budgetByType.get(s.section_type_id || '') || 0) + s.total));
    const actualByType = new Map<string, number>();
    actuals.forEach(a => actualByType.set(a.section_type_id || '', (actualByType.get(a.section_type_id || '') || 0) + Number(a.amount)));
    const keys = [...new Set([...budgetByType.keys(), ...actualByType.keys()])];
    const totalActual = actuals.reduce((a, x) => a + Number(x.amount), 0);
    const revised = b.cost + coCost;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[['Contract', b.quoted + coPrice], ['Budget cost', b.cost], ['Change orders (cost)', coCost], ['Actual to date', totalActual], ['Remaining', revised - totalActual]].map(([l, v]) => (
            <div key={l as string} className="card"><div className="text-xs text-gray-500">{l}</div><div className={`text-lg font-semibold ${(v as number) < 0 ? 'text-red-600' : ''}`}>{money(v as number)}</div></div>
          ))}
        </div>
        <div className="card overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Category</th><th className="th text-right">Budget</th><th className="th text-right">Actual</th><th className="th text-right">Variance</th><th className="th text-right">Used</th></tr></thead>
          <tbody>{keys.map(k => { const bud = budgetByType.get(k) || 0, act = actualByType.get(k) || 0; return (
            <tr key={k} className="border-t"><td className="td">{typeName(k || null)}</td><td className="td text-right">{money(bud)}</td><td className="td text-right">{money(act)}</td>
              <td className={`td text-right ${bud - act < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(bud - act)}</td><td className="td text-right">{bud ? (act / bud * 100).toFixed(0) + '%' : '—'}</td></tr>); })}</tbody>
        </table></div>
        <div className="card space-y-2 overflow-x-auto">
          <h3 className="font-semibold">Actual costs</h3>
          <table className="w-full"><thead><tr><th className="th">Date</th><th className="th">Category</th><th className="th">Phase</th><th className="th">Vendor</th><th className="th">Description</th><th className="th">Amount</th><th></th></tr></thead>
            <tbody>{actuals.map(a => (
              <tr key={a.id} className="border-t">
                <td className="td"><input className="input" type="date" defaultValue={a.date} onBlur={e => upd('actual_costs', a.id, { date: e.target.value })} /></td>
                <td className="td"><select className="input" defaultValue={a.section_type_id || ''} onChange={e => upd('actual_costs', a.id, { section_type_id: e.target.value || null })}><option value="">Unassigned</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                <td className="td"><select className="input" defaultValue={a.phase_id || ''} onChange={e => upd('actual_costs', a.id, { phase_id: e.target.value || null })}><option value="">—</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td className="td"><input className="input" defaultValue={a.vendor || ''} onBlur={e => upd('actual_costs', a.id, { vendor: e.target.value })} /></td>
                <td className="td"><input className="input" defaultValue={a.description || ''} onBlur={e => upd('actual_costs', a.id, { description: e.target.value })} /></td>
                <td className="td w-32"><input className="input" type="number" step="any" defaultValue={a.amount} onBlur={e => upd('actual_costs', a.id, { amount: Number(e.target.value) })} /></td>
                <td className="td"><button className="text-red-600" onClick={() => del('actual_costs', a.id)}>×</button></td>
              </tr>))}</tbody></table>
          <button className="btn" onClick={() => supabase.from('actual_costs').insert({ job_id: job.id }).then(load)}>Add cost</button>
        </div>
      </div>
    );
  }

  if (tab === 'Phases') return (
    <div className="card space-y-2 overflow-x-auto">
      <table className="w-full"><thead><tr><th className="th">Phase</th><th className="th">Start</th><th className="th">End</th><th className="th">% complete</th><th className="th text-right">Spent</th><th></th></tr></thead>
        <tbody>{phases.map(p => (
          <tr key={p.id} className="border-t">
            <td className="td"><input className="input" defaultValue={p.name} onBlur={e => upd('phases', p.id, { name: e.target.value })} /></td>
            <td className="td"><input className="input" type="date" defaultValue={p.start_date || ''} onBlur={e => upd('phases', p.id, { start_date: e.target.value || null })} /></td>
            <td className="td"><input className="input" type="date" defaultValue={p.end_date || ''} onBlur={e => upd('phases', p.id, { end_date: e.target.value || null })} /></td>
            <td className="td w-40"><div className="flex items-center gap-2"><input className="input w-20" type="number" min={0} max={100} defaultValue={p.pct_complete} onBlur={e => upd('phases', p.id, { pct_complete: Number(e.target.value) })} />
              <div className="flex-1 h-2 bg-gray-200 rounded"><div className="h-2 bg-blue-600 rounded" style={{ width: `${Math.min(100, p.pct_complete)}%` }} /></div></div></td>
            <td className="td text-right">{money(actuals.filter(a => a.phase_id === p.id).reduce((x, a) => x + Number(a.amount), 0))}</td>
            <td className="td"><button className="text-red-600" onClick={() => del('phases', p.id)}>×</button></td>
          </tr>))}</tbody></table>
      <button className="btn" onClick={async () => { const name = prompt('Phase name'); if (name) supabase.from('phases').insert({ job_id: job.id, name, sort: phases.length }).then(load); }}>Add phase</button>
    </div>
  );

  return (
    <div className="card space-y-2 overflow-x-auto">
      <table className="w-full"><thead><tr><th className="th">CO #</th><th className="th">Description</th><th className="th">Cost</th><th className="th">Price</th><th className="th">Status</th><th></th></tr></thead>
        <tbody>{cos.map(c => (
          <tr key={c.id} className="border-t">
            <td className="td w-16">{c.number}</td>
            <td className="td"><input className="input" defaultValue={c.description} onBlur={e => upd('change_orders', c.id, { description: e.target.value })} /></td>
            <td className="td w-32"><input className="input" type="number" step="any" defaultValue={c.cost} onBlur={e => upd('change_orders', c.id, { cost: Number(e.target.value) })} /></td>
            <td className="td w-32"><input className="input" type="number" step="any" defaultValue={c.price} onBlur={e => upd('change_orders', c.id, { price: Number(e.target.value) })} /></td>
            <td className="td"><select className="input" defaultValue={c.status} onChange={e => upd('change_orders', c.id, { status: e.target.value })}>{['pending', 'approved', 'rejected'].map(s => <option key={s}>{s}</option>)}</select></td>
            <td className="td"><button className="text-red-600" onClick={() => del('change_orders', c.id)}>×</button></td>
          </tr>))}</tbody></table>
      <button className="btn" onClick={() => supabase.from('change_orders').insert({ job_id: job.id, number: (cos.at(-1)?.number || 0) + 1, description: 'New change order' }).then(load)}>Add change order</button>
    </div>
  );
}
