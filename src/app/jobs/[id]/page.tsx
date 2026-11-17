'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadSections, loadSettings, DEFAULT_SETTINGS } from '@/lib/data';
import { jobPricing, money, type Section, type Settings } from '@/lib/pricing';
import type { Job, SectionType, RateItem } from '@/lib/types';
import EstimateTab from '@/components/EstimateTab';
import PricingPanel from '@/components/PricingPanel';
import TrackingTab from '@/components/TrackingTab';

const TABS = ['Estimate', 'Budget vs actual', 'Phases', 'Change orders'] as const;

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [types, setTypes] = useState<SectionType[]>([]);
  const [rates, setRates] = useState<RateItem[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Estimate');

  const reloadSections = useCallback(async () => setSections(await loadSections(id)), [id]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('jobs').select('*').eq('id', id).single();
      setJob(data); setSettings(await loadSettings());
      setTypes((await supabase.from('section_types').select('*').order('sort')).data || []);
      setRates((await supabase.from('rate_items').select('*').order('description')).data || []);
      reloadSections();
    })();
  }, [id, reloadSections]);

  const pricing = useMemo(() => job ? jobPricing(job, sections, settings) : null, [job, sections, settings]);
  if (!job || !pricing) return <div className="text-gray-500">Loading…</div>;
  const locked = job.status !== 'estimate';

  const patchJob = async (p: Partial<Job>) => {
    setJob({ ...job, ...p });
    await supabase.from('jobs').update({ ...p, updated_at: new Date().toISOString() }).eq('id', job.id);
  };

  const startProject = async () => {
    if (!confirm('Start project? This locks the current estimate as the budget.')) return;
    const snapshot = { cost: pricing.cost, quoted: pricing.quoted, locked_at: new Date().toISOString(),
      bySection: pricing.bySection.map(s => ({ name: s.name, section_type_id: s.section_type_id, total: s.total })) };
    await patchJob({ status: 'active', budget_snapshot: snapshot, started_at: snapshot.locked_at });
    setTab('Budget vs actual');
  };

  const field = (k: keyof Job, label: string, type = 'text') => (
    <label className="text-xs text-gray-500">{label}
      <input className="input" type={type} defaultValue={(job[k] as string | number | null) ?? ''}
        onBlur={e => patchJob({ [k]: type === 'number' ? Number(e.target.value) : e.target.value } as Partial<Job>)} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={() => router.push('/')}>← Jobs</button>
        <h1 className="text-xl font-semibold">{job.name}</h1>
        <select className="input w-auto" value={job.status} onChange={e => patchJob({ status: e.target.value as Job['status'] })}>
          {['estimate', 'active', 'complete', 'lost'].map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => window.open(`/jobs/${job.id}/quote`, '_blank')}>Print quote</button>
          {!locked && <button className="btn-primary" onClick={startProject}>Start project</button>}
          <button className="btn text-red-600" onClick={async () => { if (confirm('Delete this job permanently?')) { await supabase.from('jobs').delete().eq('id', job.id); router.push('/'); } }}>Delete</button>
        </div>
      </div>
      <div className="card grid grid-cols-2 md:grid-cols-5 gap-3">
        {field('job_number', 'Job #')}{field('name', 'Job name')}{field('client', 'Client')}{field('address', 'Address')}{field('area_sf', 'Total area (SF)', 'number')}
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t ? 'border-blue-700 font-medium' : 'border-transparent text-gray-500'}`}>{t}</button>)}
      </div>
      {tab === 'Estimate' ? (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
          <EstimateTab jobId={job.id} sections={sections} setSections={setSections} reload={reloadSections} settings={settings} types={types} rates={rates} locked={locked} />
          <PricingPanel job={job} pricing={pricing} patchJob={patchJob} locked={locked} />
        </div>
      ) : (
        <TrackingTab job={job} tab={tab} types={types} />
      )}
      {locked && tab === 'Estimate' && <p className="text-sm text-gray-500">Budget locked {job.started_at && new Date(job.started_at).toLocaleDateString('en-CA')} at {money(job.budget_snapshot?.quoted || 0)}. The estimate is read-only; use change orders for scope changes.</p>}
    </div>
  );
}
