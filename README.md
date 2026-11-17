# CladCan Estimator

Job hub for CladCan: estimates built from sections, a pricing panel, budget lock on "Start project", actual costs, phases and change orders.

Stack: Next.js (hosted on Vercel) + Supabase (Postgres + auth).

## Setup
1. Create a Supabase project, open SQL Editor, paste `supabase/schema.sql`, Run.
2. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key.
3. `npm install && npm run dev`.

All rates (markup, contingency, commission, WSIB, HST, cut & bend offset) are editable under **Rates & settings**; jobs can override markup, contingency and commission.
