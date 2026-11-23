'use client';
// Invoices and receipts kept with a job. Files go to the private "invoices" storage bucket;
// each one has a row in `attachments` and can be linked to one of the job's cost entries.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, newId } from '@/lib/calc';
import type { Attachment, Cost, Line } from '@/lib/types';
import TextInput from '@/components/TextInput';
import NumInput from '@/components/NumInput';

const BUCKET = 'invoices';
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';
const kb = (n: number | null) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function InvoicesPanel({ jobId, costs, lines, editable }: { jobId: string; costs: Cost[]; lines: Line[]; editable: boolean }) {
  const [rows, setRows] = useState<Attachment[] | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('attachments').select('*').eq('job_id', jobId).order('date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) { setMsg(/relation|does not exist|schema cache/i.test(error.message) ? 'Invoice storage is not set up yet: run supabase/add-invoices.sql in Supabase.' : error.message); setRows([]); return; }
    setRows(data as Attachment[]);
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const lineName = useMemo(() => new Map(lines.map(l => [l.id, l.name])), [lines]);
  const costLabel = (c: Cost) => `${c.date || ''} · ${c.name || lineName.get(c.line_id) || 'Cost'} · ${money(Number(c.amount) || 0)}`;
  const sortedCosts = useMemo(() => [...costs].sort((a, b) => (b.date || '').localeCompare(a.date || '')), [costs]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const id = newId('a'); const path = `${jobId}/${id}-${safeName(f.name)}`;
      setMsg(`Uploading ${f.name}…`);
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) { setMsg(`Upload failed: ${up.error.message}`); return; }
      const row = { id, job_id: jobId, cost_id: null, path, name: f.name, mime: f.type || null, size: f.size, date: new Date().toISOString().slice(0, 10), source: 'upload' };
      const { error } = await supabase.from('attachments').insert(row);
      if (error) { await supabase.storage.from(BUCKET).remove([path]); setMsg(`Upload failed: ${error.message}`); return; }
    }
    setMsg(''); load();
  }

  async function view(a: Attachment) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 300);
    if (error || !data) { setMsg(`Could not open ${a.name}: ${error?.message}`); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function patch(id: string, p: Partial<Attachment>) {
    setRows(r => r && r.map(x => (x.id === id ? { ...x, ...p } : x)));
    const { error } = await supabase.from('attachments').update(p).eq('id', id);
    if (error) setMsg(error.message);
  }

  async function remove(a: Attachment) {
    if (!confirm(`Delete ${a.name}? The file is removed for good.`)) return;
    const s = await supabase.storage.from(BUCKET).remove([a.path]);
    if (s.error) { setMsg(s.error.message); return; }
    await supabase.from('attachments').delete().eq('id', a.id); load();
  }

  const total = (rows || []).reduce((t, a) => t + (Number(a.amount) || 0), 0);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="label" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Invoices &amp; receipts ({rows?.length ?? '…'})</button>
        {total > 0 && <span className="text-sm text-[var(--ink2)]">{money(total)} before tax</span>}
        {editable && <label className="btn cursor-pointer ml-auto">+ Add invoices<input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => { upload(e.target.files); e.target.value = ''; }} /></label>}
      </div>
      {msg && <div className="text-sm text-[var(--warn)]">{msg}</div>}
      {open && rows && (rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--muted)]"><th className="py-1 pr-2">File</th><th className="pr-2">Date</th><th className="pr-2">Supplier</th><th className="pr-2">Invoice #</th><th className="pr-2">Amount</th><th className="pr-2">Cost entry</th><th /></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="border-t border-[var(--line)] align-middle">
                  <td className="py-1 pr-2"><button className="text-[var(--accent)] underline text-left" onClick={() => view(a)}>{a.mime === 'application/pdf' ? '📄' : '🖼️'} {a.name}</button> <span className="text-xs text-[var(--muted)]">{kb(a.size)}</span></td>
                  <td className="pr-2"><input type="date" className="input w-36" disabled={!editable} value={a.date || ''} onChange={e => patch(a.id, { date: e.target.value || null })} /></td>
                  <td className="pr-2"><TextInput className="w-40" value={a.supplier} disabled={!editable} onChange={v => patch(a.id, { supplier: v || null })} /></td>
                  <td className="pr-2"><TextInput className="w-28" value={a.invoice_no} disabled={!editable} onChange={v => patch(a.id, { invoice_no: v || null })} /></td>
                  <td className="pr-2"><NumInput className="w-28" value={a.amount} disabled={!editable} onChange={v => patch(a.id, { amount: v })} /></td>
                  <td className="pr-2"><select className="input w-64" disabled={!editable} value={a.cost_id || ''} onChange={e => patch(a.id, { cost_id: e.target.value || null })}>
                    <option value="">— not linked —</option>
                    {sortedCosts.map(c => <option key={c.id} value={c.id}>{costLabel(c)}</option>)}
                  </select></td>
                  <td className="text-right">{editable && <button className="btn-sm text-red-700" onClick={() => remove(a)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="text-sm text-[var(--muted)]">No invoices yet. Add photos or PDFs of invoices and receipts for this job.</div>)}
    </div>
  );
}
