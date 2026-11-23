'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { coLabel, money, newId, r2, slug, taxRate } from '@/lib/calc';
import { unitPrice, ROLE_ORDER } from '@/lib/catalog';
import { INSTALL_KINDS, SCOPES, type CatalogItem, type LibItem, type LibraryEntry, type Line, type Section } from '@/lib/types';
import { useApp } from '@/components/AuthGate';
import { useJob, blankLine } from '@/hooks/useJob';
import SectionCard from '@/components/job/SectionCard';
import PricingPanel from '@/components/job/PricingPanel';
import WavePanel from '@/components/job/WavePanel';
import InvoicesPanel from '@/components/job/InvoicesPanel';
import CatalogPicker from '@/components/job/CatalogPicker';
import LibraryMenu from '@/components/job/LibraryMenu';
import Link from 'next/link';
import TextInput from '@/components/TextInput';
import NumInput from '@/components/NumInput';
import type { JobView } from '@/components/job/types';

const blankSection = (p: Partial<Section> & Pick<Section, 'job_id' | 'name'>): Section => ({
  id: newId('s'), pos: 0, lib: null, preset: null, area: null, sheet_sqft: null, mk: null, fmk: null, fmkm: 'amt', fin: false, ctext: null, wgrp: null, tier: null,
  proj_only: false, proj_off: false, co_id: null, act_override: null, ...p,
});

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { settings: st, can, email } = useApp();
  const canEdit = can('jobs', 'edit'), canEditLib = can('library', 'edit');
  const { d, calc, status, api } = useJob(id, st);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [viewMode, setViewMode] = useState<'estimation' | 'project' | null>(null);
  const [taxIn, setTaxIn] = useState(false);
  const [picker, setPicker] = useState<null | { kind: 'add' } | { kind: 'finish'; sec: Section }>(null);
  const [modal, setModal] = useState<null | 'start' | 'reopen' | 'delete' | 'issue'>(null);
  const [foldCmd, setFoldCmd] = useState({ n: 0, fold: false });
  const [onlyLeft, setOnlyLeft] = useState(false);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const loadLib = () => supabase.from('library').select('*').order('pos').then(({ data }) => setLibrary(data || []));
  useEffect(() => { loadLib(); }, []);

  const mode = viewMode ?? (d?.job.started ? 'project' : 'estimation');
  const taxKey = `taxin:${email}:${mode}`;
  useEffect(() => { try { setTaxIn(localStorage.getItem(taxKey) === '1'); } catch {} }, [taxKey]);
  const flash = (msg: string, undo?: () => void) => { setToast({ msg, undo }); setTimeout(() => setToast(t => (t?.msg === msg ? null : t)), 8000); };

  const openCO = useMemo(() => d?.cos.find(c => !c.issued) || null, [d]);
  if (status.error && !d) return <div className="card text-red-600">Couldn&apos;t load this job: {status.error}</div>;
  if (!d || !calc) return <div className="text-gray-500">Loading…</div>;
  const { job } = d;
  const started = !!job.started;
  const editable = canEdit && !status.offline;
  const rate = taxRate(job, st);
  const tx = (val: number) => (taxIn ? val * (1 + rate) : val);
  const hideInstall = ['supply', 'design', 'design_supply'].includes(job.scope);

  // ───── add sections ─────
  const placeAfterSameKind = (lib: string | null, newIds: string[]) => {
    const ids = d.sections.map(s => s.id);
    const lastSame = [...d.sections].reverse().find(s => lib && s.lib === lib);
    const at = lastSame ? ids.indexOf(lastSame.id) + 1 : ids.length;
    ids.splice(at, 0, ...newIds); return ids;
  };
  const sectionFlags = () => (started ? { proj_only: !openCO, co_id: openCO?.id || null } : {});
  const linesFrom = (sec: Section, items: LibItem[]): Line[] => items.map((it, i) => blankLine({
    job_id: job.id, section_id: sec.id, pos: i + 1, name: it.name, type: it.type || 'Material', role: it.role || null, est_rate: it.rate ?? null, est_qty: it.qty ?? null, unit: it.unit || null,
    ...(started ? { proj_only: !openCO, co_id: openCO?.id || null, act_rate: it.rate ?? null } : {}),
  }));
  const addFromLibrary = async (e: LibraryEntry, presetId?: string) => {
    const preset = e.presets?.find(p => p.id === presetId);
    const same = d.sections.filter(s => s.lib === e.id).length;
    const sec = blankSection({ job_id: job.id, name: same ? `${preset?.name || e.name} ${same + 1}` : preset?.name || e.name, lib: e.id, preset: preset?.id || null,
      sheet_sqft: preset?.sheetSqft ?? e.sheet_sqft, ctext: preset?.ctext ?? e.ctext, mk: e.mk, ...sectionFlags() });
    await api.insertSections([sec], linesFrom(sec, preset?.items || e.items || []), placeAfterSameKind(e.id, [sec.id]));
  };
  const addNewOption = async (e: LibraryEntry, name: string) => {
    const preset = { id: newId('pre'), name: `${e.name} - ${name}`, items: e.items || [], sheetSqft: e.sheet_sqft, ctext: e.ctext };
    const presets = [...(e.presets || []), preset];
    const { error } = await supabase.from('library').update({ presets }).eq('id', e.id);
    if (error) return flash(error.message);
    setLibrary(l => l.map(x => (x.id === e.id ? { ...x, presets } : x)));
    await addFromLibrary({ ...e, presets }, preset.id);
  };
  const addBlank = async () => {
    const sec = blankSection({ job_id: job.id, name: 'New section', ...sectionFlags() });
    await api.insertSections([sec], [], placeAfterSameKind(null, [sec.id]));
  };
  const addFromCatalog = async (c: CatalogItem, tier: string, all: CatalogItem[]) => {
    setPicker(null);
    const t = c.tiers.find(x => x.tier === tier)!;
    const lib = (c.category || '').toLowerCase().replace(/[^a-z]+/g, '_') || null;
    const sec = blankSection({ job_id: job.id, name: `${c.name} (${tier})`, lib, tier, fin: st.finished_face_kinds.includes(lib || ''), ...sectionFlags() });
    const items: Partial<Line>[] = [{ name: c.name, type: 'Material', est_rate: unitPrice(c, t), unit: c.use_unit || c.sell_unit, cat_id: c.id, tier, rate_note: t.source || null }];
    const acc = (c.accessories || []).filter(a => !['tool', 'fee'].includes((a.role || '').toLowerCase()))
      .sort((a, b) => (ROLE_ORDER.indexOf(a.role || '') + 99) % 99 - (ROLE_ORDER.indexOf(b.role || '') + 99) % 99);
    for (const a of acc) {
      const ref = a.catId ? all.find(x => x.id === a.catId) : null;
      const refTier = ref?.tiers.find(x => x.tier === tier) || ref?.tiers[0];
      items.push({ name: ref?.name || a.name || 'Accessory', type: a.type || ((a.role || '').toLowerCase() === 'delivery' ? 'Delivery' : 'Material'),
        est_rate: ref && refTier ? unitPrice(ref, refTier) : a.rate ?? null, unit: ref?.use_unit || a.unit || null, cat_id: ref?.id || null, tier: refTier?.tier || null });
    }
    const hasDelivery = acc.some(a => (a.role || '').toLowerCase() === 'delivery');
    if (!hasDelivery) {
      const sameSupplier = c.supplier ? d.lines.find(l => l.cat_id && l.cat_id !== c.id && all.find(x => x.id === l.cat_id)?.supplier === c.supplier) : null;
      items.push(sameSupplier ? { name: `Delivery · with ${sameSupplier.name}`, type: 'Delivery', unit: 'lot', est_qty: 1, est_rate: 0 } : { name: 'Shipping / Delivery', type: 'Delivery', unit: 'lot', est_qty: 1 });
    }
    const lines = items.map((it, i) => blankLine({ job_id: job.id, section_id: sec.id, pos: i + 1, ...it, ...(started ? { proj_only: !openCO, co_id: openCO?.id || null } : {}) }));
    await api.insertSections([sec], lines, placeAfterSameKind(lib, [sec.id]));
  };
  const changeFinish = async (sec: Section, c: CatalogItem, tier: string, all: CatalogItem[]) => {
    setPicker(null);
    for (const l of d.lines.filter(x => x.section_id === sec.id && x.cat_id)) {
      const item = all.find(x => x.id === l.cat_id); const t = item?.tiers.find(x => x.tier === tier); if (!item || !t) continue;
      await api.patchLine(l.id, { est_rate: unitPrice(item, t), tier, rate_note: t.source || null });
    }
    await api.patchSection(sec.id, { tier, name: `${sec.name.replace(/\s*\([^)]*\)\s*$/, '')} (${tier})` });
  };
  const saveAsLibrary = async (sec: Section) => {
    const name = prompt('Name for the new section button', sec.name.replace(/\s+\d+$/, '')); if (!name) return;
    const lid = slug(name) || newId('lib');
    const items: LibItem[] = d.lines.filter(l => l.section_id === sec.id && l.kind === 'item' && !l.phase_id).sort((a, b) => a.pos - b.pos)
      .map(l => ({ name: l.name, type: l.type, role: l.role, rate: l.est_rate, unit: l.unit }));
    const exists = library.find(e => e.id === lid);
    if (exists && !confirm(`Replace the existing "${exists.name}" button?`)) return;
    const row = { id: lid, name, pos: exists?.pos ?? library.length + 1, mk: sec.mk, items, sheet_sqft: sec.sheet_sqft, ctext: sec.ctext, presets: exists?.presets || [], wave_group: sec.wgrp };
    const { error } = await supabase.from('library').upsert(row); if (error) return flash(error.message);
    await loadLib();
    flash(`Saved "${name}" as a section button`, async () => { if (exists) await supabase.from('library').upsert(exists); else await supabase.from('library').delete().eq('id', lid); loadLib(); setToast(null); });
  };

  const libButtons = (sec: Section) => editable && !started ? <>
    {d.lines.some(l => l.section_id === sec.id && l.cat_id) && <button className="btn-sm" onClick={() => setPicker({ kind: 'finish', sec })}>Change finish</button>}
    {canEditLib && <button className="btn-sm" onClick={() => saveAsLibrary(sec)}>Save as a section button</button>}
  </> : null;

  const v: JobView = { d, calc, api, st, editable, mode, tx, openCO, libButtons, foldCmd, onlyLeft };
  const ticked = d.lines.filter(l => l.kind === 'todo' && l.done);
  const visibleLib = library.filter(e => !(hideInstall && INSTALL_KINDS.includes(e.id.toLowerCase())));
  const sections = [...d.sections].sort((a, b) => a.pos - b.pos).filter(s => mode === 'project' || (!s.proj_only && !s.co_id));
  const mondayPhase = started ? 'Won' : job.estimate_no ? 'Quotation / Proposal' : 'Estimation';

  const updateMonday = async () => {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch('/api/monday', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token}` }, body: JSON.stringify({ jobId: job.id }) });
    const j = await r.json().catch(() => ({})); flash(r.ok ? `monday updated: ${j.message || 'done'}` : `monday: ${j.error || r.statusText}`);
  };

  const saveState = status.offline ? { t: 'NOT CONNECTED · read-only copy', c: 'text-amber-800 border-amber-600' }
    : status.error ? { t: 'NOT SAVED · ' + status.error, c: 'text-red-700 border-red-600' }
    : status.pending ? { t: 'Saving…', c: 'text-gray-600 border-gray-400' } : { t: 'Saved to the database', c: 'text-green-800 border-green-700' };
  const scopeLabel = SCOPES.find(s => s.id === job.scope)?.label || '';
  const usedPct = calc.budget ? calc.actual / calc.budget * 100 : 0;
  const budgetNow = started ? calc.budget : calc.pr.P;
  const marginBase = started ? calc.contractTotal : calc.pr.Q;
  const tile = (label: string, val: number, color: string, sub?: string, extra = '') => (
    <div key={label} className={`tile ${extra}`}><div className="label">{label}</div><div className={`text-2xl font-semibold ${color}`}>{money(tx(val))}</div>{sub && <div className="text-sm text-[var(--muted)]">{sub}</div>}</div>
  );

  return (
    <div className="space-y-4">
      <Link href="/" className="text-[var(--accent)] text-sm">← All jobs</Link>
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <div className="label">Job checklist and cost tracker · {scopeLabel}</div>
          <JobName name={job.name} editable={editable} started={started} onRename={name => api.patchJob({ name })} />
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm">
            <span className="px-2 py-0.5 bg-[var(--sunk)] rounded display font-semibold">{job.ref}</span>
            <label className="flex items-center gap-2 text-[var(--ink2)]">Client<TextInput className="w-44" value={job.client} disabled={!editable} onChange={client => api.patchJob({ client })} /></label>
            <label className="flex items-center gap-2 text-[var(--ink2)]">Wave estimate #<TextInput className="w-32" value={job.estimate_no} disabled={!editable} onChange={estimate_no => api.patchJob({ estimate_no: estimate_no || null })} /></label>
            <label className="flex items-center gap-2 text-[var(--ink2)]">Scope<select className="input w-auto" disabled={!editable || started} value={job.scope} onChange={e => api.patchJob({ scope: e.target.value })}>{SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            {job.drive && <a className="text-[var(--accent)] underline" href={job.drive} target="_blank" rel="noreferrer">Drive ↗</a>}
            {editable && !started && <button className="btn" onClick={() => setModal('delete')}>Delete job…</button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-sm font-medium display ${saveState.c}`}>● {saveState.t}</span>
          <button className="btn" onClick={() => { const anyOpen = true; setFoldCmd(c => ({ n: c.n + 1, fold: !c.fold && anyOpen })); }}>{foldCmd.fold ? 'Open all sections' : 'Close all sections'}</button>
          <button className={`btn ${onlyLeft ? 'bg-[var(--sunk)]!' : ''}`} onClick={() => setOnlyLeft(!onlyLeft)}>{onlyLeft ? 'Show everything' : "Show only what's left"}</button>
          <button className="btn" disabled={!editable || !ticked.length} onClick={() => { if (confirm(`Untick all ${ticked.length} ticked items?`)) ticked.forEach(l => api.patchLine(l.id, { done: false })); }}>Clear all ticks</button>
        </div>
      </div>

      {/* Stage switch + tiles */}
      <div className="grid lg:grid-cols-[auto_1fr] gap-3 items-stretch">
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-[var(--sunk)] p-1">
            <button onClick={() => setViewMode('estimation')} className={`seg ${mode === 'estimation' ? 'seg-on' : ''}`}>Estimation</button>
            <button disabled={!started || !editable} title={started ? 'Price added or removed scope' : 'Start the project first'} onClick={async () => { if (!openCO) await api.openCO(); setViewMode('project'); }} className={`seg ${mode === 'project' && openCO ? 'seg-on' : ''}`}>Change order</button>
            <button disabled={!started} onClick={() => setViewMode('project')} className={`seg ${mode === 'project' && !openCO ? 'seg-on' : ''}`}>Project</button>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--ink2)]">
            <span>{!started ? 'Estimating · budget is open' : openCO ? `${coLabel(d.cos, openCO.id)} open · new lines go on it` : 'Project · budget is fixed'}</span>
            <button className="btn" onClick={() => { setTaxIn(!taxIn); try { localStorage.setItem(taxKey, !taxIn ? '1' : '0'); } catch {} }}>{taxIn ? `Tax in (${r2(rate * 100)}%)` : 'Before tax'}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && !started && <button className="btn border-green-700! text-green-800" onClick={() => setModal('start')}>Start the project…</button>}
            {editable && started && <button className="btn" onClick={() => setModal('reopen')}>Reopen estimate…</button>}
            {editable && openCO && <>
              <button className="btn-primary" onClick={() => setModal('issue')}>Issue {coLabel(d.cos, openCO.id)}…</button>
              <button className="btn text-red-700" onClick={() => confirm('Discard this open change order and everything on it?') && api.deleteCO(openCO.id)}>Discard</button>
            </>}
          </div>
          {started && <label className="flex items-center gap-2 text-sm text-[var(--ink2)]">Contract price<NumInput className="w-36" value={job.contract} disabled={!editable} onChange={v => api.patchJob({ contract: v ?? 0 })} />{!Number(job.contract) && <span className="text-[var(--bad)]">not set</span>}</label>}
          {started && <div className="text-xs text-[var(--muted)]">Started {new Date(job.started!).toLocaleDateString('en-CA')} by {job.started_by}{d.cos.some(c => c.issued) ? ' · ' + d.cos.filter(c => c.issued).map(c => `${coLabel(d.cos, c.id)} ${c.type}${c.type === 'client' ? ' ' + money(Number(c.price)) : ''}`).join(' · ') : ''}</div>}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {tile(started ? 'Budget · fixed' : 'Budget (estimated) · open', budgetNow, 'text-[var(--accent)]', '', 'bg-[#eef2f8]!')}
          {tile('Actual cost to date', calc.actual, 'text-[var(--warn)]', budgetNow ? `${(calc.actual / budgetNow * 100).toFixed(0)}% of the budget used` : '')}
          {tile('Difference (budget less actual)', budgetNow - calc.actual, budgetNow - calc.actual < 0 ? 'text-[var(--bad)]' : 'text-[var(--ok)]', calc.actual ? (usedPct > 100 ? 'over budget' : '') : 'no costs entered yet', 'bg-[#eef5ee]!')}
          {tile(started ? 'Contract · margin' : 'Margin on budget', marginBase - budgetNow, 'text-[var(--ok)]', marginBase ? `${((marginBase - budgetNow) / marginBase * 100).toFixed(0)}% margin${started ? ` · on actual ${money(tx(marginBase - calc.actual))}` : ''}` : '')}
        </div>
      </div>

      {/* Add a section */}
      {editable && (!started || mode === 'project') && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--sunk)] p-4 space-y-2">
          <div className="label">Add a section to this job{started ? (openCO ? ` · goes on ${coLabel(d.cos, openCO.id)}` : ' · not in budget') : ''}</div>
          <div className="flex flex-wrap gap-2">
            {visibleLib.map(e => <LibraryMenu key={e.id} e={e} onAdd={pid => addFromLibrary(e, pid)} onNewOption={canEditLib ? name => addNewOption(e, name) : undefined} />)}
            <button className="chip" onClick={() => setPicker({ kind: 'add' })}>+ From catalogue</button>
            <button className="chip border-dashed! text-[var(--ink2)]!" onClick={addBlank}>+ Blank section</button>
            <Link className="chip border-dashed! text-[var(--muted)]!" href="/library">Arrange / remove</Link>
          </div>
          <div className="text-sm text-[var(--ink2)]">Click one to open its options, then pick the one to add to the job. &quot;Standard&quot; adds the section with its usual items. Type a new option at the bottom of a menu to keep it for next time.</div>
        </div>
      )}

      <PricingPanel v={v} />
      <WavePanel v={v} library={library} />
      <InvoicesPanel jobId={job.id} costs={d.costs} lines={d.lines} editable={editable} />

      <div className="space-y-3">
        {sections.map((s, i) => <SectionCard key={s.id} v={v} sec={s} num={i + 1} />)}
        {!sections.length && <div className="card text-[var(--muted)] text-sm">No sections yet. Add one from the box above.</div>}
      </div>

      {toast && <div className="fixed bottom-2 right-2 text-sm bg-slate-900 text-white rounded px-3 py-2 shadow flex gap-3 z-50">{toast.msg}{toast.undo && <button className="underline" onClick={toast.undo}>Undo</button>}<button onClick={() => setToast(null)}>×</button></div>}

      {picker && <CatalogPicker title={picker.kind === 'finish' ? 'Pick the new finish (any product, the tier is what counts)' : 'Add from catalogue'}
        onClose={() => setPicker(null)} onPick={(c, tier, all) => picker.kind === 'finish' ? changeFinish(picker.sec, c, tier, all) : addFromCatalog(c, tier, all)} />}
      {modal && <Modal kind={modal} onClose={() => setModal(null)} job={job} quoted={calc.pr.Q} api={api} openCOId={openCO?.id} coName={openCO ? coLabel(d.cos, openCO.id) : ''} onDeleted={() => router.push('/')} />}
    </div>
  );
}

