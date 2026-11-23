'use client';
import { useEffect, useState } from 'react';
import { coLabel, fmtN, isSubtrade, lineMk, money, r2 } from '@/lib/calc';
import { LINE_ROLES, LINE_TYPES, type Line, type Section } from '@/lib/types';
import NumInput from '@/components/NumInput';
import TextInput from '@/components/TextInput';
import { blankLine } from '@/hooks/useJob';
import type { JobView } from './types';

export default function SectionCard({ v, sec, num }: { v: JobView; sec: Section; num: number }) {
  const { d, calc, api, st, editable, mode, tx, openCO } = v;
  const [fold, setFold] = useState(false);
  const [phaseTab, setPhaseTab] = useState<string>('all');
  const [showText, setShowText] = useState(false);
  const foldKey = `fold:${d.job.id}:${sec.id}`;
  useEffect(() => { try { setFold(localStorage.getItem(foldKey) === '1'); } catch {} }, [foldKey]);
  useEffect(() => { if (!v.foldCmd.n) return; setFold(v.foldCmd.fold); try { localStorage.setItem(foldKey, v.foldCmd.fold ? '1' : '0'); } catch {} }, [v.foldCmd, foldKey]);
  const toggleFold = () => { setFold(!fold); try { localStorage.setItem(foldKey, fold ? '0' : '1'); } catch {} };

  const project = mode === 'project';
  const started = !!d.job.started;
  const estEditable = editable && !started;
  const secLines = d.lines.filter(l => l.section_id === sec.id).sort((a, b) => a.pos - b.pos);
  const phases = d.phases.filter(p => p.section_id === sec.id).sort((a, b) => a.pos - b.pos);
  const tot = calc.secTotals.get(sec.id)!;
  const jobArea = calc.pr.area;
  const subtrade = isSubtrade(sec, st);
  const hasSheets = secLines.some(l => l.role === 'sheets') || !!sec.sheet_sqft;
  const coOpen = openCO?.id;
  const secCO = sec.co_id ? d.cos.find(c => c.id === sec.co_id) : null;
  const secLocked = !!secCO?.issued;

  const shownLines = secLines.filter(l => {
    if (v.onlyLeft && l.kind === 'todo' && l.done) return false;
    if (!project) return !l.proj_only && !l.co_id && !l.phase_id;
    if (phases.length && phaseTab !== 'all') return phaseTab === 'p1' ? !l.phase_id : l.phase_id === phaseTab;
    return !l.phase_id;
  });
  const canEditLine = (l: Line) => {
    if (!editable) return false;
    const co = l.co_id ? d.cos.find(c => c.id === l.co_id) : null;
    if (co?.issued || secLocked) return false;
    return true;
  };

  const addLine = (kind: 'item' | 'todo') => {
    const maxPos = secLines.reduce((a, l) => Math.max(a, l.pos), 0);
    const inProj = started;
    api.addLine(blankLine({ job_id: d.job.id, section_id: sec.id, kind, pos: maxPos + 1, custom: true,
      proj_only: inProj && !coOpen, co_id: inProj && coOpen && !sec.co_id ? coOpen : null,
      phase_id: project && phaseTab !== 'all' && phaseTab !== 'p1' ? phaseTab : null }));
  };

  const meterPct = tot.budget ? tot.actual / tot.budget * 100 : tot.actual ? 100 : 0;
  const perSf = (amt: number, area: number | null) => (area ? money(amt / area) : '');

  return (
    <div className={`card p-0 ${sec.proj_off ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-slate-50 rounded-t-lg">
        <button className="text-gray-500 w-5" onClick={toggleFold} title={fold ? 'Expand' : 'Collapse'}>{fold ? '▸' : '▾'}</button>
        <span className="text-gray-400 font-semibold w-6 text-right">{num}.</span>
        <TextInput className="font-semibold max-w-xs" value={sec.name} disabled={!editable} onChange={name => api.patchSection(sec.id, { name })} />
        {sec.lib && <span className="pill bg-slate-200 text-slate-700">{sec.lib}</span>}
        {sec.tier && <span className="pill bg-violet-100 text-violet-800">{sec.tier}</span>}
        {sec.proj_only && <span className="pill bg-orange-100 text-orange-800">Not in budget</span>}
        {secCO && <span className="pill bg-indigo-100 text-indigo-800">{coLabel(d.cos, secCO.id)}{secCO.issued ? '' : ' (open)'}</span>}
        {sec.proj_off && <span className="pill bg-gray-200">Removed</span>}
        <label className="text-xs text-gray-500 flex items-center gap-1 ml-2">Area SF<NumInput className="w-24" value={sec.area} disabled={!editable} onChange={area => api.patchSection(sec.id, { area })} /></label>
        {hasSheets && <label className="text-xs text-gray-500 flex items-center gap-1">Sheet SF<NumInput className="w-20" value={sec.sheet_sqft} disabled={!estEditable} onChange={sheet_sqft => api.patchSection(sec.id, { sheet_sqft })} /></label>}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {project ? <>
            <span className="text-gray-500">Budget</span><b>{money(tx(tot.budget))}</b>
            <span className="text-gray-500">Actual</span><b className={tot.actual > tot.budget ? 'text-red-600' : ''}>{money(tx(tot.actual))}</b>
            <span className={tot.budget - tot.actual < 0 ? 'text-red-600' : 'text-green-700'}>{money(tx(tot.budget - tot.actual))}</span>
          </> : <><b>{money(tx(tot.est))}</b>{sec.area ? <span className="text-gray-500 text-xs">{perSf(tot.est, sec.area)}/SF</span> : null}</>}
        </div>
      </div>
      {project && (
        <div className="px-3 pt-1"><div className="h-1.5 bg-gray-200 rounded"><div className={`h-1.5 rounded ${meterPct > 100 ? 'bg-red-500' : meterPct >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, meterPct)}%` }} /></div></div>
      )}
      {!fold && <div className="p-3 space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 items-center">
          {!subtrade && <label className="flex items-center gap-1">Markup default
            <select className="input w-auto py-0" disabled={!estEditable} value={sec.mk || ''} onChange={e => api.patchSection(sec.id, { mk: (e.target.value || null) as 'Y' | 'N' | null })}>
              <option value="">Auto</option><option value="Y">Markup</option><option value="N">No markup</option></select></label>}
          {subtrade && <span>Subtrades are never marked up.</span>}
          <label className="flex items-center gap-1">Fixed markup<NumInput className="w-24" value={sec.fmk} disabled={!estEditable} onChange={fmk => api.patchSection(sec.id, { fmk })} />
            <select className="input w-auto py-0" disabled={!estEditable} value={sec.fmkm} onChange={e => {
              const to = e.target.value as 'amt' | 'pct'; const base = tot.est; let fmk = sec.fmk;
              if (fmk !== null && base) fmk = to === 'pct' ? r2(fmk / base * 100) : r2(base * fmk / 100);
              api.patchSection(sec.id, { fmkm: to, fmk });
            }}><option value="amt">$</option><option value="pct">%</option></select></label>
          <label className="flex items-center gap-1"><input type="checkbox" disabled={!estEditable} checked={sec.fin} onChange={e => api.patchSection(sec.id, { fin: e.target.checked })} />Finished face (counts in job area)</label>
          <button className="underline" onClick={() => setShowText(!showText)}>{showText ? 'Hide' : 'Client text'}{sec.ctext ? '' : ' (empty)'}</button>
          {project && <label className="flex items-center gap-1">Actual sub-total override<NumInput className="w-28" value={sec.act_override === null ? null : tx(sec.act_override)} disabled={!editable} placeholder="rough figure"
            onChange={x => api.patchSection(sec.id, { act_override: x === null ? null : r2(x / tx(1)) })} /></label>}
        </div>
        {showText && <TextInput multiline value={sec.ctext} disabled={!editable} placeholder="Wording for the quote. {AREA} is replaced by the section area." onChange={ctext => api.patchSection(sec.id, { ctext })} />}

        {project && phases.length > 0 && (
          <div className="flex flex-wrap gap-1 text-xs">
            {[['all', 'All phases together'], ['p1', 'Phase 1'], ...phases.map(p => [p.id, p.name])].map(([k, l]) => (
              <button key={k} onClick={() => setPhaseTab(k)} className={`btn-sm ${phaseTab === k ? 'bg-slate-900! text-white' : ''}`}>{l}</button>))}
            {phaseTab !== 'all' && phaseTab !== 'p1' && editable && <>
              <TextInput className="w-32 py-0 text-xs" value={phases.find(p => p.id === phaseTab)?.name} onChange={name => api.patchPhase(phaseTab, { name })} />
              <button className="btn-sm text-red-600" onClick={() => { const p = phases.find(x => x.id === phaseTab)!; if (confirm(`Remove ${p.name} and its actual costs?`)) { api.removePhase(p); setPhaseTab('all'); } }}>Remove phase</button></>}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr>
              <th className="th">Item</th><th className="th w-24">Type</th>{!project && <th className="th w-20">Role</th>}<th className="th w-16">Mk</th>
              {project ? <>
                <th className="th w-20 text-right">Bud qty</th><th className="th w-20 text-right">Bud rate</th><th className="th w-24 text-right">Budget</th>
                {phaseTab !== 'all' || !phases.length ? <><th className="th w-20 text-right">Act qty</th><th className="th w-20 text-right">Act rate</th></> : <th className="th w-40"></th>}
                <th className="th w-24 text-right">Actual</th><th className="th w-24 text-right">Left</th>
              </> : <>
                <th className="th w-24 text-right">Qty</th><th className="th w-24 text-right">Rate</th><th className="th w-28 text-right">Amount</th>
                <th className="th w-20 text-right">$/SF sec</th><th className="th w-20 text-right">$/SF job</th>
              </>}
              <th className="w-14"></th>
            </tr></thead>
            <tbody>
              {shownLines.map(l => l.kind === 'todo'
                ? <TodoRow key={l.id} v={v} l={l} editable={canEditLine(l)} cols={project ? 11 : 10} />
                : <LineRow key={l.id} v={v} l={l} sec={sec} editable={canEditLine(l)} estEditable={estEditable || !!(l.co_id && canEditLine(l)) || (l.proj_only && canEditLine(l))} phaseAll={project && phases.length > 0 && phaseTab === 'all'} jobArea={jobArea} />)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          {(estEditable || (editable && started && !secLocked)) && <>
            <button className="btn-sm" onClick={() => addLine('item')}>+ Line{started ? (coOpen ? ` (${coLabel(d.cos, coOpen)})` : ' (not in budget)') : ''}</button>
            <button className="btn-sm" onClick={() => addLine('todo')}>+ To-do</button>
          </>}
          {project && editable && !sec.proj_only && !sec.co_id && <button className="btn-sm" onClick={() => api.addPhase(sec)}>+ Add phase</button>}
          {v.libButtons(sec)}
          <span className="ml-auto flex gap-1">
            {editable && <><button className="btn-sm" onClick={() => api.moveSection(sec.id, -1)}>↑</button><button className="btn-sm" onClick={() => api.moveSection(sec.id, 1)}>↓</button></>}
            {editable && (sec.proj_off
              ? <button className="btn-sm" onClick={() => api.patchSection(sec.id, { proj_off: false })}>Put back</button>
              : <button className="btn-sm text-red-600" disabled={secLocked} onClick={() => {
                if (started && !sec.proj_only && !sec.co_id) { if (confirm('Hide this section from the project? It stays on the estimate and can be put back.')) api.patchSection(sec.id, { proj_off: true }); }
                else if (confirm(`Delete section "${sec.name}" and its lines?`)) api.deleteSection(sec.id);
              }}>{started && !sec.proj_only && !sec.co_id ? 'Remove from project' : 'Delete section'}</button>)}
          </span>
        </div>
      </div>}
    </div>
  );
}

function LineRow({ v, l, sec, editable, estEditable, phaseAll, jobArea }: { v: JobView; l: Line; sec: Section; editable: boolean; estEditable: boolean; phaseAll: boolean; jobArea: number }) {
  const { d, calc, api, st, mode, tx } = v;
  const [open, setOpen] = useState(false);
  const project = mode === 'project';
  const e = calc.est.get(l.id), a = calc.act.get(l.id);
  const mk = lineMk(l, sec, st);
  const sub = isSubtrade(sec, st);
  const costs = d.costs.filter(c => c.line_id === l.id).sort((x, y) => x.pos - y.pos);
  const copies = d.lines.filter(x => x.of_line === l.id);
  const actualAll = (a?.amount ?? 0) + copies.reduce((s, c) => s + (calc.act.get(c.id)?.amount ?? 0), 0);
  const actual = phaseAll ? actualAll : a?.amount ?? 0;
  const budget = l.budget === null ? null : Number(l.budget);
  const isCO = !!l.co_id || !!sec.co_id;
  const notInBudget = (l.proj_only || sec.proj_only) && !isCO;
  const cols = project ? 11 : 10;

  return (<>
    <tr className={`border-t ${l.of_line ? 'bg-slate-50' : ''}`}>
      <td className="td"><div className="flex items-center gap-1">
        {project && <button className="text-xs text-gray-400 w-4" onClick={() => setOpen(!open)} title="Cost breakdown">{open ? '▾' : '▸'}{costs.length ? '' : ''}</button>}
        <TextInput value={l.name} disabled={!v.editable} onChange={name => api.patchLine(l.id, { name })} />
        {notInBudget && <span className="pill bg-orange-100 text-orange-800">Not in budget</span>}
        {l.co_id && <span className="pill bg-indigo-100 text-indigo-800">{coLabel(d.cos, l.co_id)}</span>}
        {costs.length > 0 && <span className="pill bg-slate-200">{costs.length} cost{costs.length > 1 ? 's' : ''}</span>}
        {l.rate_note && <span className="text-[10px] text-gray-400" title={l.rate_note}>ⓘ</span>}
      </div></td>
      <td className="td"><select className="input py-0" disabled={!estEditable} value={l.type} onChange={ev => api.patchLine(l.id, { type: ev.target.value as Line['type'] })}>{LINE_TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
      {!project && <td className="td"><select className="input py-0" disabled={!estEditable} value={l.role || ''} onChange={ev => api.patchLine(l.id, { role: (ev.target.value || null) as Line['role'] })}><option value="">—</option>{LINE_ROLES.map(r => <option key={r}>{r}</option>)}</select></td>}
      <td className="td">{sub ? <span className="text-xs text-gray-400">No</span> :
        <button disabled={!estEditable} className={`pill ${mk === 'Y' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`} onClick={() => api.patchLine(l.id, { mk: mk === 'Y' ? 'N' : 'Y' })}>{mk === 'Y' ? 'Markup' : 'No'}</button>}</td>
      {project ? <>
        {isCO && editable ? <>
          <td className="td"><NumInput value={l.bud_qty} onChange={q => api.patchLine(l.id, { bud_qty: q, budget: r2(Number(q || 0) * Number(l.bud_rate || 0)) })} /></td>
          <td className="td"><NumInput value={l.bud_rate} onChange={r => api.patchLine(l.id, { bud_rate: r, budget: r2(Number(l.bud_qty || 0) * Number(r || 0)) })} /></td>
        </> : <><td className="td text-right text-gray-600">{l.of_line ? '' : fmtN(l.bud_qty)}</td><td className="td text-right text-gray-600">{l.of_line ? '' : fmtN(l.bud_rate)}</td></>}
        <td className="td text-right">{l.of_line ? '' : budget === null ? <span className="text-xs text-gray-400">—</span> : money(tx(budget))}</td>
        {phaseAll ? <td className="td text-xs text-gray-500">{copies.length + 1} phases</td> : <>
          <td className="td">{l.role === 'sheets' ? <span className="text-xs text-gray-500">{fmtN(a?.sheetArea)} SF</span> :
            <NumInput value={l.act_qty} auto={a?.qtyAuto ? a.qty : undefined} disabled={!editable} onChange={q => api.patchLine(l.id, { act_qty: q, act_date: l.act_date || new Date().toISOString().slice(0, 10) })} />}</td>
          <td className="td"><NumInput value={l.act_rate} auto={a?.rateAuto ? a.rate : (l.act_rate === null ? (l.bud_rate ?? undefined) : undefined)} disabled={!editable || l.role === 'sheets'} onChange={r => api.patchLine(l.id, { act_rate: r })} /></td>
        </>}
        <td className="td text-right font-medium">{money(tx(actual))}</td>
        <td className={`td text-right ${budget !== null && budget - actual < 0 ? 'text-red-600' : ''}`}>{budget === null || l.of_line ? '' : money(tx(budget - actual))}</td>
      </> : <>
        <td className="td">{<NumInput value={l.est_qty} auto={e?.qtyAuto ? e.qty : undefined} disabled={!estEditable} onChange={q => api.patchLine(l.id, { est_qty: q })} />}</td>
        <td className="td">{l.role === 'sheets' ? <span className="text-xs text-gray-500 block text-right">{fmtN(e?.sheetArea)} SF</span> :
          <NumInput value={l.est_rate} auto={e?.rateAuto ? e.rate : undefined} disabled={!estEditable} onChange={r => api.patchLine(l.id, { est_rate: r })} />}</td>
        <td className="td text-right font-medium">{l.role === 'sheets' ? '' : money(tx(e?.amount ?? 0))}</td>
        <td className="td text-right text-xs text-gray-500">{sec.area && e?.amount ? money((e.amount) / Number(sec.area)) : ''}</td>
        <td className="td text-right text-xs text-gray-500">{jobArea && e?.amount ? money(e.amount / jobArea) : ''}</td>
      </>}
      <td className="td text-right">{(estEditable || (editable && (l.proj_only || isCO))) && !l.of_line && <button className="text-red-500" title="Delete line" onClick={() => confirm(`Delete "${l.name || 'line'}"?`) && api.deleteLine(l.id)}>×</button>}</td>
    </tr>
    {project && open && (
      <tr className="bg-slate-50"><td colSpan={cols} className="px-8 py-2">
        <div className="text-xs text-gray-500 mb-1">Cost breakdown (added on top of the line&apos;s own actual)</div>
        <table className="w-full max-w-3xl"><tbody>
          {costs.map(c => (
            <tr key={c.id}>
              <td className="td"><TextInput value={c.name} disabled={!editable} placeholder="Invoice / description" onChange={name => api.patchCost(c.id, { name })} /></td>
              <td className="td w-24"><NumInput value={c.qty} disabled={!editable} placeholder="qty" onChange={qty => api.patchCost(c.id, { qty, amount: r2(Number(qty || 0) * Number(c.rate || 0)) })} /></td>
              <td className="td w-24"><NumInput value={c.rate} disabled={!editable} placeholder="rate" onChange={rate => api.patchCost(c.id, { rate, amount: r2(Number(c.qty || 0) * Number(rate || 0)) })} /></td>
              <td className="td w-28 text-right">{money(tx(Number(c.amount)))}</td>
              <td className="td w-36"><input className="input" type="date" disabled={!editable} value={c.date || ''} onChange={ev => api.patchCost(c.id, { date: ev.target.value || null })} /></td>
              <td className="td w-6">{editable && <button className="text-red-500" onClick={() => api.deleteCost(c.id)}>×</button>}</td>
            </tr>))}
        </tbody></table>
        {editable && <button className="btn-sm mt-1" onClick={() => api.addCost(l)}>+ Cost</button>}
      </td></tr>
    )}
  </>);
}

function TodoRow({ v, l, editable, cols }: { v: JobView; l: Line; editable: boolean; cols: number }) {
  const { api } = v;
  return (
    <tr className="border-t"><td className="td" colSpan={cols - 1}><div className="flex items-center gap-2">
      <input type="checkbox" disabled={!editable} checked={l.done} onChange={e => api.patchLine(l.id, { done: e.target.checked })} />
      <TextInput className={l.done ? 'line-through text-gray-400' : ''} value={l.name} disabled={!editable} placeholder="To-do" onChange={name => api.patchLine(l.id, { name })} />
      <input className={`input w-40 ${!l.done && l.date && l.date < new Date().toISOString().slice(0, 10) ? 'text-red-600 border-red-400' : ''}`} type="date" disabled={!editable} value={l.date || ''} onChange={e => api.patchLine(l.id, { date: e.target.value || null })} />
    </div></td><td className="td text-right">{editable && <button className="text-red-500" onClick={() => api.deleteLine(l.id)}>×</button>}</td></tr>
  );
}
