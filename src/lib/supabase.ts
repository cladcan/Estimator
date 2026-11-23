import { createBrowserClient } from '@supabase/ssr';
/** The URL hash as the page opened, read before the client starts: invite and reset links put their tokens here. */
export const initialHash = typeof window === 'undefined' ? '' : window.location.hash;
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || 'missing-key'
);
/** Run a query and throw on error so callers can show it. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p; if (error) throw new Error(error.message); return data as T;
}
