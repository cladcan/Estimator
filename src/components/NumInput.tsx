'use client';
import { useEffect, useState } from 'react';
import { evalExpr, fmtN } from '@/lib/calc';

/** Number box that accepts sums like "10+5". Shows an auto value greyed out when blank. */
export default function NumInput({ value, auto, onChange, disabled, className = '', dec = 2, placeholder }: {
  value: number | null | undefined; auto?: number | null; onChange: (v: number | null) => void; disabled?: boolean; className?: string; dec?: number; placeholder?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(value === null || value === undefined ? '' : String(value)); }, [value, focus]);
  const isAuto = (value === null || value === undefined) && auto !== undefined && auto !== null;
  return (
    <input className={`input text-right ${isAuto && !focus ? 'text-gray-400 italic' : ''} ${className}`} disabled={disabled} inputMode="decimal"
      value={focus ? text : isAuto ? fmtN(auto, dec) : value === null || value === undefined ? '' : fmtN(value, dec)}
      placeholder={placeholder}
      onFocus={() => { setFocus(true); setText(value === null || value === undefined ? '' : String(value)); }}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={() => { setFocus(false); const v = text.trim() === '' ? null : evalExpr(text); if (text.trim() !== '' && v === null) return; if (v !== value) onChange(v); }} />
  );
}
