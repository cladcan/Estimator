'use client';
import { money, type jobPricing } from '@/lib/pricing';
import type { Job } from '@/lib/types';

type P = ReturnType<typeof jobPricing>;
export default function PricingPanel({ job, pricing: p, patchJob, locked }: { job: Job; pricing: P; patchJob: (x: Partial<Job>) => void; locked: boolean }) {
  const pct = (k: 'markup_pct' | 'contingency_pct' | 'commission_pct', val: number) => (
    <input className="input w-20 text-right" type="number" step="any" disabled={locked} defaultValue={val}
      onBlur={e => patchJob({ [k]: e.target.value === '' ? null : Number(e.target.value) })} />
  );
  const Row = ({ label, v, extra, bold }: { label: string; v: number; extra?: React.ReactNode; bold?: boolean }) => (
    <div className={`flex items-center gap-2 py-1 ${bold ? 'font-semibold border-t pt-2' : ''}`}><span className="flex-1">{label}</span>{extra}<span className="w-28 text-right">{money(v)}</span></div>
  );
  return (
    <div className="card text-sm sticky top-4">
      <h2 className="font-semibold mb-2">Pricing</h2>
      {p.bySection.map((s, i) => <div key={i} className="flex justify-between text-gray-600"><span>{s.name}</span><span>{money(s.total)}</span></div>)}
      <Row label="Total cost" v={p.cost} bold />
      <Row label="Markup %" v={p.markup} extra={pct('markup_pct', p.markupPct)} />
      <Row label="Contingency %" v={p.contingency} extra={pct('contingency_pct', p.contPct)} />
      <Row label="Commission %" v={p.commission} extra={pct('commission_pct', p.commPct)} />
      <Row label="Discount" v={-p.discount} extra={<input className="input w-24 text-right" type="number" disabled={locked} defaultValue={job.discount} onBlur={e => patchJob({ discount: Number(e.target.value) })} />} />
      <Row label="Quoted price" v={p.quoted} bold />
      <div className="flex justify-between py-1"><span>$ / SF</span><span>{p.perSf ? money(p.perSf) : '—'}</span></div>
      <div className="flex justify-between py-1 text-gray-600"><span>Margin</span><span>{money(p.margin)} ({p.marginPct.toFixed(1)}%)</span></div>
      <div className="flex justify-between py-1 text-gray-600"><span>HST</span><span>{money(p.hst)}</span></div>
      <div className="flex justify-between py-1 font-semibold"><span>Total incl. HST</span><span>{money(p.totalWithHst)}</span></div>
    </div>
  );
}
