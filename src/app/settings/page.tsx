'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp, toEmail, toUser } from '@/components/AuthGate';
import type { Role, Settings } from '@/lib/types';
import NumInput from '@/components/NumInput';

const NUMS: [keyof Settings, string][] = [
  ['markup_pct', 'Default markup % (new jobs)'], ['contingency_pct', 'Default contingency % (new jobs)'], ['commission_pct', 'Default commission % (new jobs)'],
  ['wsib_pct', 'WSIB % (when the line is blank)'], ['tax_pct', 'Tax % (HST default)'], ['cut_bend_offset', 'Cut & bend = fab rate minus ($)'], ['quote_valid_days', 'Quote valid for (days)'],
];
const LISTS: [keyof Settings, string][] = [
  ['markup_default_kinds', 'Section kinds marked up by default'], ['no_markup_kinds', 'Section kinds never marked up'],
  ['finished_face_kinds', 'Finished-face section kinds (count in job area)'], ['wsib_base_kinds', 'Section kinds whose lines go into the WSIB base'],
  ['wave_exclusions', 'Wave exclusions list'],
];

export default function SettingsPage() {
  const { settings, reloadSettings, isOwner, email } = useApp();
  const [s, setS] = useState<Settings>(settings);
  const [msg, setMsg] = useState('');
  const [members, setMembers] = useState<{ email: string; role: Role }[]>([]);
  const [nu, setNu] = useState({ user: '', password: '', role: 'editor' as Role });
  useEffect(() => setS(settings), [settings]);
  const loadMembers = () => supabase.from('members').select('*').order('email').then(({ data }) => setMembers(data || []));
  useEffect(() => { loadMembers(); }, []);
  if (!isOwner) return <div className="card">Only the owner can change settings.</div>;

  const save = async () => {
    const { error } = await supabase.from('settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? error.message : 'Saved'); if (!error) reloadSettings(); setTimeout(() => setMsg(''), 3000);
  };
  const createUser = async () => {
    const { data: ss } = await supabase.auth.getSession();
    const r = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ss.session?.access_token}` },
      body: JSON.stringify({ email: toEmail(nu.user), password: nu.password, role: nu.role }) });
    const j = await r.json().catch(() => ({})); setMsg(r.ok ? `Created ${nu.user}` : j.error || r.statusText);
    if (r.ok) { setNu({ user: '', password: '', role: 'editor' }); loadMembers(); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <section className="card space-y-3">
        <h2 className="font-semibold">Rates and defaults</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {NUMS.map(([k, l]) => <label key={k} className="text-sm">{l}<NumInput value={s[k] as number | null} onChange={x => setS({ ...s, [k]: x ?? (k === 'commission_pct' ? null : 0) })} /></label>)}
        </div>
        {LISTS.map(([k, l]) => <label key={k} className="text-sm block">{l} <span className="text-xs text-gray-500">(comma separated)</span>
          <input className="input" value={(s[k] as string[]).join(', ')} onChange={e => setS({ ...s, [k]: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></label>)}
        <label className="text-sm block">Default Wave notes / terms<textarea className="input" rows={5} value={s.wave_terms} onChange={e => setS({ ...s, wave_terms: e.target.value })} /></label>
        <h3 className="font-semibold pt-2">monday.com</h3>
        <p className="text-xs text-gray-500">The API key itself is kept on the server (MONDAY_API_KEY in Vercel). Column ids are found in monday under each column&apos;s menu → &quot;Copy column ID&quot;.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">Jobs board id<input className="input" value={s.monday_board_id || ''} onChange={e => setS({ ...s, monday_board_id: e.target.value || null })} /></label>
          {['client', 'phase', 'priority', 'owner', 'drive', 'quoted', 'estimate'].map(c => (
            <label key={c} className="text-sm">{c} column id<input className="input" value={s.monday_columns[c] || ''} onChange={e => setS({ ...s, monday_columns: { ...s.monday_columns, [c]: e.target.value } })} /></label>))}
        </div>
        <button className="btn-primary" onClick={save}>Save settings</button> <span className="text-sm text-green-700">{msg}</span>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">People</h2>
        <table className="w-full"><thead><tr><th className="th">User</th><th className="th">Role</th><th></th></tr></thead><tbody>
          {members.map(m => <tr key={m.email} className="border-t"><td className="td">{toUser(m.email)}</td>
            <td className="td"><select className="input w-auto" value={m.role} disabled={m.email === email} onChange={async e => { await supabase.from('members').update({ role: e.target.value }).eq('email', m.email); loadMembers(); }}>
              {['owner', 'editor', 'viewer'].map(r => <option key={r}>{r}</option>)}</select></td>
            <td className="td">{m.email !== email && <button className="text-red-600 text-sm" onClick={async () => { if (confirm(`Remove ${toUser(m.email)}'s access?`)) { await supabase.from('members').delete().eq('email', m.email); loadMembers(); } }}>Remove access</button>}</td></tr>)}
        </tbody></table>
        <div className="grid sm:grid-cols-4 gap-2 items-end">
          <label className="text-sm">Username<input className="input" value={nu.user} onChange={e => setNu({ ...nu, user: e.target.value })} /></label>
          <label className="text-sm">Password<input className="input" type="text" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} /></label>
          <label className="text-sm">Role<select className="input" value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value as Role })}>{['owner', 'editor', 'viewer'].map(r => <option key={r}>{r}</option>)}</select></label>
          <button className="btn-primary" disabled={!nu.user || nu.password.length < 8} onClick={createUser}>Add person</button>
        </div>
        <p className="text-xs text-gray-500">Passwords need at least 8 characters. Usernames sign in as username@{process.env.NEXT_PUBLIC_USERNAME_DOMAIN || 'hub.cladcan.ca'}; no email is sent.</p>
      </section>
    </div>
  );
}
