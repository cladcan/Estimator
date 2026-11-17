'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/calc';
import { unitPrice } from '@/lib/catalog';
import type { CatalogItem } from '@/lib/types';

export default function CatalogPicker({ onPick, onClose, title = 'Add from catalogue' }: { onPick: (c: CatalogItem, tier: string, all: CatalogItem[]) => void; onClose: () => void; title?: string }) {
  const [items, setItems] = useState<CatalogItem[]>([]); const [q, setQ] = useState('');
  useEffect(() => { supabase.from('catalog').select('*').order('name').then(({ data }) => setItems(data || [])); }, []);
  const list = items.filter(c => [c.name, c.brand, c.supplier, c.category].join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-5 space-y-3 mt-10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2"><h2 className="text-lg font-semibold mr-auto">{title}</h2><button className="btn" onClick={onClose}>Close</button></div>
        <input className="input" autoFocus placeholder="Search product, brand, supplier or category" value={q} onChange={e => setQ(e.target.value)} />
        <div className="max-h-[60vh] overflow-y-auto divide-y border rounded">
          {list.map(c => (
            <div key={c.id} className="p-2 text-sm">
              <div className="font-medium">{c.name} <span className="text-gray-500 font-normal">· {[c.brand, c.supplier, c.category].filter(Boolean).join(' · ')}</span></div>
              <div className="flex flex-wrap gap-1 mt-1">{(c.tiers || []).map(t => (
                <button key={t.tier} className="btn-sm" onClick={() => onPick(c, t.tier, items)}>{t.tier}: {money(unitPrice(c, t))}/{c.use_unit || c.sell_unit}</button>))}
                {!c.tiers?.length && <span className="text-xs text-gray-400">No prices</span>}</div>
            </div>))}
          {!list.length && <div className="p-3 text-sm text-gray-500">No products. Add them on the Catalogue page.</div>}
        </div>
      </div>
    </div>
  );
}
