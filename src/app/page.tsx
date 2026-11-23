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

const DAY = 86400000;
const pctStr = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '–');

export default function Home() {
  const { can, isOwner } = useApp(); const canEdit = can('jobs', 'edit');
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [dates, setDates] = useState<Map<string, { created: string | null; updated: string | null }>>(new Map());
  const [tab, setTab] = useState<'all' | 'est' | 'proj'>('all');
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Row[] | null>(null);
  const [toRename, setToRename] = useState<Row | null>(null);

  const load = async () => {
    const [{ data: r, error }, { data: c }, { data: d }] = await Promise.all([
      supabase.from('job_totals').select('*'), supabase.from('category_totals').select('*'), supabase.from('jobs').select('id, created_at, updated_at')]);
    if (error) setMsg(error.message);
    setRows(r || []); setCats(c || []);
    setDates(new Map((d || []).map(x => [x.id as string, { created: x.created_at as string | null, updated: x.updated_at as string | null }])));
  };
  useEffect(() => { load(); }, []);

  const all = useMemo(() => rows || [], [rows]);
  const snap = useMemo(() => snapshot(all, dates), [all, dates]);
  const catMap = new Map(cats.map(c => [LINE_TYPES.includes(c.type as never) ? c.type : 'Other', c]));
  const shown = useMemo(() => [...all].filter(r => tab === 'all' || (tab === 'proj') === !!r.started)
    .sort((a, b) => (a.started ? 0 : 1) - (b.started ? 0 : 1) || a.name.localeCompare(b.name)), [all, tab]);
  const pickable = shown.filter(r => !r.started);
  const pickedRows = all.filter(r => picked.has(r.id) && !r.started);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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

      <Snapshot s={snap} />

      <div className="card">
        <h2 className="label mb-2">Project cost by category</h2>
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-2">
          {LINE_TYPES.map(t => { const c = catMap.get(t); const b = Number(c?.budget || 0), a = Number(c?.actual || 0); const pct = b ? a / b * 100 : a ? 100 : 0; return (
            <div key={t} className="text-sm"><div className="flex justify-between"><span>{t}</span><span className="text-gray-600">{money(a, 0)} of {money(b, 0)}</span></div>
              <div className="h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div></div>); })}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b">
          {([['all', `All (${all.length})`], ['est', `Estimates (${snap.estCount})`], ['proj', `Projects (${snap.projCount})`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'bg-slate-900! text-white' : ''}`}>{l}</button>)}
          {canEdit && pickedRows.length > 0 && <>
            <span className="ml-auto text-sm text-gray-600">{pickedRows.length} selected</span>
            <button className="btn" onClick={() => setPicked(new Set())}>Clear</button>
            <button className="btn text-red-700!" onClick={() => setToDelete(pickedRows)}>Delete selected…</button>
          </>}
        </div>
        <table className="w-full">
          <thead className="border-b"><tr>
            {canEdit && <th className="th w-8">{pickable.length > 0 && <input type="checkbox" aria-label="Select all estimates" checked={pickable.every(r => picked.has(r.id))} onChange={e => setPicked(e.target.checked ? new Set(pickable.map(r => r.id)) : new Set())} />}</th>}
            <th className="th">Job</th><th className="th">Stage</th><th className="th text-right">Price</th><th className="th text-right">Budget</th><th className="th text-right">Actual</th><th className="th w-40">Spent</th><th className="th text-right">Left</th>{canEdit && <th className="th w-32" />}
          </tr></thead>
          <tbody>
            {shown.map(r => { const b = Number(r.budget), a = Number(r.actual), pct = b ? a / b * 100 : 0; return (
              <tr key={r.id} tabIndex={0} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/jobs/${r.id}`)} onKeyDown={e => e.key === 'Enter' && router.push(`/jobs/${r.id}`)}>
                {canEdit && <td className="td" onClick={e => e.stopPropagation()}>{!r.started && <input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />}</td>}
                <td className="td py-2"><div className="font-medium">{r.name}</div><div className="text-xs text-gray-500">{[r.client, r.ref, r.estimate_no && `Wave #${r.estimate_no}`, SCOPES.find(s => s.id === r.scope)?.label].filter(Boolean).join(' · ')}</div></td>
                <td className="td"><span className={`pill ${r.started ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{r.started ? 'Project' : 'Estimate'}</span></td>
                <td className="td text-right">{money(r.started ? Number(r.contract_total) : Number(r.quoted), 0)}</td>
                <td className="td text-right">{money(b, 0)}</td>
                <td className="td text-right">{r.started ? money(a, 0) : '—'}</td>
                <td className="td">{r.started && <div className="flex items-center gap-2"><div className="flex-1 h-2 bg-gray-200 rounded"><div className={`h-2 rounded ${pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-xs w-10 text-right">{pct.toFixed(0)}%</span></div>}</td>
                <td className={`td text-right ${b - a < 0 ? 'text-red-600' : ''}`}>{r.started ? (b - a < 0 ? `${money(a - b, 0)} over` : money(b - a, 0)) : ''}</td>
                {canEdit && <td className="td text-right whitespace-nowrap space-x-1" onClick={e => e.stopPropagation()}>
                  <button className="btn-sm" title={`Rename ${r.name}`} aria-label={`Rename ${r.name}`} onClick={() => setToRename(r)}>Rename</button>
                  {!r.started && <button className="btn-sm text-red-700" title={`Delete ${r.name}`} aria-label={`Delete ${r.name}`} onClick={() => setToDelete([r])}>Delete</button>}</td>}
              </tr>); })}
            {rows && !shown.length && <tr><td className="td p-6 text-gray-500" colSpan={9}>No jobs here yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewEstimate onClose={() => setShowNew(false)} onCreated={id => router.push(`/jobs/${id}`)} />}
      {toRename && <RenameJob row={toRename} onClose={() => setToRename(null)} onDone={name => { setRows(rs => rs && rs.map(x => x.id === toRename.id ? { ...x, name } : x)); setToRename(null); }} />}
      {toDelete && <DeleteEstimates rows={toDelete} onClose={() => setToDelete(null)} onDone={() => { setToDelete(null); setPicked(new Set()); load(); }} />}
    </div>
  );
}

type Snap = ReturnType<typeof snapshot>;
function snapshot(all: Row[], dates: Map<string, { created: string | null; updated: string | null }>) {
  const now = Date.now(); const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const est = all.filter(r => !r.started), proj = all.filter(r => r.started);
  const sum = (rs: Row[], f: (r: Row) => number) => rs.reduce((a, r) => a + (Number(f(r)) || 0), 0);
  const contract = sum(proj, r => r.contract_total), budget = sum(proj, r => r.budget), actual = sum(proj, r => r.actual);
  // Profit only counts projects that have a contract price; a $0 contract would show its whole budget as a loss.
  const priced = proj.filter(r => Number(r.contract_total) > 0), unpriced = proj.length - priced.length;
  const pContract = sum(priced, r => r.contract_total), pBudget = sum(priced, r => r.budget);
  const quotedOpen = sum(est, r => r.quoted);
  const stale = est.filter(r => { const u = dates.get(r.id)?.updated; return u ? now - +new Date(u) > 30 * DAY : false; });
  const over = proj.filter(r => Number(r.budget) > 0 && Number(r.actual) > Number(r.budget));
  const inMonth = (d: string | null | undefined) => !!d && +new Date(d) >= +monthStart;
  const earned = sum(proj, r => { const b = Number(r.budget); return b > 0 ? Number(r.contract_total) * Math.min(1, Number(r.actual) / b) : 0; });
  return {
    estCount: est.length, projCount: proj.length, quotedOpen, avgQuote: est.length ? quotedOpen / est.length : 0, staleCount: stale.length,
    winRate: all.length ? proj.length / all.length * 100 : NaN,
    contract, budget, actual, left: budget - actual, spentPct: budget ? actual / budget * 100 : NaN,
    profit: pContract - pBudget, marginPct: pContract ? (pContract - pBudget) / pContract * 100 : NaN, unpriced, avgProject: proj.length ? contract / proj.length : 0,
    earned, overCount: over.length,
    newEst: all.filter(r => inMonth(dates.get(r.id)?.created)).length, startedMonth: proj.filter(r => inMonth(r.started)).length,
    wonMonth: sum(proj.filter(r => inMonth(r.started)), r => r.contract_total),
  };
}

function Snapshot({ s }: { s: Snap }) {
  const month = new Date().toLocaleString('en-CA', { month: 'long' });
  const groups: { title: string; tiles: { l: string; v: string; sub?: string; tone?: 'bad' | 'ok' }[] }[] = [
    { title: 'Sales pipeline', tiles: [
      { l: 'Estimates waiting', v: String(s.estCount), sub: s.staleCount ? `${s.staleCount} untouched for 30+ days` : 'all touched in the last 30 days', tone: s.staleCount ? 'bad' : undefined },
      { l: 'Value of open quotes', v: money(s.quotedOpen, 0), sub: s.estCount ? `avg ${money(s.avgQuote, 0)} per estimate` : undefined },
      { l: 'Win rate', v: pctStr(s.winRate), sub: `${s.projCount} won of ${s.estCount + s.projCount} jobs` },
      { l: `New in ${month}`, v: String(s.newEst), sub: `${s.startedMonth} started · ${money(s.wonMonth, 0)} won` },
    ] },
    { title: 'What we are achieving', tiles: [
      { l: 'Projects running', v: String(s.projCount), sub: s.projCount ? `avg ${money(s.avgProject, 0)} contract` : undefined },
      { l: 'Contract value (won)', v: money(s.contract, 0), sub: 'including issued client change orders' },
      { l: 'Expected profit', v: money(s.profit, 0), sub: `${pctStr(s.marginPct)} margin on budget${s.unpriced ? ` · ${s.unpriced} project${s.unpriced > 1 ? 's' : ''} with no contract price left out` : ''}`, tone: s.profit < 0 ? 'bad' : 'ok' },
      { l: 'Earned to date', v: money(s.earned, 0), sub: 'contract × % of budget spent' },
    ] },
    { title: 'What we are spending', tiles: [
      { l: 'Project budget (cost)', v: money(s.budget, 0) },
      { l: 'Actual cost to date', v: money(s.actual, 0), sub: `${pctStr(s.spentPct)} of budget` },
      { l: 'Budget left', v: money(s.left, 0), tone: s.left < 0 ? 'bad' : undefined },
      { l: 'Projects over budget', v: String(s.overCount), tone: s.overCount ? 'bad' : 'ok' },
    ] },
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-3">
      {groups.map(g => (
        <div key={g.title} className="card space-y-2">
          <h2 className="label">{g.title}</h2>
          <div className="grid grid-cols-2 gap-2">
            {g.tiles.map(t => (
              <div key={t.l} className="rounded-md p-3" style={{ background: 'var(--sunk)' }}>
                <div className="text-xs text-gray-600">{t.l}</div>
                <div className={`text-xl font-semibold ${t.tone === 'bad' ? 'text-red-700' : t.tone === 'ok' ? 'text-green-700' : ''}`}>{t.v}</div>
                {t.sub && <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{t.sub}</div>}
              </div>))}
          </div>
        </div>))}
    </div>
  );
}

function RenameJob({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (name: string) => void }) {
  const { email } = useApp();
  const [name, setName] = useState(row.name); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const clean = name.trim();
  const go = async () => {
    if (!clean) return setErr('The name can\'t be empty');
    if (clean === row.name) return onClose();
    setBusy(true); setErr('');
    const { error } = await supabase.from('jobs').update({ name: clean, updated_at: new Date().toISOString(), updated_by: email || null }).eq('id', row.id);
    setBusy(false); if (error) return setErr(error.message);
    onDone(clean);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50" onClick={onClose}>
      <form className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3 mt-20" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); go(); }}>
        <h2 className="text-lg font-semibold">Rename {row.started ? 'project' : 'estimate'}</h2>
        <label className="text-sm block">Name<input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()} /></label>
        {row.ref && <p className="text-xs text-gray-500">The number {row.ref} stays the same.{row.started ? ' No PIN is needed: only the name changes, not the budget.' : ''}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !clean}>{busy ? 'Saving…' : 'Rename'}</button></div>
      </form>
    </div>
  );
}

function DeleteEstimates({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('jobs').delete().in('id', rows.map(r => r.id)).is('started', null);
    setBusy(false); if (error) return setErr(error.message);
    onDone();
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3 mt-20" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-red-700">Delete {rows.length === 1 ? 'estimate' : `${rows.length} estimates`}</h2>
        <ul className="text-sm list-disc pl-5 max-h-48 overflow-y-auto">{rows.map(r => <li key={r.id}>{r.name}{r.ref ? ` · ${r.ref}` : ''}</li>)}</ul>
        <p className="text-sm text-gray-600">This removes {rows.length === 1 ? 'it' : 'them'} with all sections and lines. It can&apos;t be undone. Started projects can&apos;t be deleted here.</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary bg-red-700! hover:bg-red-800!" disabled={busy} onClick={go}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div>
      </div>
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
