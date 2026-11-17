'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadSections, loadSettings } from '@/lib/data';
import { jobPricing, money } from '@/lib/pricing';
import type { Job } from '@/lib/types';

export default function Quote() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<{ job: Job; p: ReturnType<typeof jobPricing> } | null>(null);
  useEffect(() => { (async () => {
    const { data: job } = await supabase.from('jobs').select('*').eq('id', id).single();
    const p = jobPricing(job, await loadSections(id), await loadSettings());
    setD({ job, p });
  })(); }, [id]);
  if (!d) return null;
  const { job, p } = d;
  return (
    <div className="bg-white max-w-3xl mx-auto p-8 space-y-4 print:p-0">
      <style>{`@media print { header { display:none } }`}</style>
      <div className="flex justify-between"><h1 className="text-2xl font-bold">Quotation</h1><button className="btn print:hidden" onClick={() => window.print()}>Print / save PDF</button></div>
      <div className="text-sm"><div><b>Project:</b> {job.name} {job.job_number && `(#${job.job_number})`}</div><div><b>Client:</b> {job.client}</div><div><b>Address:</b> {job.address}</div><div><b>Date:</b> {new Date().toLocaleDateString('en-CA')}</div></div>
      <table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-1">Scope</th></tr></thead>
        <tbody>{p.bySection.map((s, i) => <tr key={i} className="border-b"><td className="py-1">{s.name}</td></tr>)}</tbody></table>
      <div className="text-sm ml-auto w-72 space-y-1">
        <div className="flex justify-between font-semibold"><span>Price</span><span>{money(p.quoted)}</span></div>
        <div className="flex justify-between"><span>HST</span><span>{money(p.hst)}</span></div>
        <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{money(p.totalWithHst)}</span></div>
      </div>
    </div>
  );
}
