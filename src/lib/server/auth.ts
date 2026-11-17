import { createClient } from '@supabase/supabase-js';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** A Supabase client acting as the signed-in caller (RLS applies), plus their role. */
export async function caller(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const sb = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await sb.auth.getUser(token); if (!u.user) return null;
  const { data: role } = await sb.rpc('my_role');
  return role ? { sb, user: u.user, role: role as string } : null;
}
export const json = (body: unknown, status = 200) => Response.json(body, { status });
