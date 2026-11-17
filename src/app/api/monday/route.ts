// monday.com link. Needs MONDAY_API_KEY on the server; board and column ids come from Settings.
import { caller, json } from '@/lib/server/auth';

async function monday(query: string, variables: Record<string, unknown> = {}) {
  const key = process.env.MONDAY_API_KEY; if (!key) throw new Error('MONDAY_API_KEY is not set on the server');
  const r = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors?.length || j.error_message) throw new Error(j.errors?.[0]?.message || j.error_message);
  return j.data;
}
type Col = { id: string; text: string | null; value: string | null; linked_item_ids?: string[]; display_value?: string };

/** Pull the Jobs board into the leads table. */
export async function GET(req: Request) {
  const c = await caller(req); if (!c) return json({ error: 'Sign in first' }, 401);
  try {
    const { data: st } = await c.sb.from('settings').select('monday_board_id, monday_columns').eq('id', 1).single();
    if (!st?.monday_board_id) return json({ error: 'Set the monday Jobs board id in Settings first' }, 400);
    const cols = (st.monday_columns || {}) as Record<string, string>;
    const data = await monday(`query ($b: [ID!]) { boards(ids: $b) { items_page(limit: 500) { items { id name url updated_at
      column_values { id text value ... on BoardRelationValue { linked_item_ids display_value } } } } } }`, { b: [st.monday_board_id] });
    const items = data.boards?.[0]?.items_page?.items || [];
    const get = (cv: Col[], k: string) => cv.find(x => x.id === cols[k]);
    const rows = items.map((it: { id: string; name: string; url: string; updated_at: string; column_values: Col[] }) => {
      const cl = get(it.column_values, 'client'); const dr = get(it.column_values, 'drive');
      let drive = dr?.text || null; try { drive = JSON.parse(dr?.value || 'null')?.url || drive; } catch {}
      return { id: it.id, name: it.name, url: it.url, updated_at: it.updated_at,
        client: cl?.display_value || cl?.text || null, contact_id: cl?.linked_item_ids?.[0] || null,
        phase: get(it.column_values, 'phase')?.text || null, priority: get(it.column_values, 'priority')?.text || null,
        owner: get(it.column_values, 'owner')?.text || null, drive, data: null };
    });
    if (rows.length) { const { error } = await c.sb.from('leads').upsert(rows); if (error) throw new Error(error.message); }
    return json({ count: rows.length });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
}

/** Write the quoted price, estimate # and phase back to the job's monday item. */
export async function POST(req: Request) {
  const c = await caller(req); if (!c || c.role === 'viewer') return json({ error: 'Not allowed' }, 403);
  try {
    const { jobId } = await req.json();
    const [{ data: job }, { data: st }] = await Promise.all([c.sb.from('jobs').select('*').eq('id', jobId).single(), c.sb.from('settings').select('monday_board_id, monday_columns').eq('id', 1).single()]);
    if (!job?.monday_id) return json({ error: 'This job is not linked to a monday item' }, 400);
    if (!st?.monday_board_id) return json({ error: 'Set the monday Jobs board id in Settings first' }, 400);
    const cols = (st.monday_columns || {}) as Record<string, string>;
    const vals: Record<string, unknown> = {};
    const price = job.started ? Number(job.contract) : Number(job.quoted);
    if (cols.quoted && price > 0) vals[cols.quoted] = String(price);
    if (cols.estimate && job.estimate_no) vals[cols.estimate] = job.estimate_no;
    const phase = job.started ? 'Won' : job.estimate_no ? 'Quotation / Proposal' : 'Estimation';
    if (cols.phase) vals[cols.phase] = { label: phase };
    await monday(`mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v, create_labels_if_missing: false) { id } }`,
      { b: st.monday_board_id, i: job.monday_id, v: JSON.stringify(vals) });
    return json({ message: `price ${price > 0 ? price.toFixed(2) : 'not sent'}, phase ${phase}` });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
}
