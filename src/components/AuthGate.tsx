'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SETTINGS, type Role, type Settings } from '@/lib/types';

type Ctx = { email: string; role: Role; canEdit: boolean; isOwner: boolean; settings: Settings; reloadSettings: () => Promise<void> };
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;
const DOMAIN = process.env.NEXT_PUBLIC_USERNAME_DOMAIN || 'hub.cladcan.ca';
export const toEmail = (u: string) => (u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@${DOMAIN}`);
export const toUser = (e: string) => (e.endsWith('@' + DOMAIN) ? e.split('@')[0] : e);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const reloadSettings = async () => { const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle(); if (data) setSettings({ ...DEFAULT_SETTINGS, ...data }); };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setRole(session === null ? null : undefined); return; }
    supabase.rpc('my_role').then(({ data }) => setRole((data as Role) || null));
    reloadSettings();
  }, [session]);

  if (session === undefined || (session && role === undefined)) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form className="bg-white shadow rounded-lg p-6 w-full max-w-sm space-y-3" onSubmit={async e => {
        e.preventDefault(); setErr(''); setBusy(true);
        const r = await supabase.auth.signInWithPassword({ email: toEmail(user), password: pw });
        setBusy(false); if (r.error) setErr(r.error.message === 'Invalid login credentials' ? 'Wrong username or password.' : r.error.message);
      }}>
        <h1 className="text-xl font-semibold">CladCan Estimating Hub</h1>
        <input className="input" placeholder="Username" autoComplete="username" value={user} onChange={e => setUser(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-xs text-gray-500">Accounts are set up by the owner.</p>
      </form>
    </div>
  );
  const email = session.user.email || '';
  if (!role) return (
    <div className="min-h-screen flex items-center justify-center p-4"><div className="card text-center space-y-3">
      <h1 className="font-semibold">No access yet</h1><p className="text-sm text-gray-600">Signed in as {toUser(email)}. Ask the owner to add you.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
  );
  const ctx: Ctx = { email, role, canEdit: role !== 'viewer', isOwner: role === 'owner', settings, reloadSettings };
  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen bg-slate-100">
        <header className="bg-slate-900 text-white print:hidden">
          <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center gap-5 text-sm">
            <Link href="/" className="font-semibold">CladCan Hub</Link>
            <Link href="/" className="opacity-80 hover:opacity-100">Jobs</Link>
            <Link href="/catalogue" className="opacity-80 hover:opacity-100">Catalogue</Link>
            <Link href="/library" className="opacity-80 hover:opacity-100">Library</Link>
            {role === 'owner' && <Link href="/settings" className="opacity-80 hover:opacity-100">Settings</Link>}
            <span className="ml-auto opacity-70 hidden sm:inline">{toUser(email)} · {role}</span>
            <button onClick={() => supabase.auth.signOut()} className="opacity-80 hover:opacity-100">Sign out</button>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto p-4">{children}</main>
      </div>
    </AppCtx.Provider>
  );
}
