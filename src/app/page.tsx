'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/types';
import { money } from '@/lib/pricing';

const STATUSES = ['all', 'estimate', 'active', 'complete', 'lost'] as const;
const badge: Record<string, string> = { estimate: 'bg-amber-100 text-amber-800', active: 'bg-green-100 text-green-800', complete: 'bg-slate-200 text-slate-700', lost: 'bg-red-100 text-red-700' };

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('all');
  const [q, setQ] = useState('');
  const router = useRouter();
  useEffect(() => { supabase.from('jobs').select('*').order('created_at', { ascending: false }).then(({ data }) => setJobs(data || [])); }, []);
  const shown = useMemo(() => jobs.filter(j => (filter === 'all' || j.status === filter) &&
    [j.name, j.client, j.job_number, j.address].join(' ').toLowerCase().includes(q.toLowerCase())), [jobs, filter, q]);

  async function newJob() {
    const name = prompt('Job name'); if (!name) return;
    const { data, error } = await supabase.from('jobs').insert({ name }).select().single();
    if (error) return alert(error.message);
    router.push(`/jobs/${data.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-4">Jobs</h1>
        {STATUSES.map(s => <button key={s} onClick={() => setFilter(s)} className={`btn capitalize ${filter === s ? 'bg-slate-900! text-white' : ''}`}>{s}</button>)}
        <input className="input max-w-xs ml-auto" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-primary" onClick={newJob}>New estimate</button>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b"><tr><th className="th">#</th><th className="th">Job</th><th className="th">Client</th><th className="th">Status</th><th className="th text-right">Budget</th><th className="th">Created</th></tr></thead>
          <tbody>
            {shown.map(j => (
              <tr key={j.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/jobs/${j.id}`)}>
                <td className="td">{j.job_number}</td>
                <td className="td font-medium"><Link href={`/jobs/${j.id}`}>{j.name}</Link><div className="text-xs text-gray-500">{j.address}</div></td>
                <td className="td">{j.client}</td>
                <td className="td"><span className={`text-xs px-2 py-0.5 rounded capitalize ${badge[j.status]}`}>{j.status}</span></td>
                <td className="td text-right">{j.budget_snapshot ? money(j.budget_snapshot.quoted) : '—'}</td>
                <td className="td text-gray-500">{new Date(j.created_at).toLocaleDateString('en-CA')}</td>
              </tr>
            ))}
            {!shown.length && <tr><td className="td text-gray-500 p-6" colSpan={6}>No jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