function JobName({ name, editable, started, onRename }: { name: string; editable: boolean; started: boolean; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false); const [t, setT] = useState(name);
  const save = () => { const n = t.trim(); if (n && n !== name) onRename(n); setEditing(false); };
  if (editing) return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); save(); }}>
      <input className="input display text-3xl font-semibold min-w-[20rem] max-w-2xl" aria-label="Job name" autoFocus value={t} onChange={e => setT(e.target.value)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }} />
      <button type="submit" className="btn-primary" disabled={!t.trim()}>Save</button>
      <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="display text-3xl font-semibold">{name}</h1>
      {editable && <button className="btn-sm" title={started ? 'Rename this project (no PIN needed: the budget stays locked)' : 'Rename this estimate'} onClick={() => { setT(name); setEditing(true); }}>Rename</button>}
    </div>
  );
}

function Modal({ kind, onClose, job, quoted, api, openCOId, coName, onDeleted }: { kind: 'start' | 'reopen' | 'delete' | 'issue'; onClose: () => void; job: { name: string }; quoted: number; api: ReturnType<typeof useJob>['api']; openCOId?: string; coName: string; onDeleted: () => void }) {
  const [pin, setPin] = useState(''); const [contract, setContract] = useState<number | null>(quoted); const [name, setName] = useState('');
  const [coType, setCoType] = useState<'client' | 'internal'>('client'); const [price, setPrice] = useState<number | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); onClose(); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        {kind === 'start' && <>
          <h2 className="text-lg font-semibold">Start project</h2>
          <p className="text-sm text-gray-600">This locks the estimate as the budget. Choose a PIN; you&apos;ll need it to reopen the estimate.</p>
          <label className="text-sm block">Contract value<NumInput value={contract} onChange={setContract} /></label>
          <label className="text-sm block">PIN<input className="input" type="password" value={pin} onChange={e => setPin(e.target.value)} /></label>
          <button className="btn-primary w-full" disabled={busy || pin.length < 4} onClick={() => go(() => api.startProject(pin, contract ?? quoted))}>Start project</button>
        </>}
        {kind === 'reopen' && <>
          <h2 className="text-lg font-semibold">Reopen estimate</h2>
          <p className="text-sm text-gray-600">Only possible while nothing has been entered on the project yet.</p>
          <label className="text-sm block">PIN<input className="input" type="password" value={pin} onChange={e => setPin(e.target.value)} /></label>
          <button className="btn-primary w-full" disabled={busy || !pin} onClick={() => go(() => api.reopen(pin))}>Reopen</button>
        </>}
        {kind === 'delete' && <>
          <h2 className="text-lg font-semibold text-red-700">Delete job</h2>
          <p className="text-sm text-gray-600">This deletes the job, its lines and its costs. monday is not touched. Type <b>{job.name}</b> to confirm.</p>
          <input className="input" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn-primary w-full bg-red-700! hover:bg-red-800!" disabled={busy || name !== job.name} onClick={() => go(async () => { await api.deleteJob(); onDeleted(); })}>Delete permanently</button>
        </>}
        {kind === 'issue' && openCOId && <>
          <h2 className="text-lg font-semibold">Issue {coName}</h2>
          <p className="text-sm text-gray-600">Once issued it&apos;s locked; corrections go on a new change order.</p>
          <div className="flex gap-4 text-sm">
            <label><input type="radio" checked={coType === 'client'} onChange={() => setCoType('client')} /> Client (adds a price to the contract)</label>
            <label><input type="radio" checked={coType === 'internal'} onChange={() => setCoType('internal')} /> Internal</label>
          </div>
          {coType === 'client' && <label className="text-sm block">Price to client<NumInput value={price} onChange={setPrice} /></label>}
          <button className="btn-primary w-full" disabled={busy || (coType === 'client' && price === null)} onClick={() => go(() => api.patchCO(openCOId, { issued: new Date().toISOString().slice(0, 10), type: coType, price: coType === 'client' ? price || 0 : 0 }))}>Issue</button>
        </>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
