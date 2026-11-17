'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/data';
import type { Settings } from '@/lib/pricing';
import type { RateItem, SectionType } from '@/lib/types';

const FIELDS: [keyof Settings, string][] = [
  ['markup_pct', 'Default markup %'], ['contingency_pct', 'Default contingency %'], ['commission_pct', 'Default commission %'],
  ['wsib_pct', 'WSIB % (on labour)'], ['hst_pct', 'HST %'], ['cut_bend_offset', 'Cut & bend = fab rate minus ($/SF)'],
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [types, setTypes] = useState<SectionType[]>([]);
  const [rates, setRates] = useState<RateItem[]>([]);
  const [msg, setMsg] = useState('');
  const reload = async () => {
    setS(await loadSettings());
    setTypes((await supabase.from('section_types').select('*').order('sort')).data || []);
    setRates((await supabase.from('rate_items').select('*').order('description')).data || []);
  };
  useEffect(() => { reload(); }, []);

  const saveSettings = async () => {
    const { error } = await supabase.from('settings').upsert({ id: 1, ...s, updated_at: new Date().toISOString() });
    setMsg(error ? error.message : 'Saved'); setTimeout(() => setMsg(''), 2000);
  };
  const saveRate = (r: RateItem) => supabase.from('rate_items').update({ description: r.description, unit: r.unit, unit_cost: r.unit_cost, is_labour: r.is_labour, section_type_id: r.section_type_id }).eq('id', r.id);
  const patchRate = (id: string, p: Partial<RateItem>) => setRates(rs => rs.map(r => r.id === id ? { ...r, ...p } : r));

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">Company rates</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {FIELDS.map(([k, label]) => (
            <label key={k} className="text-sm">{label}
              <input className="input" type="number" step="any" value={s[k]} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <button className="btn-primary" onClick={saveSettings}>Save rates</button> <span className="text-sm text-green-700">{msg}</span>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Section types</h2>
        <div className="flex flex-wrap gap-2">{types.map(t => <span key={t.id} className="px-2 py-1 rounded bg-gray-100 text-sm">{t.name}</span>)}</div>
        <button className="btn" onClick={async () => { const name = prompt('New section type'); if (name) { await supabase.from('section_types').insert({ name, sort: types.length + 1 }); reload(); } }}>Add section type</button>
      </section>

      <section className="card space-y-3 overflow-x-auto">
        <h2 className="font-semibold">Rate book (default line items)</h2>
        <table className="w-full">
          <thead><tr><th className="th">Section</th><th className="th">Description</th><th className="th">Unit</th><th className="th">Unit cost</th><th className="th">Labour</th><th></th></tr></thead>
          <tbody>
            {rates.map(r => (
              <tr key={r.id} className="border-t">
                <td className="td"><select className="input" value={r.section_type_id || ''} onChange={e => patchRate(r.id, { section_type_id: e.target.value || null })} onBlur={() => saveRate(r)}>
                  <option value="">Any</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                <td className="td"><input className="input" value={r.description} onChange={e => patchRate(r.id, { description: e.target.value })} onBlur={() => saveRate(r)} /></td>
                <td className="td w-24"><input className="input" value={r.unit} onChange={e => patchRate(r.id, { unit: e.target.value })} onBlur={() => saveRate(r)} /></td>
                <td className="td w-32"><input className="input" type="number" step="any" value={r.unit_cost} onChange={e => patchRate(r.id, { unit_cost: Number(e.target.value) })} onBlur={() => saveRate(r)} /></td>
                <td className="td"><input type="checkbox" checked={r.is_labour} onChange={e => { const nr = { ...r, is_labour: e.target.checked }; patchRate(r.id, nr); saveRate(nr); }} /></td>
                <td className="td"><button className="text-red-600 text-sm" onClick={async () => { await supabase.from('rate_items').delete().eq('id', r.id); reload(); }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={async () => { await supabase.from('rate_items').insert({ description: 'New item' }); reload(); }}>Add rate item</button>
      </section>
    </div>
  );
}
