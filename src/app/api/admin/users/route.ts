import { createClient } from '@supabase/supabase-js';
import { caller, json } from '@/lib/server/auth';

export async function POST(req: Request) {
  const c = await caller(req); if (!c || c.role !== 'owner') return json({ error: 'Only the owner can add people' }, 403);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server' }, 500);
  const { email, password, role } = await req.json();
  if (!email || !password || password.length < 8 || !['owner', 'editor', 'viewer'].includes(role)) return json({ error: 'Username, an 8+ character password and a role are needed' }, 400);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already/i.test(error.message)) return json({ error: error.message }, 400);
  const { error: e2 } = await c.sb.from('members').upsert({ email: email.toLowerCase(), role });
  if (e2) return json({ error: e2.message }, 400);
  return json({ ok: true });
}
