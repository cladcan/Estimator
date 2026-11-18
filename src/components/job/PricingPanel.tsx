'use client';
import { isFinishedFace, money, r2 } from '@/lib/calc';
import NumInput from '@/components/NumInput';
import TextInput from '@/components/TextInput';
import type { JobView } from './types';
import type { PR } from '@/lib/types';

export default function PricingPanel({ v }: { v: JobView }) {
  const { d, calc, api, editable, tx } = v;
  const p = calc.pr; const pr: PR = d.job.pr || {};
  const locked = !editable || !!d.job.started;
  const setPr = (patch: Partial<PR>) => api.patchJob({ pr: { ...pr, ...patch } });
  const psf = (val: number) => (p.area ? `${money(val / p.area)}/SF` : '');
  const modeBtns = (k: 'cm' | 'dm', valKey: 'c' | 'd', base: number, def: 'pct' | 'amt') => (
    <span className="inline-flex">
      {(['amt', 'pct'] as const).map(m => {
        const on = (pr[k] || def) === m;
        return <button key={m} disabled={locked} className={`px-2.5 py-1 text-sm border border-[var(--line)] first:rounded-l last:rounded-r ${on ? 'bg-[#2b4d72] text-white' : 'bg-white'}`}
          onClick={() => { if (on) return; const cur = Number(pr[valKey] ?? 0); const conv = !base ? cur : m === 'amt' ? r2(base * cur / 100) : r2(cur / base * 100); setPr({ [k]: m, [valKey]: pr[valKey] == null ? null : conv } as Partial<PR>); }}>{m === 'amt' ? '$' : '%'}</button>;
      })}
    </span>
  );
  const tile = (label: string, val: number, ctl?: React.ReactNode, color = '') => (
    <div className="tile" key={label}>
      <div className="label">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{money(tx(val))}</div>
      <div className="text-sm text-[var(--muted)]">{psf(val)}</div>
      {ctl && <div className="flex items-center gap-1 mt-2">{ctl}</div>}
    </div>
  );
  const taxPct = d.job.tax === null ? null : r2(Number(d.job.tax) * 100);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="tile">
          <div className="label">Total installed cladding area (SF)</div>
          <div className="text-xl font-semibold">{p.area.toLocaleString('en-CA')} SF</div>
          <div className="mt-1"><TextInput className="w-36 text-right" disabled={!editable} placeholder={String(p.autoArea)} value={pr.sf ?? ''} onChange={s => setPr({ sf: s || null })} /></div>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-[var(--accent)]">Which sections count</summary>
            <div className="space-y-1 pt-2">
              <div className="text-xs text-[var(--muted)]">Blank box = automatic. A number replaces it; +N or −N adjusts it.</div>
              {d.sections.filter(s => !s.proj_only && !s.co_id).map(s => { const auto = isFinishedFace({ ...s, fin: false }, v.st); return (
                <label key={s.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" disabled={!editable || auto} checked={auto || s.fin} onChange={e => api.patchSection(s.id, { fin: e.target.checked })} />
                  <span className="flex-1">{s.name}{auto ? ' (finished face)' : ''}</span><span className="text-[var(--muted)]">{Number(s.area || 0).toLocaleString('en-CA')} SF</span>
                </label>); })}
              <div className="text-xs text-[var(--muted)] pt-1">Extra areas</div>
              {(pr.x || []).map((x, i) => (
                <div key={i} className="flex gap-1">
                  <TextInput disabled={!editable} value={x.name} onChange={name => setPr({ x: (pr.x || []).map((y, j) => j === i ? { ...y, name } : y) })} />
                  <NumInput className="w-20" disabled={!editable} value={x.sf} onChange={s => setPr({ x: (pr.x || []).map((y, j) => j === i ? { ...y, sf: s || 0 } : y) })} />
                  {editable && <button className="text-red-600" onClick={() => setPr({ x: (pr.x || []).filter((_, j) => j !== i) })}>×</button>}
                </div>))}
              {editable && <button className="btn-sm" onClick={() => setPr({ x: [...(pr.x || []), { name: 'Extra area', sf: 0 }] })}>+ Extra area</button>}
              <label className="flex items-center gap-2 text-xs text-[var(--muted)] pt-1">Tax rate % (blank = {v.st.tax_pct}%, 0 = exempt)
                <NumInput className="w-16" disabled={!editable} value={taxPct} onChange={t => api.patchJob({ tax: t === null ? null : t / 100 })} /></label>
            </div>
          </details>
        </div>
        {tile('Markup-eligible costs', p.A, undefined, 'text-[#6b3fa0]')}
        {tile('Non-markup costs', p.B)}
        {tile('Total project cost', p.P)}
        {tile('Markup amount', p.U, <><NumInput className="w-28" disabled={locked} value={pr.m ?? null} auto={p.m} onChange={m => setPr({ m })} /><span>%</span>{p.FM ? <span className="text-xs text-[var(--muted)] ml-2">incl. {money(p.FM)} fixed</span> : null}</>)}
        {tile('Contingency allowance', p.T, <><NumInput className="w-28" disabled={locked} value={pr.t ?? null} auto={p.t} onChange={t => setPr({ t })} /><span>%</span></>)}
        {tile('Sales commission', p.C, <><NumInput className="w-28" disabled={locked} value={pr.c ?? null} onChange={c => setPr({ c })} />{modeBtns('cm', 'c', p.P, 'pct')}</>)}
        {tile('Discount', p.D, <><NumInput className="w-28" disabled={locked} value={pr.d ?? null} onChange={dd => setPr({ d: dd })} />{modeBtns('dm', 'd', p.S0, 'amt')}</>)}
      </div>
      <div className="rounded-lg border-2 border-[#2b4d72] bg-[var(--surface)] px-5 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Total quoted price</span><span className="text-xl font-semibold">{money(tx(p.S0))}</span>
        {p.D > 0 && <><span className="label">Price after discount</span><span className="text-xl font-semibold">{money(tx(p.Q))}</span></>}
        <span className="font-medium">{p.area ? `Unit Price ${money(p.Q / p.area)}/SF` : 'N/A: enter the cladding area'}</span>
      </div>
    </div>
  );
}
