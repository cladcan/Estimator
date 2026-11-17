'use client';
import { useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { money, sectionCost, sheetCalc, type LineItem, type Section, type Settings } from '@/lib/pricing';
import type { RateItem, SectionType } from '@/lib/types';

type Props = { jobId: string; sections: Section[]; setSections: (s: Section[]) => void; reload: () => void; settings: Settings; types: SectionType[]; rates: RateItem[]; locked: boolean };
const SHEET_TYPES = ['acm', 'siding', 'metal', 'panel'];

export default function EstimateTab({ jobId, sections, setSections, reload, settings, types, rates, locked }: Props) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounce = (key: string, fn: () => void) => { clearTimeout(timers.current[key]); timers.current[key] = setTimeout(fn, 500); };

  const patchSection = (si: number, p: Partial<Section>) => {
    const s = { ...sections[si], ...p }; const next = [...sections]; next[si] = s; setSections(next);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { line_items, ...row } = p as Section;
    if (Object.keys(row).length) debounce('s' + s.id, () => supabase.from('sections').update(row).eq('id', s.id!).then());
  };
  const patchItem = (si: number, li: number, p: Partial<LineItem>) => {
    const items = [...sections[si].line_items]; items[li] = { ...items[li], ...p };
    const next = [...sections]; next[si] = { ...sections[si], line_items: items }; setSections(next);
    debounce('l' + items[li].id, () => supabase.from('line_items').update(p).eq('id', items[li].id!).then());
  };
  const addSection = async (typeId: string) => {
    const t = types.find(x => x.id === typeId); if (!t) return;
    await supabase.from('sections').insert({ job_id: jobId, section_type_id: t.id, name: t.name, sort: sections.length });
    reload();
  };
  const addItem = async (s: Section, rateId?: string) => {
    const r = rates.find(x => x.id === rateId);
    await supabase.from('line_items').insert({ section_id: s.id, sort: s.line_items.length,
      ...(r ? { description: r.description, unit: r.unit, unit_cost: r.unit_cost, is_labour: r.is_labour } : {}) });
    reload();
  };

  return (
    <div className="space-y-4">
      {sections.map((s, si) => {
        const c = sectionCost(s, settings);
        const typeName = (types.find(t => t.id === s.section_type_id)?.name || '').toLowerCase();
        const hasSheets = SHEET_TYPES.some(k => typeName.includes(k)) || s.fab_sf > 0 || s.sheet_count > 0;
        const sc = sheetCalc(s, settings);
        return (
          <div key={s.id} className="card space-y-3">
            <div className="flex items-center gap-2">
              <input className="input font-semibold max-w-xs" value={s.name} disabled={locked} onChange={e => patchSection(si, { name: e.target.value })} />
              <span className="text-xs text-gray-500">{types.find(t => t.id === s.section_type_id)?.name}</span>
              <span className="ml-auto font-semibold">{money(c.total)}</span>
              {!locked && <button className="text-red-600 text-sm" onClick={async () => { if (confirm('Remove section?')) { await supabase.from('sections').delete().eq('id', s.id!); reload(); } }}>Remove</button>}
            </div>
            {hasSheets && (
              <div className="bg-slate-50 rounded p-3 grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {([['fab_sf', 'Fab SF'], ['cut_bend_sf', 'Cut & bend SF'], ['fab_rate', 'Fab rate $/SF'], ['sheet_count', 'Sheets'], ['sheet_w_in', 'Sheet W (in)'], ['sheet_l_in', 'Sheet L (in)']] as const).map(([k, l]) => (
                  <label key={k}>{l}<input className="input" type="number" step="any" disabled={locked} value={s[k]} onChange={e => patchSection(si, { [k]: Number(e.target.value) })} /></label>
                ))}
                <div className="col-span-full text-gray-600 flex flex-wrap gap-x-6">
                  <span>Sheet area {sc.sheetArea.toFixed(1)} SF</span><span>Wastage {sc.wastageSf.toFixed(1)} SF{sc.sheetArea ? ` (${(sc.wastageSf / sc.sheetArea * 100).toFixed(1)}%)` : ''}</span>
                  <span>Cut & bend rate {money(sc.cutBendRate)}/SF</span><span>Fab {money(sc.fabCost)}</span><span>C&B {money(sc.cutBendCost)}</span>
                </div>
              </div>
            )}
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Description</th><th className="th w-24">Qty</th><th className="th w-20">Unit</th><th className="th w-28">Unit cost</th><th className="th w-14">Lab.</th><th className="th w-28 text-right">Total</th><th className="w-8"></th></tr></thead>
              <tbody>
                {s.line_items.map((li, i) => (
                  <tr key={li.id} className="border-t">
                    <td className="td"><input className="input" disabled={locked} value={li.description} onChange={e => patchItem(si, i, { description: e.target.value })} /></td>
                    <td className="td"><input className="input" type="number" step="any" disabled={locked} value={li.qty} onChange={e => patchItem(si, i, { qty: Number(e.target.value) })} /></td>
                    <td className="td"><input className="input" disabled={locked} value={li.unit} onChange={e => patchItem(si, i, { unit: e.target.value })} /></td>
                    <td className="td"><input className="input" type="number" step="any" disabled={locked} value={li.unit_cost} onChange={e => patchItem(si, i, { unit_cost: Number(e.target.value) })} /></td>
                    <td className="td text-center"><input type="checkbox" disabled={locked} checked={li.is_labour} onChange={e => patchItem(si, i, { is_labour: e.target.checked })} /></td>
                    <td className="td text-right">{money(li.qty * li.unit_cost)}</td>
                    <td className="td">{!locked && <button className="text-red-600" onClick={async () => { await supabase.from('line_items').delete().eq('id', li.id!); reload(); }}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              {!locked && <>
                <button className="btn" onClick={() => addItem(s)}>Add line</button>
                <select className="input w-auto" value="" onChange={e => addItem(s, e.target.value)}>
                  <option value="">Add from rate book…</option>
                  {rates.filter(r => !r.section_type_id || r.section_type_id === s.section_type_id).map(r => <option key={r.id} value={r.id}>{r.description} ({money(r.unit_cost)}/{r.unit})</option>)}
                </select>
              </>}
              <span className="ml-auto">Material {money(c.material)} · Labour {money(c.labour)} · WSIB {money(c.wsib)}</span>
            </div>
          </div>
        );
      })}
      {!locked && (
        <select className="input w-auto" value="" onChange={e => addSection(e.target.value)}>
          <option value="">+ Add section…</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  );
}
