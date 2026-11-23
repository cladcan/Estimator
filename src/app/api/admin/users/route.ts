import { createClient } from '@supabase/supabase-js';
import { caller, json } from '@/lib/server/auth';

const ROLES = ['owner', 'editor', 'viewer'];
const LEVELS = ['edit', 'view', 'none'];
const AREAS = ['jobs', 'catalogue', 'library'];

/**
 * Admin only. Adds a person and their access, then either:
 *  - mode 'invite': emails them an invite link to choose their own password (or, if Supabase can't send it,
 *    returns the link so the admin can pass it on), or
 *  - mode 'password': creates the login with a password the admin chose.
 * mode 'link' returns a fresh set-password link for someone who already exists (forgotten password, expired invite).
 */
export async function POST(req: Request) {
  const c = await caller(req); if (!c || c.role !== 'owner') return json({ error: 'Only an admin can add people' }, 403);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server' }, 500);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const mode = body.mode || (body.password ? 'password' : 'invite');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email or username is needed' }, 400);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const redirectTo = `${new URL(req.url).origin}/`;

  const link = async (type: 'invite' | 'recovery') => {
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo } });
    return error ? { error: error.message } : { link: data.properties.action_link };
  };

  if (mode === 'link') {
    const r = await link('recovery');
    return 'error' in r ? json({ error: r.error }, 400) : json({ ok: true, link: r.link });
  }

  const role = body.role;
  if (!ROLES.includes(role)) return json({ error: 'Pick a role' }, 400);
  const access: Record<string, string> = {};
  for (const a of AREAS) if (LEVELS.includes(body.access?.[a])) access[a] = body.access[a];

  if (mode === 'password') {
    const password = String(body.password || '');
    if (password.length < 8) return json({ error: 'Passwords need at least 8 characters' }, 400);
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !/already/i.test(error.message)) return json({ error: error.message }, 400);
  }

  // Add their access before inviting, so they can get in as soon as they open the link.
  const { error: e2 } = await c.sb.from('members').upsert({ email, role, access });
  if (e2) return json({ error: e2.message }, 400);
  if (mode === 'password') return json({ ok: true });

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!error) return json({ ok: true, emailed: true });
  // Already has a login: give a set-password link instead. Email not sent (Supabase's built-in mailer only
  // reaches the project team and is rate limited): give the invite link for the admin to pass on.
  const r = await link(/already|registered|exists/i.test(error.message) ? 'recovery' : 'invite');
  if ('error' in r) return json({ error: `${error.message}; ${r.error}` }, 400);
  return json({ ok: true, emailed: false, link: r.link, reason: error.message });
}
