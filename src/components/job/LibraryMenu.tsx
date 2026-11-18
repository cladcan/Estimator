'use client';
import { useEffect, useRef, useState } from 'react';
import type { LibraryEntry } from '@/lib/types';

/** A section button that opens its options: Standard, saved presets, and a box to keep a new option. */
export default function LibraryMenu({ e, onAdd, onNewOption }: { e: LibraryEntry; onAdd: (presetId?: string) => void; onNewOption: (name: string) => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="chip" onClick={() => setOpen(!open)}>+ {e.name} <span className="ml-1 text-xs">▾</span></button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 bg-white border rounded shadow-lg py-1 text-sm">
          <button className="block w-full text-left px-3 py-1.5 hover:bg-slate-100 font-medium" onClick={() => { setOpen(false); onAdd(); }}>Standard</button>
          {(e.presets || []).map(p => <button key={p.id} className="block w-full text-left px-3 py-1.5 hover:bg-slate-100" onClick={() => { setOpen(false); onAdd(p.id); }}>{p.name}</button>)}
          <form className="border-t mt-1 pt-1 px-2 pb-1 flex gap-1" onSubmit={ev => { ev.preventDefault(); if (name.trim()) { onNewOption(name.trim()); setName(''); setOpen(false); } }}>
            <input className="input text-xs" placeholder="New option, e.g. WPC - Fluted" value={name} onChange={ev => setName(ev.target.value)} />
            <button className="btn-sm">Add</button>
          </form>
        </div>
      )}
    </div>
  );
}
