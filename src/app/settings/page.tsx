'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp, toEmail, toUser } from '@/components/AuthGate';
import { AREAS, LEVELS, accessOf, type Access, type Role, type Settings } from '@/lib/types';
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
  useEffect(() => setS(settings), [settings]);
  if (!isOwner) return <div className="card">Only an admin can change settings.</div>;

  const save = async () => {
    const { error } = await supabase.from('settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? error.message : 'Saved'); if (!error) reloadSettings(); setTimeout(() => setMsg(''), 3000);
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

      <People me={email} />
    </div>
  );
}

type Member = { email: string; role: Role; access: Partial<Access> | null };

async function adminCall(body: object) {
  const { data: ss } = await supabase.auth.getSession();
  const r = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ss.session?.access_token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j as { emailed?: boolean; link?: string; reason?: string };
}
/** Role to store alongside the access, so older screens and the database fallback still make sense. */
const roleFor = (admin: boolean, a: Access): Role => admin ? 'owner' : Object.values(a).includes('edit') ? 'editor' : 'viewer';

function AccessPicker({ admin, access, disabled, onChange }: { admin: boolean; access: Access; disabled?: boolean; onChange: (admin: boolean, access: Access) => void }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <label className="text-sm flex items-center gap-1 mr-2"><input type="checkbox" disabled={disabled} checked={admin} onChange={e => onChange(e.target.checked, access)} /> Admin (full access)</label>
      {AREAS.map(a => <label key={a.id} className="text-xs flex items-center gap-1">{a.label}
        <select className="input w-auto py-0.5! text-xs" disabled={disabled || admin} value={admin ? 'edit' : access[a.id]} onChange={e => onChange(false, { ...access, [a.id]: e.target.value })}>
          {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>)}
    </div>
  );
}

function People({ me }: { me: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [link, setLink] = useState<{ who: string; url: string } | null>(null);
  const [nu, setNu] = useState({ user: '', password: '', mode: 'invite' as 'invite' | 'password', admin: false, access: { jobs: 'edit', catalogue: 'view', library: 'view' } as Access });
  const [busy, setBusy] = useState(false);
  const load = () => supabase.from('members').select('*').order('email').then(({ data }) => setMembers((data as Member[]) || []));
  useEffect(() => { load(); }, []);
  const say = (m: string, e = '') => { setMsg(m); setErr(e); };

  const update = async (m: Member, admin: boolean, access: Access) => {
    const { error } = await supabase.from('members').update({ role: roleFor(admin, access), access: admin ? {} : access }).eq('email', m.email);
    if (error) say('', error.message); else { say(`Saved ${toUser(m.email)}`); load(); }
  };
  const add = async () => {
    const email = toEmail(nu.user);
    if (nu.mode === 'invite' && !nu.user.includes('@')) return say('', 'An invite needs their real email address. To use a username instead, choose "Set a password now".');
    setBusy(true); setLink(null);
    try {
      const r = await adminCall({ mode: nu.mode, email, password: nu.password, role: roleFor(nu.admin, nu.access), access: nu.admin ? {} : nu.access });
      if (nu.mode === 'password') say(`Added ${toUser(email)}. Give them their username and password in person or by phone.`);
      else if (r.emailed) say(`Invite emailed to ${email}. They choose their own password from the link.`);
      else { say(`Added ${email}. Supabase couldn't send the email (${r.reason}), so copy the link below and send it to them yourself.`); if (r.link) setLink({ who: email, url: r.link }); }
      setNu({ ...nu, user: '', password: '' }); load();
    } catch (e) { say('', (e as Error).message); }
    setBusy(false);
  };
  const resetLink = async (m: Member) => {
    setLink(null);
    try { const r = await adminCall({ mode: 'link', email: m.email }); if (r.link) setLink({ who: m.email, url: r.link }); say(`Send this link to ${toUser(m.email)}. It lets them choose a new password and works once.`); }
    catch (e) { say('', (e as Error).message); }
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">People and access</h2>
      <p className="text-xs text-gray-500">Admins see everything, including Settings and this list. For everyone else, pick per page: Can edit, View only, or No access (the page is hidden). People with no access to Jobs can&apos;t see any job or its numbers.</p>
      <table className="w-full"><thead><tr><th className="th">Person</th><th className="th">Access</th><th></th></tr></thead><tbody>
        {members.map(m => { const admin = m.role === 'owner'; const a = accessOf(m.role, m.access); return (
          <tr key={m.email} className="border-t align-top"><td className="td">{toUser(m.email)}{m.email === me && <span className="text-xs text-gray-500"> (you)</span>}</td>
            <td className="td"><AccessPicker admin={admin} access={a} disabled={m.email === me} onChange={(ad, ac) => update(m, ad, ac)} /></td>
            <td className="td text-right whitespace-nowrap space-x-2">{m.email !== me && <>
              <button className="text-sm underline" onClick={() => resetLink(m)}>Password link</button>
              <button className="text-red-600 text-sm" onClick={async () => { if (confirm(`Remove ${toUser(m.email)}'s access?`)) { await supabase.from('members').delete().eq('email', m.email); load(); } }}>Remove</button></>}</td></tr>); })}
      </tbody></table>

      <div className="border-t pt-3 space-y-2">
        <h3 className="font-semibold text-sm">Add a person</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={nu.mode === 'invite'} onChange={() => setNu({ ...nu, mode: 'invite' })} /> Email an invite (they choose their password)</label>
          <label className="flex items-center gap-1"><input type="radio" checked={nu.mode === 'password'} onChange={() => setNu({ ...nu, mode: 'password' })} /> Set a password now</label>
        </div>
        <div className="grid sm:grid-cols-3 gap-2 items-end">
          <label className="text-sm">{nu.mode === 'invite' ? 'Email' : 'Username or email'}<input className="input" autoComplete="off" value={nu.user} onChange={e => setNu({ ...nu, user: e.target.value })} /></label>
          {nu.mode === 'password' && <label className="text-sm">Password<input className="input" type="password" autoComplete="new-password" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} /></label>}
        </div>
        <AccessPicker admin={nu.admin} access={nu.access} onChange={(admin, access) => setNu({ ...nu, admin, access })} />
        <button className="btn-primary" disabled={busy || !nu.user || (nu.mode === 'password' && nu.password.length < 8)} onClick={add}>{busy ? 'Adding…' : nu.mode === 'invite' ? 'Add and send invite' : 'Add person'}</button>
        <p className="text-xs text-gray-500">{nu.mode === 'invite' ? 'They get an email with a link to choose a password, then sign in with their email.' : `Passwords need at least 8 characters. A username signs in as username@${process.env.NEXT_PUBLIC_USERNAME_DOMAIN || 'hub.cladcan.ca'}; no email is sent.`}</p>
      </div>
      {(msg || err) && <p className={`text-sm ${err ? 'text-red-600' : 'text-green-700'}`}>{err || msg}</p>}
      {link && <div className="flex gap-2 items-center"><input className="input text-xs" readOnly value={link.url} onFocus={e => e.target.select()} />
        <button className="btn-sm" onClick={() => navigator.clipboard.writeText(link.url)}>Copy</button></div>}
    </section>
  );
}
