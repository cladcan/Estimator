import { supabase } from './supabase';
import type { Settings, Section } from './pricing';

export const DEFAULT_SETTINGS: Settings = { markup_pct: 23, contingency_pct: 0, commission_pct: 0, wsib_pct: 4, hst_pct: 13, cut_bend_offset: 1 };

export async function loadSettings(): Promise<Settings> {
  const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
}

export async function loadSections(jobId: string): Promise<Section[]> {
  const { data } = await supabase.from('sections').select('*, line_items(*)').eq('job_id', jobId).order('sort');
  return (data || []).map((s: Section) => ({ ...s, line_items: [...(s.line_items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)) }));
}
