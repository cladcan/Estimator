'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase, initialHash } from '@/lib/supabase';
import { DEFAULT_SETTINGS, AREAS, type Access, type Area, type Level, type Role, type Settings } from '@/lib/types';

type Ctx = { email: string; role: Role; access: Access; can: (area: Area, level: Exclude<Level, 'none'>) => boolean; isOwner: boolean; settings: Settings; reloadSettings: () => Promise<void> };
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;
const DOMAIN = process.env.NEXT_PUBLIC_USERNAME_DOMAIN || 'hub.cladcan.ca';
export const toEmail = (u: string) => (u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@${DOMAIN}`);
export const toUser = (e: string) => (e.endsWith('@' + DOMAIN) ? e.split('@')[0] : e);

// Invite and reset links land here with tokens (or an error) in the URL hash.
const hashParams = new URLSearchParams(initialHash.replace(/^#/, ''));
const linkType = hashParams.get('type'); // 'invite' | 'recovery' | 'magiclink' | 'signup'
const linkError = hashParams.get('error_description');

const areaOf = (path: string): Area | 'settings' => path.startsWith('/catalogue') ? 'catalogue' : path.startsWith('/library') ? 'library' : path.startsWith('/settings') ? 'settings' : 'jobs';
const PAGES: Record<Area, string> = { jobs: '/', catalogue: '/catalogue', library: '/library' };

function SetPassword({ email, fresh, onDone }: { email: string; fresh: boolean; onDone: () => void }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form className="bg-white shadow rounded-lg p-6 w-full max-w-sm space-y-3" onSubmit={async e => {
        e.preventDefault(); setErr('');
        if (pw.length < 8) return setErr('Use at least 8 characters.');
        if (pw !== pw2) return setErr('The two passwords don\'t match.');
        setBusy(true); const { error } = await supabase.auth.updateUser({ password: pw }); setBusy(false);
        if (error) setErr(error.message); else onDone();
      }}>
        <h1 className="text-2xl font-semibold">{fresh ? 'Welcome to the Estimating Hub' : 'Choose a new password'}</h1>
        <p className="text-sm text-gray-600">{fresh ? 'Choose a password for ' : 'Signed in as '}<b>{toUser(email)}</b>. You&apos;ll sign in with {email.endsWith('@' + DOMAIN) ? 'that username' : 'this email'} and the password from now on.</p>
        <input className="input" type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
        <input className="input" type="password" placeholder="Type it again" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [access, setAccess] = useState<Access | null>(null);
  const [needPassword, setNeedPassword] = useState(linkType === 'invite' || linkType === 'recovery');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const reloadSettings = async () => { const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle(); if (data) setSettings({ ...DEFAULT_SETTINGS, ...data }); };
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setNeedPassword(true); });
    (async () => {
      // The browser client only reads PKCE links, so take invite/reset tokens from the hash ourselves.
      const at = hashParams.get('access_token'), rt = hashParams.get('refresh_token');
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (linkError) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const { data: g } = await supabase.auth.getSession(); setSession(g.session);
    })();
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setRole(session === null ? null : undefined); return; }
    Promise.all([supabase.rpc('my_role'), supabase.rpc('my_access_all')]).then(([r, a]) => {
      const rl = (r.data as Role) || null;
      // Before add-team-access.sql is run, my_access_all doesn't exist: fall back to the role.
      const fb: Access = { jobs: rl === 'viewer' ? 'view' : 'edit', catalogue: rl === 'viewer' ? 'view' : 'edit', library: rl === 'viewer' ? 'view' : 'edit' };
      setAccess(a.error || !a.data ? fb : (a.data as Access)); setRole(rl);
    });
    reloadSettings();
  }, [session]);

  if (session === undefined || (session && role === undefined)) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!session) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form className="bg-white shadow rounded-lg p-6 w-full max-w-sm space-y-3" onSubmit={async e => {
        e.preventDefault(); setErr(''); setBusy(true);
        const r = await supabase.auth.signInWithPassword({ email: toEmail(user), password: pw });
        setBusy(false); if (r.error) setErr(r.error.message === 'Invalid login credentials' ? 'Wrong username or password.' : r.error.message);
      }}>
        <h1 className="text-2xl font-semibold">CladCan Estimating Hub</h1>
        <input className="input" placeholder="Username" autoComplete="username" value={user} onChange={e => setUser(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {linkError && <p className="text-sm text-amber-700">That link didn&apos;t work ({linkError.toLowerCase()}). Ask your admin for a new one.</p>}
        <p className="text-xs text-gray-500">Accounts are set up by the admin. Forgot your password? Ask the admin for a reset link.</p>
      </form>
    </div>
  );
  const email = session.user.email || '';
  if (needPassword) return <SetPassword email={email} fresh={linkType === 'invite'} onDone={() => setNeedPassword(false)} />;
  if (!role) return (
    <div className="min-h-screen flex items-center justify-center p-4"><div className="card text-center space-y-3">
      <h1 className="font-semibold">No access yet</h1><p className="text-sm text-gray-600">Signed in as {toUser(email)}. Ask the owner to add you.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
  );
  const acc = access!;
  const can = (a: Area, lvl: 'view' | 'edit') => acc[a] === 'edit' || (lvl === 'view' && acc[a] === 'view');
  const ctx: Ctx = { email, role, access: acc, can, isOwner: role === 'owner', settings, reloadSettings };
  const area = areaOf(pathname || '/');
  const allowed = area === 'settings' ? role === 'owner' : can(area, 'view');
  const firstOpen = AREAS.find(a => can(a.id, 'view'));
  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen">
        <header className="border-b border-[var(--line)] bg-[var(--surface)] print:hidden">
          <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center gap-5 text-sm">
            <Link href="/" className="display font-semibold text-lg">CladCan Estimating Hub</Link>
            {AREAS.filter(a => can(a.id, 'view')).map(a => <Link key={a.id} href={PAGES[a.id]} className="opacity-80 hover:opacity-100">{a.label}</Link>)}
            {role === 'owner' && <Link href="/settings" className="opacity-80 hover:opacity-100">Settings</Link>}
            <span className="ml-auto opacity-70 hidden sm:inline">{toUser(email)}{role === 'owner' ? ' · admin' : ''}</span>
            <button onClick={() => supabase.auth.signOut()} className="opacity-80 hover:opacity-100">Sign out</button>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto p-4">{allowed ? children : (
          <div className="card space-y-2"><h1 className="font-semibold">You don&apos;t have access to this page</h1>
            <p className="text-sm text-gray-600">Ask the admin if you need it.</p>
            {firstOpen && <Link className="btn inline-block" href={PAGES[firstOpen.id]}>Go to {firstOpen.label}</Link>}</div>)}</main>
      </div>
    </AppCtx.Provider>
  );
}
