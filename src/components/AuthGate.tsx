'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [mode, setMode] = useState<'in' | 'up'>('in');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form className="bg-white shadow rounded-lg p-6 w-full max-w-sm space-y-3" onSubmit={async e => {
        e.preventDefault(); setErr('');
        const r = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw });
        if (r.error) setErr(r.error.message); else if (mode === 'up' && !r.data.session) setErr('Check your email to confirm your account.');
      }}>
        <h1 className="text-xl font-semibold">CladCan Estimator</h1>
        <input className="input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full">{mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="text-sm text-blue-700" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-6 text-sm">
          <Link href="/" className="font-semibold">CladCan Estimator</Link>
          <Link href="/">Jobs</Link>
          <Link href="/settings">Rates &amp; settings</Link>
          <span className="ml-auto opacity-70 hidden sm:inline">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="opacity-80 hover:opacity-100">Sign out</button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4">{children}</main>
    </div>
  );
}
