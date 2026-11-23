export type Role = 'owner' | 'editor' | 'viewer';
export type LineType = 'Material' | 'Labour' | 'Delivery' | 'Access' | 'Overhead' | 'Other';
export const LINE_TYPES: LineType[] = ['Material', 'Labour', 'Delivery', 'Access', 'Overhead', 'Other'];
export type LineRole = 'fab' | 'cutbend' | 'sheets' | 'wastage' | 'wsib' | null;
export const LINE_ROLES: Exclude<LineRole, null>[] = ['fab', 'cutbend', 'sheets', 'wastage', 'wsib'];

export type Settings = {
  markup_pct: number; contingency_pct: number; commission_pct: number | null; wsib_pct: number; tax_pct: number;
  cut_bend_offset: number; quote_valid_days: number;
  markup_default_kinds: string[]; no_markup_kinds: string[]; finished_face_kinds: string[]; wsib_base_kinds: string[];
  wave_exclusions: string[]; wave_terms: string; monday_board_id: string | null; monday_columns: Record<string, string>;
  username_domain: string;
};
export const DEFAULT_SETTINGS: Settings = {
  markup_pct: 23, contingency_pct: 0, commission_pct: null, wsib_pct: 4, tax_pct: 13, cut_bend_offset: 1, quote_valid_days: 30,
  markup_default_kinds: ['install', 'installation', 'pm', 'shop', 'shop_drawings'], no_markup_kinds: ['subtrades'],
  finished_face_kinds: ['acm', 'siding', 'aluminum'], wsib_base_kinds: ['pm', 'shop', 'shop_drawings'],
  wave_exclusions: [], wave_terms: '', monday_board_id: null, monday_columns: {}, username_domain: 'hub.cladcan.ca',
};

export type PR = { m?: number | null; t?: number | null; c?: number | null; cm?: 'pct' | 'amt'; d?: number | null; dm?: 'pct' | 'amt'; sf?: string | null; x?: { name: string; sf: number }[] };
export type Wave = { customer?: string; date?: string; expiry?: string; notes?: string; groups?: Record<string, string> };

export type Job = {
  id: string; ref: string | null; name: string; client: string | null; estimate_no: string | null; scope: string;
  monday_id: string | null; monday_url: string | null; monday_contact_id: string | null; drive: string | null;
  contract: number; mode: 'estimation' | 'project'; pr: PR; wave: Wave; quoted: number; tax: number | null;
  started: string | null; started_by: string | null; approved_at: string | null; created_at: string; updated_at: string; updated_by: string | null;
};
export type ChangeOrder = { id: string; job_id: string; opened_at: string; issued: string | null; type: 'client' | 'internal' | null; price: number; note: string | null };
export type Section = {
  id: string; job_id: string; pos: number; name: string; lib: string | null; preset: string | null; area: number | null; sheet_sqft: number | null;
  mk: 'Y' | 'N' | null; fmk: number | null; fmkm: 'amt' | 'pct'; fin: boolean; ctext: string | null; wgrp: string | null; tier: string | null;
  proj_only: boolean; proj_off: boolean; co_id: string | null; act_override: number | null;
};
export type Phase = { id: string; section_id: string; job_id: string; name: string; pos: number };
export type Line = {
  id: string; job_id: string; section_id: string; kind: 'item' | 'todo'; pos: number; name: string; type: LineType; role: LineRole;
  est_qty: number | null; est_rate: number | null; est_amount: number; eff_qty: number | null; eff_rate: number | null;
  bud_qty: number | null; bud_rate: number | null; budget: number | null;
  act_qty: number | null; act_rate: number | null; act_amount: number; act_date: string | null; act_eff_qty: number | null; act_eff_rate: number | null;
  proj_amount: number; mk: 'Y' | 'N' | null; phase_id: string | null; of_line: string | null; proj_only: boolean; co_id: string | null;
  done: boolean; date: string | null; custom: boolean; cat_id: string | null; tier: string | null; unit: string | null; rate_note: string | null;
};
export type Cost = { id: string; job_id: string; line_id: string; section_id: string | null; type: string | null; pos: number; name: string; qty: number | null; rate: number | null; amount: number; date: string | null;
  /** true = qty × rate was typed as printed on the receipt, tax included; amount is then the pre-tax part. */
  tax_in: boolean;
  /** Tax paid on this cost, kept apart so actuals compare pre-tax against the pre-tax budget. */
  tax: number };

export type LibItem = { name: string; type: LineType; role?: LineRole; rate?: number | null; qty?: number | null; unit?: string | null };
export type LibPreset = { id: string; name: string; items: LibItem[]; sheetSqft?: number | null; ctext?: string | null };
export type LibraryEntry = { id: string; name: string; pos: number; mk: 'Y' | 'N' | null; items: LibItem[]; sheet_sqft: number | null; ctext: string | null; wave_group: string | null; presets: LibPreset[] };

export type CatalogTier = { tier: string; price: number; source?: string };
export type Accessory = { catId?: string; name?: string; role?: string; qtyPer?: number; rate?: number; type?: LineType; unit?: string };
export type CatalogItem = {
  id: string; name: string; brand: string | null; supplier: string | null; category: string | null; sell_unit: string | null; use_unit: 'SF' | 'LF' | 'pc' | null;
  pack: { qty?: number; lenFt?: number; sf?: number }; tiers: CatalogTier[]; increase_pct: number | null; increase_from: string | null; accessories: Accessory[]; notes: string | null;
};
export type Lead = { id: string; name: string | null; client: string | null; phase: string | null; priority: string | null; owner: string | null; url: string | null; contact_id: string | null; drive: string | null; updated_at: string | null };

export const SCOPES: { id: string; label: string }[] = [
  { id: 'supply_install', label: 'Supply and install' },
  { id: 'supply', label: 'Supply only (products)' },
  { id: 'design_supply', label: 'Design and supply' },
  { id: 'install', label: 'Install only (client material)' },
  { id: 'design', label: 'Design only' },
];
export const INSTALL_KINDS = ['install', 'installation', 'access', 'subtrades'];

export type Attachment = {
  id: string; job_id: string; cost_id: string | null; path: string; name: string; mime: string | null; size: number | null;
  supplier: string | null; invoice_no: string | null; date: string | null; amount: number | null; note: string | null; source: string | null;
  created_at: string; created_by: string | null;
};
