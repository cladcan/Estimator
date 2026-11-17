'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, slug } from '@/lib/calc';
import { LINE_TYPES, SCOPES, type Lead } from '@/lib/types';
import { useApp } from '@/components/AuthGate';
import { exportAll, importFile } from '@/lib/transfer';

type Row = { id: string; ref: string | null; name: string; client: string | null; estimate_no: string | null; scope: string; started: string | null; quoted: number; budget: number; actual: number; contract_total: number };
type Cat = { type: string; budget: number; actual: number };

export default function Home() {
  const { canEdit, isOwner } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [tab, setTab] = useState<'all' | 'est' | 'proj'>('all');
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [{ data: r, error }, { data: c }] = await Promise.all([supabase.from('job_totals').select('*'), supabase.from('category_totals').select('*')]);
    if (error) setMsg(error.message);
    setRows(r || []); setCats(c || []);
  };
  useEffect(() => { load(); }, []);

  const all = rows || [];
  const started = all.filter(r => r.started);
  const tiles = [
    ['Estimates open', String(all.length - started.length)],
    ['Projects running', String(started.length)],
    ['Project budget (cost)', money(started.reduce((a, r) => a + Number(r.budget), 0), 0)],
    ['Actual cost to date', money(started.reduce((a, r) => a + Number(r.actual), 0), 0)],
    ['Open quotes (price)', money(all.filter(r => !r.started).reduce((a, r) => a + Number(r.quoted), 0), 0)],
    ['Project margin to date', money(started.reduce((a, r) => a + Number(r.contract_total) - Number(r.actual), 0), 0)],
  ];
  const catMap = new Map(cats.map(c => [LINE_TYPES.includes(c.type as never) ? c.type : 'Other', c]));
  const shown = useMemo(() => [...all].filter(r => tab === 'all' || (tab === 'proj') === !!r.started)
    .sort((a, b) => (a.started ? 0 : 1) - (b.started ? 0 : 1) || a.name.localeCompare(b.name)), [all, tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-auto">CladCan Estimating Hub</h1>
        <span className="text-sm text-green-700">{msg}</span>
        <button className="btn" onClick={async () => { setMsg('Exporting…'); try { await exportAll(); setMsg(''); } catch (e) { setMsg(String(e)); } }}>Export all data</button>
        {isOwner && <label className="btn cursor-pointer">Import data<input type="file" accept=".json" className="hidden" onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return; if (!confirm(`Import ${f.name}? Records with the same id are replaced; nothing is deleted.`)) return;
          try { setMsg('Importing…'); setMsg(await importFile(f, setMsg)); load(); } catch (err) { setMsg('Import failed: ' + (err as Error).message); }
        }} /></label>}
        <Link className="btn" href="/catalogue">Catalogue</Link>
        {canEdit && <button className="btn-primary" onClick={() => setShowNew(true)}>+ New estimate</button>}
      </div>

      {rows && rows.length === 0 && isOwner && <div className="card bg-amber-50 text-sm">The database is empty. Use <b>Import data</b> to load an export from the old hub, or start a new estimate.</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map(([l, v]) => <div key={l} className="card"><div className="text-xs text-gray-500">{l}</div><div className="text-xl font-semibold">{v}</div></div>)}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2 text-sm">Project cost by category</h2>
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-2">
          {LINE_TYPES.map(t => { const c = catMap.get(t); const b = Number(c?.budget || 0), a = Number(c?.actual || 0); const pct = b ? a / b * 100 : a ? 100 : 0; return (
            <div key={t} className="text-sm"><div className="flex justify-between"><span>{t}</span><span className="text-gray-600">{money(a, 0)} of {money(b, 0)}</span></div>
              <div className="h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div></div>); })}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="flex gap-1 p-2 border-b">
          {([['all', 'All'], ['est', 'Estimates'], ['proj', 'Projects']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'bg-slate-900! text-white' : ''}`}>{l}</button>)}
        </div>
        <table className="w-full">
          <thead className="border-b"><tr><th className="th">Job</th><th className="th">Stage</th><th className="th text-right">Price</th><th className="th text-right">Budget</th><th className="th text-right">Actual</th><th className="th w-40">Spent</th><th className="th text-right">Left</th></tr></thead>
          <tbody>
            {shown.map(r => { const b = Number(r.budget), a = Number(r.actual), pct = b ? a / b * 100 : 0; return (
              <tr key={r.id} tabIndex={0} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/jobs/${r.id}`)} onKeyDown={e => e.key === 'Enter' && router.push(`/jobs/${r.id}`)}>
                <td className="td py-2"><div className="font-medium">{r.name}</div><div className="text-xs text-gray-500">{[r.client, r.ref, r.estimate_no && `Wave #${r.estimate_no}`, SCOPES.find(s => s.id === r.scope)?.label].filter(Boolean).join(' · ')}</div></td>
                <td className="td"><span className={`pill ${r.started ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{r.started ? 'Project' : 'Estimate'}</span></td>
                <td className="td text-right">{money(r.started ? Number(r.contract_total) : Number(r.quoted), 0)}</td>
                <td className="td text-right">{money(b, 0)}</td>
                <td className="td text-right">{r.started ? money(a, 0) : '—'}</td>
                <td className="td">{r.started && <div className="flex items-center gap-2"><div className="flex-1 h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-xs w-10 text-right">{pct.toFixed(0)}%</span></div>}</td>
                <td className={`td text-right ${b - a < 0 ? 'text-red-600' : ''}`}>{r.started ? (b - a < 0 ? `${money(a - b, 0)} over` : money(b - a, 0)) : ''}</td>
              </tr>); })}
            {rows && !shown.length && <tr><td className="td p-6 text-gray-500" colSpan={7}>No jobs here yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewEstimate onClose={() => setShowNew(false)} onCreated={id => router.push(`/jobs/${id}`)} />}
    </div>
  );
}

const PHASE_ORDER = ['active', 'won', 'parked', 'lost'];
function NewEstimate({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { settings } = useApp();
  const [leads, setLeads] = useState<Lead[]>([]); const [q, setQ] = useState(''); const [lead, setLead] = useState<Lead | null>(null);
  const [f, setF] = useState({ name: '', client: '', estimate_no: '', scope: 'supply_install' });
  const [err, setErr] = useState(''); const [syncing, setSyncing] = useState(false);
  const loadLeads = async () => setLeads((await supabase.from('leads').select('*')).data || []);
  const sync = async () => {
    setSyncing(true); setErr('');
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch('/api/monday', { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
    if (!r.ok) setErr((await r.json().catch(() => ({ error: r.statusText }))).error); else await loadLeads();
    setSyncing(false);
  };
  useEffect(() => { loadLeads(); }, []);
  const rank = (p: string | null) => { const i = PHASE_ORDER.findIndex(k => (p || '').toLowerCase().includes(k)); return i < 0 ? 0 : i; };
  const list = leads.filter(l => [l.name, l.client, l.phase].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank(a.phase) - rank(b.phase) || (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 40);
  const pick = (l: Lead) => { setLead(l); setF({ ...f, name: (l.name || '').replace(/^\d+\s*-\s*/, '').replace(/[\s,-]+(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)$/i, '').trim(), client: l.client || '' }); };

  const create = async () => {
    if (!f.name.trim()) return setErr('Job name is required');
    const { data: ref, error: e1 } = await supabase.rpc('next_job_ref'); if (e1) return setErr(e1.message);
    const id = `${slug(f.name)}-${Date.now().toString(36).slice(-4)}`;
    const { error } = await supabase.from('jobs').insert({
      id, ref, name: f.name.trim(), client: f.client || null, estimate_no: f.estimate_no || null, scope: f.scope,
      monday_id: lead?.id || null, monday_url: lead?.url || null, monday_contact_id: lead?.contact_id || null, drive: lead?.drive || null,
      pr: { m: settings.markup_pct, t: settings.contingency_pct, c: settings.commission_pct, cm: 'pct', d: null, dm: 'pct', sf: null, x: [] },
    });
    if (error) return setErr(error.message);
    onCreated(id);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5 space-y-3 mt-10" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">New estimate</h2>
        <div className="flex gap-2"><input className="input" placeholder="Search monday leads by name, client or phase" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Refreshing…' : '↻ Refresh'}</button></div>
        <div className="max-h-48 overflow-y-auto border rounded divide-y">
          {list.map(l => <button key={l.id} onClick={() => pick(l)} className={`block w-full text-left px-2 py-1 text-sm hover:bg-slate-50 ${lead?.id === l.id ? 'bg-blue-50' : ''}`}>
            <span className="font-medium">{l.name}</span> <span className="text-gray-500">· {l.client} · {l.phase}</span></button>)}
          {!list.length && <div className="p-2 text-sm text-gray-500">No leads loaded. Refresh to pull the monday Jobs board, or type the details below.</div>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Job name *<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-sm">Client<input className="input" value={f.client} onChange={e => setF({ ...f, client: e.target.value })} /></label>
          <label className="text-sm">Wave estimate #<input className="input" value={f.estimate_no} onChange={e => setF({ ...f, estimate_no: e.target.value })} /></label>
          <label className="text-sm">Scope<select className="input" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}>{SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={create}>Create estimate</button></div>
      </div>
    </div>
  );
}
