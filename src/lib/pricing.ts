// Pricing engine. All percentages are whole numbers (23 = 23%).
// Formula order is a best guess until the spec confirms it; every rate is configurable.

export type Settings = {
  markup_pct: number; contingency_pct: number; commission_pct: number;
  wsib_pct: number; hst_pct: number; cut_bend_offset: number;
};
export type LineItem = { id?: string; description: string; qty: number; unit: string; unit_cost: number; is_labour: boolean; sort?: number };
export type Section = {
  id?: string; name: string; section_type_id: string | null; sort?: number;
  fab_sf: number; cut_bend_sf: number; sheet_count: number; sheet_w_in: number; sheet_l_in: number; fab_rate: number;
  line_items: LineItem[];
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function sheetCalc(s: Pick<Section, 'fab_sf' | 'cut_bend_sf' | 'sheet_count' | 'sheet_w_in' | 'sheet_l_in' | 'fab_rate'>, st: Settings) {
  const sheetArea = n(s.sheet_count) * (n(s.sheet_w_in) * n(s.sheet_l_in)) / 144;
  const wastageSf = Math.max(0, sheetArea - n(s.fab_sf) - n(s.cut_bend_sf));
  const cutBendRate = Math.max(0, n(s.fab_rate) - n(st.cut_bend_offset));
  const fabCost = n(s.fab_sf) * n(s.fab_rate);
  const cutBendCost = n(s.cut_bend_sf) * cutBendRate;
  return { sheetArea, wastageSf, cutBendRate, fabCost, cutBendCost, total: fabCost + cutBendCost };
}

export function sectionCost(s: Section, st: Settings) {
  let material = 0, labour = 0;
  for (const li of s.line_items) {
    const c = n(li.qty) * n(li.unit_cost);
    if (li.is_labour) labour += c; else material += c;
  }
  const sheet = sheetCalc(s, st);
  material += sheet.total;
  const wsib = labour * n(st.wsib_pct) / 100;
  return { material, labour, wsib, sheet, total: material + labour + wsib };
}

export type JobPricingInput = { markup_pct: number | null; contingency_pct: number | null; commission_pct: number | null; discount: number; area_sf: number };

export function jobPricing(job: JobPricingInput, sections: Section[], st: Settings) {
  const bySection = sections.map(s => ({ name: s.name, section_type_id: s.section_type_id, ...sectionCost(s, st) }));
  const cost = bySection.reduce((a, b) => a + b.total, 0);
  const markupPct = job.markup_pct ?? st.markup_pct;
  const contPct = job.contingency_pct ?? st.contingency_pct;
  const commPct = job.commission_pct ?? st.commission_pct;
  const markup = cost * n(markupPct) / 100;
  const contingency = cost * n(contPct) / 100;
  const commission = (cost + markup + contingency) * n(commPct) / 100;
  const discount = n(job.discount);
  const quoted = cost + markup + contingency + commission - discount;
  const perSf = n(job.area_sf) > 0 ? quoted / n(job.area_sf) : 0;
  const hst = quoted * n(st.hst_pct) / 100;
  const margin = quoted - cost;
  return { bySection, cost, markupPct, contPct, commPct, markup, contingency, commission, discount, quoted, perSf, hst, totalWithHst: quoted + hst, margin, marginPct: quoted ? margin / quoted * 100 : 0 };
}

export const money = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
