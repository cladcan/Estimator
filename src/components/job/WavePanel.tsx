'use client';
import { useMemo, useState } from 'react';
import { money } from '@/lib/calc';
import TextInput from '@/components/TextInput';
import type { JobView } from './types';
import type { LibraryEntry, Wave } from '@/lib/types';

const GROUPS = [['cladding', 'Exterior Cladding Services'], ['aluminum', 'Aluminum Work'], ['general', 'General']] as const;
const GENERAL_KINDS = ['shop', 'shop_drawings', 'pm', 'access', 'misc', 'install', 'installation'];

export function defaultGroup(lib: string | null, library: LibraryEntry[]): string {
  const k = (lib || '').toLowerCase();
  const entry = library.find(e => e.id === lib); if (entry?.wave_group) return entry.wave_group;
  if (!k) return 'general';
  if (k.includes('alum')) return 'aluminum';
  if (GENERAL_KINDS.includes(k)) return 'general';
  return 'cladding';
}

export default function WavePanel({ v, library }: { v: JobView; library: LibraryEntry[] }) {
  const { d, calc, api, st, editable } = v;
  const w: Wave = d.job.wave || {};
  const [copied, setCopied] = useState('');
  const [now] = useState(() => Date.now());
  const today = new Date(now).toISOString().slice(0, 10);
  const plus = (days: number) => new Date(now + days * 864e5).toISOString().slice(0, 10);
  const setW = (p: Partial<Wave>) => api.patchJob({ wave: { ...w, ...p } });
  const secs = d.sections.filter(s => !s.proj_off && !s.proj_only && !s.co_id);

  const text = useMemo(() => {
    const out: string[] = [];
    for (const [g, title] of GROUPS) {
      const list = secs.filter(s => (s.wgrp || defaultGroup(s.lib, library)) === g);
      if (!list.length) continue;
      out.push(title.toUpperCase());
      for (const s of list) out.push(`${s.name}\n${(s.ctext || '[client text for this section]').replace(/\{AREA\}/g, s.area ? Number(s.area).toLocaleString('en-CA') : '[area]')}`, '');
    }
    out.push(`TOTAL: ${money(calc.pr.Q)} + HST`, '', 'NOTES');
    const kinds = secs.map(s => (s.lib || '').toLowerCase());
    const excl = st.wave_exclusions.filter(x => !(x === 'Insulation' && kinds.some(k => k.includes('insul'))) && !(/^(Gutters|Downspouts)$/.test(x) && kinds.some(k => k.includes('alum'))));
    out.push(`Exclusions: ${excl.join(', ')}.`, '', w.notes || st.wave_terms);
    return out.join('\n');
  }, [secs, library, calc.pr.Q, st, w.notes]);

  const blanks = (text.match(/\[[^\]]+\]/g) || []).length;
  const ready = !blanks && !!w.customer && calc.pr.Q > 0;
  const copy = async (t: string, msg: string) => { await navigator.clipboard.writeText(t); setCopied(msg); setTimeout(() => setCopied(''), 2500); };
  const fillFromLibrary = () => { for (const s of secs) if (!s.ctext) { const e = library.find(x => x.id === s.lib); if (e?.ctext) api.patchSection(s.id, { ctext: e.ctext }); } };

  return (
    <details className="rounded-lg border-2 border-[#2c5f5d] bg-[var(--surface)] px-5 py-3 text-sm">
      <summary className="cursor-pointer text-lg font-semibold display">Send to Wave · {secs.length} items · {money(calc.pr.Q)}</summary>
      <div className="space-y-2 pt-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-gray-500 col-span-3">Customer<TextInput disabled={!editable} value={w.customer ?? d.job.client ?? ''} onChange={customer => setW({ customer })} /></label>
        <label className="text-xs text-gray-500">Date<input type="date" className="input" disabled={!editable} value={w.date || today} onChange={e => setW({ date: e.target.value })} /></label>
        <label className="text-xs text-gray-500">Expires<input type="date" className="input" disabled={!editable} value={w.expiry || plus(st.quote_valid_days)} onChange={e => setW({ expiry: e.target.value })} /></label>
      </div>
      <details><summary className="cursor-pointer text-xs text-gray-600">Section groups</summary>
        {secs.map(s => (
          <div key={s.id} className="flex items-center gap-2 text-xs py-0.5"><span className="flex-1">{s.name}</span>
            <select className="input w-auto py-0" disabled={!editable} value={s.wgrp || defaultGroup(s.lib, library)} onChange={e => api.patchSection(s.id, { wgrp: e.target.value })}>
              {GROUPS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>))}
      </details>
      <label className="text-xs text-gray-500 block">Notes / terms (blank = company default)<TextInput multiline disabled={!editable} value={w.notes ?? ''} onChange={notes => setW({ notes })} /></label>
      <pre className="whitespace-pre-wrap text-xs bg-slate-50 border rounded p-2 max-h-72 overflow-y-auto">{text.split(/(\[[^\]]+\])/).map((part, i) => /^\[.*\]$/.test(part) ? <mark key={i} className="bg-yellow-200">{part}</mark> : part)}</pre>
      <div className="flex flex-wrap gap-2 items-center">
        {editable && <button className="btn-sm" onClick={fillFromLibrary}>Fill empty sections from the library wording</button>}
        <button className="btn-primary" disabled={!ready} title={ready ? '' : 'Fill the highlighted blanks, the customer and the price first'} onClick={() => copy(text, 'Copied, paste it into Wave')}>Copy finished text</button>
        <button className="btn" onClick={() => copy(text, 'Copied with blanks')}>Copy now, finish in Wave</button>
        <span className="text-xs text-green-700">{copied}</span>
        {blanks > 0 && <span className="text-xs text-amber-700">{blanks} blank{blanks > 1 ? 's' : ''} to fill</span>}
      </div>
      </div>
    </details>
  );
}
