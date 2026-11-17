'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, newId } from '@/lib/calc';
import { unitPrice } from '@/lib/catalog';
import { LINE_TYPES, type Accessory, type CatalogItem, type CatalogTier } from '@/lib/types';
import { useApp } from '@/components/AuthGate';
import NumInput from '@/components/NumInput';
import TextInput from '@/components/TextInput';

type Named = { id: string; name: string };
type Log = { id: number; at: string; by_email: string; item_id: string; change: string };

export default function CataloguePage() {
  const { canEdit, email } = useApp();
  const [items, setItems] = useState<CatalogItem[]>([]); const [brands, setBrands] = useState<Named[]>([]); const [sups, setSups] = useState<Named[]>([]); const [log, setLog] = useState<Log[]>([]);
  const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(null); const [tab, setTab] = useState<'products' | 'lists' | 'log'>('products');
  const load = async () => {
    const [a, b, c, d] = await Promise.all([supabase.from('catalog').select('*').order('name'), supabase.from('brands').select('*').order('name'), supabase.from('suppliers').select('*').order('name'), supabase.from('catalog_log').select('*').order('at', { ascending: false }).limit(200)]);
    setItems(a.data || []); setBrands(b.data || []); setSups(c.data || []); setLog(d.data || []);
  };
  useEffect(() => { load(); }, []);
  const save = async (c: CatalogItem, p: Partial<CatalogItem>, what: string) => {
    setItems(l => l.map(x => (x.id === c.id ? { ...x, ...p } : x)));
    await supabase.from('catalog').update({ ...p, updated_at: new Date().toISOString() }).eq('id', c.id);
    await supabase.from('catalog_log').insert({ by_email: email, item_id: c.id, change: `${c.name}: ${what}`, data: p });
  };
  const list = items.filter(c => [c.name, c.brand, c.supplier, c.category].join(' ').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-4">Catalogue</h1>
        {(['products', 'lists', 'log'] as const).map(t => <button key={t} className={`btn capitalize ${tab === t ? 'bg-slate-900! text-white' : ''}`} onClick={() => setTab(t)}>{t === 'lists' ? 'Brands & suppliers' : t === 'log' ? 'Change log' : 'Products'}</button>)}
        {tab === 'products' && <><input className="input max-w-xs ml-auto" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
          {canEdit && <button className="btn-primary" onClick={async () => { const name = prompt('Product name'); if (!name) return; const id = newId('cat'); await supabase.from('catalog').insert({ id, name, tiers: [{ tier: 'Standard', price: 0 }] }); await load(); setOpen(id); }}>+ Product</button>}</>}
      </div>

      {tab === 'products' && <div className="card p-0 divide-y">
        {list.map(c => (
          <div key={c.id}>
            <button className="w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-wrap gap-x-4 text-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="font-medium">{c.name}</span><span className="text-gray-500">{[c.brand, c.supplier, c.category].filter(Boolean).join(' · ')}</span>
              <span className="ml-auto text-gray-600">{c.tiers.map(t => `${t.tier} ${money(unitPrice(c, t))}/${c.use_unit || c.sell_unit || 'unit'}`).join(' · ')}</span>
              {c.increase_pct && c.increase_from ? <span className="pill bg-amber-100 text-amber-800">+{c.increase_pct}% from {c.increase_from}</span> : null}
            </button>
            {open === c.id && <div className="p-3 bg-slate-50 space-y-3 text-sm">
              <div className="grid sm:grid-cols-4 gap-2">
                <label>Name<TextInput disabled={!canEdit} value={c.name} onChange={name => save(c, { name }, 'name')} /></label>
                <label>Brand<select className="input" disabled={!canEdit} value={c.brand || ''} onChange={e => save(c, { brand: e.target.value || null }, 'brand')}><option value="">—</option>{brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select></label>
                <label>Supplier<select className="input" disabled={!canEdit} value={c.supplier || ''} onChange={e => save(c, { supplier: e.target.value || null }, 'supplier')}><option value="">—</option>{sups.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select></label>
                <label>Category<TextInput disabled={!canEdit} value={c.category} onChange={category => save(c, { category }, 'category')} /></label>
                <label>Sell unit<TextInput disabled={!canEdit} value={c.sell_unit} onChange={sell_unit => save(c, { sell_unit }, 'sell unit')} /></label>
                <label>Use unit<select className="input" disabled={!canEdit} value={c.use_unit || ''} onChange={e => save(c, { use_unit: (e.target.value || null) as CatalogItem['use_unit'] }, 'use unit')}><option value="">same</option><option>SF</option><option>LF</option><option>pc</option></select></label>
                <label>Pack qty<NumInput disabled={!canEdit} value={c.pack?.qty ?? null} onChange={qty => save(c, { pack: { ...c.pack, qty: qty ?? undefined } }, 'pack')} /></label>
                <label>Pack length (ft)<NumInput disabled={!canEdit} value={c.pack?.lenFt ?? null} onChange={lenFt => save(c, { pack: { ...c.pack, lenFt: lenFt ?? undefined } }, 'pack')} /></label>
                <label>Pack SF<NumInput disabled={!canEdit} value={c.pack?.sf ?? null} onChange={sf => save(c, { pack: { ...c.pack, sf: sf ?? undefined } }, 'pack')} /></label>
                <label>Announced increase %<NumInput disabled={!canEdit} value={c.increase_pct} onChange={increase_pct => save(c, { increase_pct }, 'increase')} /></label>
                <label>…from date<input type="date" className="input" disabled={!canEdit} value={c.increase_from || ''} onChange={e => save(c, { increase_from: e.target.value || null }, 'increase date')} /></label>
              </div>
              <div><div className="font-medium">Prices by tier (per sell unit)</div>
                {c.tiers.map((t, i) => { const setT = (p: Partial<CatalogTier>, w: string) => save(c, { tiers: c.tiers.map((x, j) => (j === i ? { ...x, ...p } : x)) }, w); return (
                  <div key={i} className="flex gap-2 items-center py-0.5">
                    <TextInput className="w-40" disabled={!canEdit} value={t.tier} onChange={tier => setT({ tier }, 'tier name')} />
                    <NumInput className="w-28" disabled={!canEdit} value={t.price} onChange={price => setT({ price: price ?? 0 }, `${t.tier} price ${t.price} → ${price}`)} />
                    <TextInput disabled={!canEdit} placeholder="Source (quote #, date)" value={t.source} onChange={source => setT({ source }, 'source')} />
                    <span className="text-gray-500 w-36 text-right">{money(unitPrice(c, t))}/{c.use_unit || c.sell_unit || 'unit'}</span>
                    {canEdit && <button className="text-red-500" onClick={() => save(c, { tiers: c.tiers.filter((_, j) => j !== i) }, `removed tier ${t.tier}`)}>×</button>}
                  </div>); })}
                {canEdit && <button className="btn-sm" onClick={() => save(c, { tiers: [...c.tiers, { tier: 'New tier', price: 0 }] }, 'added tier')}>+ Tier</button>}
              </div>
              <div><div className="font-medium">Accessories</div>
                {(c.accessories || []).map((a, i) => { const setA = (p: Partial<Accessory>) => save(c, { accessories: c.accessories.map((x, j) => (j === i ? { ...x, ...p } : x)) }, 'accessory'); return (
                  <div key={i} className="flex gap-2 items-center py-0.5">
                    <select className="input w-56" disabled={!canEdit} value={a.catId || ''} onChange={e => setA({ catId: e.target.value || undefined })}><option value="">(free text)</option>{items.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                    {!a.catId && <TextInput disabled={!canEdit} placeholder="Name" value={a.name} onChange={name => setA({ name })} />}
                    <select className="input w-32" disabled={!canEdit} value={a.role || ''} onChange={e => setA({ role: e.target.value })}>{['', 'trim', 'fastener', 'clip', 'sealant', 'accessory', 'delivery', 'tool', 'fee'].map(r => <option key={r} value={r}>{r || 'role'}</option>)}</select>
                    <select className="input w-28" disabled={!canEdit} value={a.type || 'Material'} onChange={e => setA({ type: e.target.value as Accessory['type'] })}>{LINE_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                    {!a.catId && <NumInput className="w-24" disabled={!canEdit} placeholder="rate" value={a.rate ?? null} onChange={rate => setA({ rate: rate ?? undefined })} />}
                    {canEdit && <button className="text-red-500" onClick={() => save(c, { accessories: c.accessories.filter((_, j) => j !== i) }, 'removed accessory')}>×</button>}
                  </div>); })}
                {canEdit && <button className="btn-sm" onClick={() => save(c, { accessories: [...(c.accessories || []), { role: 'accessory', type: 'Material' }] }, 'added accessory')}>+ Accessory</button>}
              </div>
              {canEdit && <button className="btn-sm text-red-600" onClick={async () => { if (confirm(`Delete ${c.name}?`)) { await supabase.from('catalog').delete().eq('id', c.id); load(); } }}>Delete product</button>}
            </div>}
          </div>))}
        {!list.length && <div className="p-4 text-sm text-gray-500">No products.</div>}
      </div>}

      {tab === 'lists' && <div className="grid md:grid-cols-2 gap-3">
        {([['brands', brands], ['suppliers', sups]] as const).map(([t, rows]) => (
          <div key={t} className="card space-y-1"><h2 className="font-semibold capitalize">{t}</h2>
            {rows.map(r => <div key={r.id} className="flex gap-2"><TextInput disabled={!canEdit} value={r.name} onChange={name => supabase.from(t).update({ name }).eq('id', r.id).then(load)} />
              {canEdit && <button className="text-red-500" onClick={() => supabase.from(t).delete().eq('id', r.id).then(load)}>×</button>}</div>)}
            {canEdit && <button className="btn-sm" onClick={() => { const name = prompt('Name'); if (name) supabase.from(t).insert({ id: newId(), name }).then(load); }}>+ Add</button>}
          </div>))}
      </div>}

      {tab === 'log' && <div className="card p-0"><table className="w-full"><tbody>
        {log.map(l => <tr key={l.id} className="border-b"><td className="td text-gray-500 w-44">{new Date(l.at).toLocaleString('en-CA')}</td><td className="td w-48">{l.by_email}</td><td className="td">{l.change}</td></tr>)}
      </tbody></table></div>}
    </div>
  );
}
