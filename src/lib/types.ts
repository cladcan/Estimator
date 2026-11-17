export type Job = {
  id: string; job_number: string | null; name: string; client: string | null; address: string | null;
  status: 'estimate' | 'active' | 'complete' | 'lost'; area_sf: number;
  markup_pct: number | null; contingency_pct: number | null; commission_pct: number | null; discount: number;
  budget_snapshot: BudgetSnapshot | null; started_at: string | null; created_at: string;
};
export type BudgetSnapshot = { cost: number; quoted: number; bySection: { name: string; section_type_id: string | null; total: number }[]; locked_at: string };
export type SectionType = { id: string; name: string; sort: number };
export type RateItem = { id: string; section_type_id: string | null; description: string; unit: string; unit_cost: number; is_labour: boolean };
