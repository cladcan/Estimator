'use client';
import { useEffect, useState } from 'react';
export default function TextInput({ value, onChange, className = '', disabled, placeholder, multiline }: { value: string | null | undefined; onChange: (v: string) => void; className?: string; disabled?: boolean; placeholder?: string; multiline?: boolean }) {
  const [t, setT] = useState(value || ''); const [f, setF] = useState(false);
  useEffect(() => { if (!f) setT(value || ''); }, [value, f]);
  const props = { className: `input ${className}`, disabled, placeholder, value: t, onFocus: () => setF(true),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setT(e.target.value),
    onBlur: () => { setF(false); if (t !== (value || '')) onChange(t); } };
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
