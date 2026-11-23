'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { newId, slug } from '@/lib/calc';
import { LINE_ROLES, LINE_TYPES, type LibItem, type LibraryEntry, type LibPreset } from '@/lib/types';
import { useApp } from '@/components/AuthGate';
import NumInput from '@/components/NumInput';
import TextInput from '@/components/TextInput';

function ItemsEditor({ items, onChange, disabled }: { items: LibItem[]; onChange: (i: LibItem[]) => void; disabled: boolean }) {
  const set = (i: number, p: Partial<LibItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-1">
      <table className="w-full"><thead><tr><th className="th">Line</th><th className="th w-28">Type</th><th className="th w-24">Role</th><th className="th w-20">Unit</th><th className="th w-24">Default qty</th><th className="th w-24">Default rate</th><th className="w-16"></th></tr></thead>
        <tbody>{items.map((it, i) => (
          <tr key={i}>
            <td className="td"><TextInput disabled={disabled} value={it.name} onChange={name => set(i, { name })} /></td>
            <td className="td"><select className="input" disabled={disabled} value={it.type} onChange={e => set(i, { type: e.target.value as LibItem['type'] })}>{LINE_TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
            <td className="td"><select className="input" disabled={disabled} value={it.role || ''} onChange={e => set(i, { role: (e.target.value || null) as LibItem['role'] })}><option value="">—</option>{LINE_ROLES.map(r => <option key={r}>{r}</option>)}</select></td>
            <td className="td"><TextInput disabled={disabled} value={it.unit} onChange={unit => set(i, { unit })} /></td>
            <td className="td"><NumInput disabled={disabled} value={it.qty ?? null} onChange={qty => set(i, { qty })} /></td>
            <td className="td"><NumInput disabled={disabled} value={it.rate ?? null} onChange={rate => set(i, { rate })} /></td>
            <td className="td whitespace-nowrap">{!disabled && <>
              <button className="text-xs" onClick={() => { if (i) { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); } }}>↑</button>
              <button className="text-red-500 ml-2" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button></>}</td>
          </tr>))}</tbody></table>
      {!disabled && <button className="btn-sm" onClick={() => onChange([...items, { name: '', type: 'Material', role: null, rate: null }])}>+ Line</button>}
    </div>
  );
}

export default function LibraryPage() {
  const { can } = useApp(); const canEdit = can('library', 'edit');
  const [lib, setLib] = useState<LibraryEntry[]>([]); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const load = () => supabase.from('library').select('*').order('pos').then(({ data }) => setLib(data || []));
  useEffect(() => { load(); }, []);
  const save = async (e: LibraryEntry, p: Partial<LibraryEntry>) => {
    setLib(l => l.map(x => (x.id === e.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from('library').update(p).eq('id', e.id); setMsg(error ? error.message : 'Saved'); setTimeout(() => setMsg(''), 1500);
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= lib.length) return;
    const n = [...lib]; [n[i], n[j]] = [n[j], n[i]]; setLib(n);
    await Promise.all(n.map((e, k) => supabase.from('library').update({ pos: k }).eq('id', e.id)));
  };
  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex items-center gap-2"><h1 className="text-xl font-semibold mr-auto">Section library</h1><span className="text-sm text-green-700">{msg}</span>
        {canEdit && <button className="btn-primary" onClick={async () => {
          const name = prompt('Section button name'); if (!name) return; const id = slug(name) || newId('lib');
          const { error } = await supabase.from('library').insert({ id, name, pos: lib.length, items: [] }); if (error) return setMsg(error.message); await load(); setOpen(id);
        }}>+ New section button</button>}</div>
      <p className="text-sm text-gray-600">These are the buttons that add a section to an estimate. The id (e.g. <code>acm</code>, <code>install</code>, <code>pm</code>, <code>subtrades</code>) is the section kind used by the pricing rules in Settings.</p>
      {lib.map((e, i) => (
        <div key={e.id} className="card p-0">
          <div className="flex items-center gap-2 px-3 py-2">
            <button className="w-5 text-gray-500" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? '▾' : '▸'}</button>
            <span className="font-medium">{e.name}</span><code className="text-xs text-gray-500">{e.id}</code>
            <span className="text-xs text-gray-500">{e.items.length} lines{e.presets?.length ? ` · ${e.presets.length} presets` : ''}</span>
            {canEdit && <span className="ml-auto flex gap-1"><button className="btn-sm" onClick={() => move(i, -1)}>↑</button><button className="btn-sm" onClick={() => move(i, 1)}>↓</button>
              <button className="btn-sm text-red-600" onClick={async () => { if (confirm(`Delete the "${e.name}" button? Existing estimates are not affected.`)) { await supabase.from('library').delete().eq('id', e.id); load(); } }}>Delete</button></span>}
          </div>
          {open === e.id && <div className="border-t p-3 space-y-3">
            <div className="grid sm:grid-cols-4 gap-2">
              <label className="text-sm">Name<TextInput disabled={!canEdit} value={e.name} onChange={name => save(e, { name })} /></label>
              <label className="text-sm">Markup default<select className="input" disabled={!canEdit} value={e.mk || ''} onChange={ev => save(e, { mk: (ev.target.value || null) as 'Y' | 'N' | null })}><option value="">Auto (by kind)</option><option value="Y">Markup</option><option value="N">No markup</option></select></label>
              <label className="text-sm">Sheet SF<NumInput disabled={!canEdit} value={e.sheet_sqft} onChange={sheet_sqft => save(e, { sheet_sqft })} /></label>
              <label className="text-sm">Wave group<select className="input" disabled={!canEdit} value={e.wave_group || ''} onChange={ev => save(e, { wave_group: ev.target.value || null })}><option value="">Auto</option><option value="cladding">Exterior Cladding Services</option><option value="aluminum">Aluminum Work</option><option value="general">General</option></select></label>
            </div>
            <label className="text-sm block">Default client text ({'{AREA}'} = section area)<TextInput multiline disabled={!canEdit} value={e.ctext} onChange={ctext => save(e, { ctext })} /></label>
            <ItemsEditor disabled={!canEdit} items={e.items} onChange={items => save(e, { items })} />
            <div className="space-y-2 pt-2 border-t">
              <div className="text-sm font-medium">Presets</div>
              {(e.presets || []).map((p, k) => {
                const setP = (q: Partial<LibPreset>) => save(e, { presets: e.presets.map((x, j) => (j === k ? { ...x, ...q } : x)) });
                return <div key={p.id} className="border rounded p-2 space-y-2">
                  <div className="flex gap-2 items-center"><TextInput disabled={!canEdit} value={p.name} onChange={name => setP({ name })} />
                    <NumInput className="w-28" disabled={!canEdit} placeholder="Sheet SF" value={p.sheetSqft ?? null} onChange={sheetSqft => setP({ sheetSqft })} />
                    {canEdit && <button className="text-red-500" onClick={() => save(e, { presets: e.presets.filter((_, j) => j !== k) })}>×</button>}</div>
                  <ItemsEditor disabled={!canEdit} items={p.items || []} onChange={items => setP({ items })} />
                </div>;
              })}
              {canEdit && <button className="btn-sm" onClick={() => save(e, { presets: [...(e.presets || []), { id: newId('pre'), name: 'New preset', items: [...e.items] }] })}>+ Preset (copies the lines above)</button>}
            </div>
          </div>}
        </div>))}
      {!lib.length && <div className="card text-sm text-gray-500">No section buttons yet. Import the old hub&apos;s export to bring them over, or add them here.</div>}
    </div>
  );
}
