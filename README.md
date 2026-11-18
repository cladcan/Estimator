# CladCan Estimating Hub

CladCan's own job hub: estimates built from sections, the pricing panel, a budget lock with "Start project", then actual costs, phases and change orders. It also has the section library, the catalogue, Send to Wave text, a monday.com link, and export and import (including the old hub's export file).

Stack: Next.js on Vercel, Supabase (Postgres, auth, realtime). Roles (owner, editor, viewer) are enforced in the database.

## Setup
1. Supabase → SQL Editor → paste `supabase/schema.sql` → Run.
2. Supabase → Authentication → Users → Add user: `yourname@hub.cladcan.ca` and a password (tick "auto confirm").
   Then in the SQL Editor: `insert into members (email, role) values ('yourname@hub.cladcan.ca', 'owner');`
3. Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, used so the owner can add people from Settings)
   - `MONDAY_API_KEY` (optional, for the monday link)
4. Sign in with the username only (e.g. `yourname`).

## Development
`npm install`, `cp .env.example .env.local`, `npm run dev`. Formula tests: `npx tsx --test tests/calc.test.ts`.

## Decisions taken where the old hub was unclear
- Pricing defaults: markup 23%, contingency 0%, both editable in Settings.
- Wastage never goes below 0. WSIB stays a per-section line, as in the old hub.
- Commission is a % of cost, as in the old hub. It can also be a fixed $ amount.
- A job's tax can be set to 0% for exempt work.
- Estimate numbers come from a database sequence (E-YYYY-NNN).
- Subtrades are never marked up, and their markup toggle is hidden.
- Custom phase names are kept when another phase is removed.
- The PIN is stored hashed.
- Home page totals are computed in the database and use the section actual override.
- No client data is shipped in the public page.
