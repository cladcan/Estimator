'use client';
import { money, r2 } from '@/lib/calc';
import NumInput from '@/components/NumInput';
import TextInput from '@/components/TextInput';
import type { JobView } from './types';
import type { PR } from '@/lib/types';

export default function PricingPanel({ v }: { v: JobView }) {
  const { d, calc, api, editable, tx, mode } = v;
  const p = calc.pr; const pr: PR = d.job.pr || {};
  const locked = !editable || !!d.job.started;
  const setPr = (patch: Partial<PR>) => api.patchJob({ pr: { ...pr, ...patch } });
  const sf = (val: number) => (p.area ? <span className="text-xs text-gray-500">{money(val / p.area)}/SF</span> : null);
  const Row = ({ label, val, ctl, strong }: { label: string; val: number; ctl?: React.ReactNode; strong?: boolean }) => (
    <div className={`flex items-center gap-2 py-1 ${strong ? 'border-t font-semibold pt-2' : ''}`}>
      <span className="flex-1">{label}</span>{ctl}<span className="w-28 text-right">{money(tx(val))}</span><span className="w-20 text-right">{sf(val)}</span>
    </div>
  );
  const modeSel = (k: 'cm' | 'dm', valKey: 'c' | 'd', base: number) => (
    <select className="input w-14 py-0" disabled={locked} value={pr[k] || 'pct'} onChange={e => {
      const to = e.target.value as 'pct' | 'amt'; const cur = Number(pr[valKey] ?? 0);
      const conv = !base ? cur : to === 'amt' ? r2(base * cur / 100) : r2(cur / base * 100);
      setPr({ [k]: to, [valKey]: conv } as Partial<PR>);
    }}><option value="pct">%</option><option value="amt">$</option></select>
  );
  const taxPct = d.job.tax === null ? null : r2(Number(d.job.tax) * 100);
  const margin = mode === 'project' ? calc.contractTotal - calc.actual : p.Q - p.P;
  const marginBase = mode === 'project' ? calc.contractTotal : p.Q;

  return (
    <div className="card text-sm space-y-1">
      <h2 className="font-semibold">Pricing</h2>
      <Row label="Markup-eligible costs (A)" val={p.A} />
      <Row label="Non-markup costs (B)" val={p.B} />
      <Row label="Total project cost (P)" val={p.P} strong />
      <Row label="Markup (U)" val={p.U} ctl={<><NumInput className="w-16" disabled={locked} value={pr.m ?? null} auto={p.m} onChange={m => setPr({ m })} /><span>%</span></>} />
      {p.FM ? <div className="text-xs text-gray-500 -mt-1 pl-2">includes {money(p.FM)} fixed section markup</div> : null}
      <Row label="Contingency (T)" val={p.T} ctl={<><NumInput className="w-16" disabled={locked} value={pr.t ?? null} auto={p.t} onChange={t => setPr({ t })} /><span>%</span></>} />
      <Row label="Commission (C)" val={p.C} ctl={<><NumInput className="w-20" disabled={locked} value={pr.c ?? null} onChange={c => setPr({ c })} />{modeSel('cm', 'c', p.P)}</>} />
      <Row label="Discount (D)" val={-p.D} ctl={<><NumInput className="w-20" disabled={locked} value={pr.d ?? null} onChange={dd => setPr({ d: dd })} />{modeSel('dm', 'd', p.S0)}</>} />
      <div className="flex items-center gap-2 py-2 border-t-2 border-slate-800 font-bold text-base">
        <span className="flex-1">Total quoted price (Q)</span><span className="w-28 text-right">{money(tx(p.Q))}</span>
        <span className="w-20 text-right text-xs font-normal">{p.area ? `${money(p.Q / p.area)}/SF` : ''}</span>
      </div>
      {!p.area && <div className="text-xs text-amber-700">Unit price $/SF: N/A, enter the cladding area.</div>}
      <div className="flex justify-between text-gray-600"><span>Margin {mode === 'project' ? '(contract − actual)' : '(Q − P)'}</span><span>{money(margin)} {marginBase ? `(${(margin / marginBase * 100).toFixed(1)}%)` : ''}</span></div>

      <details className="pt-2 border-t">
        <summary className="cursor-pointer text-gray-600">Area {p.area.toLocaleString('en-CA')} SF {p.area !== p.autoArea ? `(auto ${p.autoArea.toLocaleString('en-CA')})` : '(auto)'} · tax {taxPct ?? v.st.tax_pct}%</summary>
        <div className="space-y-2 pt-2">
          <label className="block text-xs text-gray-500">Area override (blank = auto, a number replaces it, +N/−N adjusts)
            <TextInput disabled={!editable} value={pr.sf ?? ''} onChange={s => setPr({ sf: s || null })} /></label>
          <div className="text-xs text-gray-500">Extra areas</div>
          {(pr.x || []).map((x, i) => (
            <div key={i} className="flex gap-1">
              <TextInput disabled={!editable} value={x.name} onChange={name => setPr({ x: (pr.x || []).map((y, j) => j === i ? { ...y, name } : y) })} />
              <NumInput className="w-24" disabled={!editable} value={x.sf} onChange={s => setPr({ x: (pr.x || []).map((y, j) => j === i ? { ...y, sf: s || 0 } : y) })} />
              {editable && <button className="text-red-500" onClick={() => setPr({ x: (pr.x || []).filter((_, j) => j !== i) })}>×</button>}
            </div>))}
          {editable && <button className="btn-sm" onClick={() => setPr({ x: [...(pr.x || []), { name: 'Extra area', sf: 0 }] })}>+ Extra area</button>}
          <label className="flex items-center gap-2 text-xs text-gray-500">Tax rate % (blank = {v.st.tax_pct}%, 0 for exempt)
            <NumInput className="w-20" disabled={!editable} value={taxPct} onChange={t => api.patchJob({ tax: t === null ? null : t / 100 })} /></label>
        </div>
      </details>
    </div>
  );
}
