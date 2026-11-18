-- CladCan Estimator database. Paste into the Supabase SQL editor and run.
-- Safe to run again: it only creates what is missing and replaces functions/policies.

create extension if not exists pgcrypto;

-- ───────── Members and roles ─────────
create table if not exists members (
  email text primary key,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz default now()
);

create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from members where lower(email) = lower(auth.jwt() ->> 'email')
$$;
create or replace function is_member() returns boolean language sql stable as $$ select my_role() is not null $$;
create or replace function can_edit() returns boolean language sql stable as $$ select my_role() in ('owner','editor') $$;
create or replace function is_owner() returns boolean language sql stable as $$ select my_role() = 'owner' $$;

-- ───────── Company settings (one row) ─────────
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  markup_pct numeric not null default 23,
  contingency_pct numeric not null default 0,
  commission_pct numeric,
  wsib_pct numeric not null default 4,
  tax_pct numeric not null default 13,
  cut_bend_offset numeric not null default 1,
  quote_valid_days int not null default 30,
  markup_default_kinds text[] not null default array['install','installation','pm','shop','shop_drawings'],
  no_markup_kinds text[] not null default array['subtrades'],
  finished_face_kinds text[] not null default array['acm','siding','aluminum'],
  wsib_base_kinds text[] not null default array['pm','shop','shop_drawings'],
  wave_exclusions text[] not null default array['Taxes','Demolition','Caulking','Insulation','Carpentry','Parapet caps','Soffit strapping','Roofing','Gutters','Downspouts','Scuppers and caps','Vents','Electrical','Permits','Engineering','Traffic officer','Hoarding'],
  wave_terms text not null default 'Price assumes the substrate is ready and accessible when we arrive.
Panel layout to be confirmed on approved shop drawings.
Final quantities to be confirmed by site measurement.
Payment terms: as per contract, net 30 days from invoice.',
  monday_board_id text,
  monday_columns jsonb not null default '{}'::jsonb,
  username_domain text not null default 'hub.cladcan.ca',
  updated_at timestamptz default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- ───────── Section library ─────────
create table if not exists library (
  id text primary key,
  name text not null,
  pos numeric not null default 0,
  mk text check (mk in ('Y','N')),
  items jsonb not null default '[]'::jsonb,        -- [{name,type,role,rate}]
  sheet_sqft numeric,
  ctext text,
  wave_group text,                                   -- cladding | aluminum | general
  presets jsonb not null default '[]'::jsonb,        -- [{id,name,items,sheetSqft,ctext}]
  raw jsonb
);

-- ───────── Catalogue ─────────
create table if not exists brands (id text primary key, name text not null);
create table if not exists suppliers (id text primary key, name text not null);
create table if not exists catalog (
  id text primary key,
  name text not null,
  brand text, supplier text, category text,
  sell_unit text, use_unit text check (use_unit in ('SF','LF','pc')),
  pack jsonb not null default '{}'::jsonb,           -- {qty, lenFt, sf}
  tiers jsonb not null default '[]'::jsonb,          -- [{tier, price, source}]
  increase_pct numeric, increase_from date,
  accessories jsonb not null default '[]'::jsonb,    -- [{catId|name, role, qtyPer, rate, type}]
  notes text,
  raw jsonb,
  updated_at timestamptz default now()
);
create table if not exists catalog_log (
  id bigint generated always as identity primary key,
  at timestamptz default now(), by_email text, item_id text, change text, data jsonb
);

-- ───────── monday leads cache ─────────
create table if not exists leads (
  id text primary key, name text, client text, phase text, priority text, owner text,
  url text, contact_id text, drive text, updated_at timestamptz, data jsonb
);

-- ───────── Jobs ─────────
create sequence if not exists job_ref_seq;
create table if not exists jobs (
  id text primary key,
  ref text unique,
  name text not null,
  client text,
  estimate_no text,                                  -- Wave estimate #
  scope text not null default 'supply_install',
  monday_id text, monday_url text, monday_contact_id text, drive text,
  contract numeric not null default 0,
  mode text not null default 'estimation' check (mode in ('estimation','project')),
  pr jsonb not null default '{}'::jsonb,             -- {m,t,c,cm,d,dm,sf,x:[{name,sf}]}
  wave jsonb not null default '{}'::jsonb,           -- {customer,date,expiry,notes,groups}
  quoted numeric not null default 0,
  tax numeric,                                       -- fraction 0..1; null = company default
  started timestamptz, started_by text, pin_hash text, approved_at timestamptz,
  created_at timestamptz default now(), created_by text default (auth.jwt() ->> 'email'),
  updated_at timestamptz default now(), updated_by text
);

create or replace function next_job_ref() returns text language sql volatile security definer set search_path = public as $$
  select 'E-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('job_ref_seq')::text, 3, '0')
$$;

create table if not exists change_orders (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  opened_at timestamptz default now(),
  issued date,
  type text check (type in ('client','internal')),
  price numeric not null default 0,
  note text
);

create table if not exists sections (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  pos numeric not null default 0,
  name text not null,
  lib text,                                          -- library id / kind (acm, install, pm…)
  preset text,
  area numeric,                                      -- section area (SF)
  sheet_sqft numeric,
  mk text check (mk in ('Y','N')),
  fmk numeric, fmkm text not null default 'amt' check (fmkm in ('amt','pct')),
  fin boolean not null default false,
  ctext text,
  wgrp text,
  tier text,
  proj_only boolean not null default false,
  proj_off boolean not null default false,
  co_id text references change_orders(id) on delete cascade,
  act_override numeric
);
create index if not exists sections_job on sections(job_id);

create table if not exists phases (
  id text primary key,
  section_id text not null references sections(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  name text not null,
  pos numeric not null default 0
);

create table if not exists lines (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  section_id text not null references sections(id) on delete cascade,
  kind text not null default 'item' check (kind in ('item','todo')),
  pos numeric not null default 0,
  name text not null default '',
  type text not null default 'Material' check (type in ('Material','Labour','Delivery','Access','Overhead','Other')),
  role text check (role in ('fab','cutbend','sheets','wastage','wsib')),
  est_qty numeric, est_rate numeric, est_amount numeric not null default 0,
  eff_qty numeric, eff_rate numeric,
  bud_qty numeric, bud_rate numeric, budget numeric,
  act_qty numeric, act_rate numeric, act_amount numeric not null default 0, act_date date,
  act_eff_qty numeric, act_eff_rate numeric,
  proj_amount numeric not null default 0,
  mk text check (mk in ('Y','N')),
  phase_id text references phases(id) on delete cascade,
  of_line text references lines(id) on delete cascade,
  proj_only boolean not null default false,
  co_id text references change_orders(id) on delete cascade,
  done boolean not null default false,
  date date,
  custom boolean not null default false,
  cat_id text, tier text, unit text, rate_note text,
  updated_at timestamptz default now()
);
create index if not exists lines_job on lines(job_id);
create index if not exists lines_section on lines(section_id);

create table if not exists costs (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  line_id text not null references lines(id) on delete cascade,
  section_id text references sections(id) on delete cascade,
  type text,
  pos numeric not null default 0,
  name text not null default '',
  qty numeric, rate numeric, amount numeric not null default 0,
  date date
);
create index if not exists costs_job on costs(job_id);

-- Keep lines.proj_amount = act_amount + its breakdown costs.
create or replace function refresh_proj_amount(p_line text) returns void language sql security definer set search_path = public as $$
  update lines l set proj_amount = l.act_amount + coalesce((select sum(amount) from costs c where c.line_id = l.id), 0) where l.id = p_line
$$;
create or replace function trg_line_proj() returns trigger language plpgsql as $$
begin new.proj_amount := coalesce(new.act_amount,0) + coalesce((select sum(amount) from costs c where c.line_id = new.id),0); return new; end $$;
drop trigger if exists line_proj on lines;
create trigger line_proj before insert or update of act_amount on lines for each row execute function trg_line_proj();
create or replace function trg_cost_proj() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform refresh_proj_amount(old.line_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform refresh_proj_amount(new.line_id); end if;
  return null;
end $$;
drop trigger if exists cost_proj on costs;
create trigger cost_proj after insert or update or delete on costs for each row execute function trg_cost_proj();

-- ───────── Start / reopen project (server side, PIN hashed) ─────────
create or replace function start_project(p_job text, p_pin text, p_contract numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_edit() then raise exception 'Not allowed'; end if;
  if coalesce(length(p_pin),0) < 4 then raise exception 'PIN must be at least 4 characters'; end if;
  update lines set bud_qty = coalesce(eff_qty, est_qty), bud_rate = coalesce(eff_rate, est_rate), budget = est_amount
    where job_id = p_job and kind = 'item' and not proj_only and co_id is null and of_line is null;
  update jobs set started = now(), started_by = auth.jwt() ->> 'email', approved_at = now(),
    pin_hash = crypt(p_pin, gen_salt('bf')), mode = 'project', contract = coalesce(p_contract, quoted),
    updated_at = now(), updated_by = auth.jwt() ->> 'email'
    where id = p_job and started is null;
end $$;

create or replace function reopen_estimate(p_job text, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  if not can_edit() then raise exception 'Not allowed'; end if;
  select * into j from jobs where id = p_job;
  if j.started is null then return; end if;
  if j.pin_hash is null or j.pin_hash <> crypt(p_pin, j.pin_hash) then raise exception 'Wrong PIN'; end if;
  if exists (select 1 from lines where job_id = p_job and (act_amount <> 0 or act_qty is not null or act_rate is not null or proj_only or of_line is not null or co_id is not null))
     or exists (select 1 from costs where job_id = p_job)
     or exists (select 1 from phases where job_id = p_job)
     or exists (select 1 from sections where job_id = p_job and (proj_only or co_id is not null))
  then raise exception 'Project already has actuals, phases or change orders; it can''t be reopened'; end if;
  update lines set bud_qty = null, bud_rate = null, budget = null where job_id = p_job;
  update jobs set started = null, started_by = null, pin_hash = null, approved_at = null, mode = 'estimation', updated_at = now() where id = p_job;
end $$;

-- Owner-only: set a job's PIN from an imported plain-text PIN.
create or replace function import_pin(p_job text, p_pin text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Not allowed'; end if;
  update jobs set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_job;
end $$;

-- ───────── Home page totals (computed in the database) ─────────
create or replace view job_totals with (security_invoker = true) as
with live_lines as (
  select l.*, s.act_override, s.proj_off from lines l join sections s on s.id = l.section_id
  left join change_orders co on co.id = coalesce(l.co_id, s.co_id)
  where l.kind = 'item' and (coalesce(l.co_id, s.co_id) is null or co.issued is not null)
),
sec as (
  select l.job_id, l.section_id, max(l.act_override) as act_override,
    sum(case when l.of_line is null and not l.proj_only then coalesce(l.budget, 0) else 0 end) as bud,
    sum(case when l.of_line is null and not l.proj_only then l.est_amount else 0 end) as est,
    sum(l.proj_amount) as act
  from live_lines l group by l.job_id, l.section_id
)
select j.id, j.ref, j.name, j.client, j.estimate_no, j.scope, j.started, j.quoted, j.contract,
  case when j.started is not null then coalesce(sum(sec.bud),0) else coalesce(sum(sec.est),0) end as budget,
  case when j.started is not null then coalesce(sum(coalesce(sec.act_override, sec.act)),0) else 0 end as actual,
  j.contract + coalesce((select sum(price) from change_orders c where c.job_id = j.id and c.issued is not null and c.type = 'client'),0) as contract_total
from jobs j left join sec on sec.job_id = j.id group by j.id;

create or replace view category_totals with (security_invoker = true) as
select l.type,
  sum(case when l.of_line is null and not l.proj_only then coalesce(l.budget,0) else 0 end) as budget,
  sum(l.proj_amount) as actual
from lines l join jobs j on j.id = l.job_id and j.started is not null
join sections s on s.id = l.section_id
left join change_orders co on co.id = coalesce(l.co_id, s.co_id)
where l.kind = 'item' and (coalesce(l.co_id, s.co_id) is null or co.issued is not null)
group by l.type;

-- ───────── Row-level security ─────────
do $$ declare t text; begin
  foreach t in array array['settings','library','brands','suppliers','catalog','catalog_log','leads','jobs','change_orders','sections','phases','lines','costs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_members on %I', t);
    execute format('drop policy if exists write_editors on %I', t);
    execute format('create policy read_members on %I for select to authenticated using (is_member())', t);
    execute format('create policy write_editors on %I for all to authenticated using (can_edit()) with check (can_edit())', t);
  end loop;
end $$;
-- Company settings: only the owner can change them.
drop policy if exists write_editors on settings;
drop policy if exists write_owner on settings;
create policy write_owner on settings for all to authenticated using (is_owner()) with check (is_owner());

alter table members enable row level security;
drop policy if exists members_read on members;
drop policy if exists members_owner on members;
create policy members_read on members for select to authenticated using (is_member());
create policy members_owner on members for all to authenticated using (is_owner()) with check (is_owner());

-- Signed-in users get table access; the row rules above decide what each role can actually do.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant usage on sequence job_ref_seq to authenticated;
grant execute on function next_job_ref, start_project, reopen_estimate, my_role, import_pin to authenticated;

-- ───────── Live updates ─────────
do $$ declare t text; begin
  foreach t in array array['jobs','sections','lines','costs','phases','change_orders'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ───────── First owner ─────────
-- After creating your own user in Supabase (Authentication → Users), run:
--   insert into members (email, role) values ('jeff@hub.cladcan.ca', 'owner');

-- ───────── Starter section buttons (skipped if they already exist; an import of the old hub replaces them) ─────────
insert into library (id, name, pos, items, sheet_sqft, wave_group) values
 ('acm','ACM',1,'[{"name":"Sheets","type":"Material","role":"sheets"},{"name":"Fabrication","type":"Material","role":"fab"},{"name":"Cut & bend","type":"Material","role":"cutbend"},{"name":"Wastage","type":"Material","role":"wastage"},{"name":"Extrusions / clips","type":"Material"},{"name":"Fasteners & sealant","type":"Material"}]',50,'cladding'),
 ('siding','Siding & Cladding',2,'[{"name":"Siding panels","type":"Material"},{"name":"Trims & accessories","type":"Material"},{"name":"Fasteners","type":"Material"}]',null,'cladding'),
 ('aluminum','Aluminum Work',3,'[{"name":"Aluminum material","type":"Material"},{"name":"Fabrication","type":"Labour"}]',null,'aluminum'),
 ('barriers','Air & Weather Barriers',4,'[{"name":"Membrane","type":"Material"},{"name":"Tapes & primers","type":"Material"}]',null,'cladding'),
 ('flashing','Flashing & Trims',5,'[{"name":"Flashing","type":"Material"},{"name":"Trims","type":"Material"}]',null,'cladding'),
 ('insulation','Insulation',6,'[{"name":"Insulation boards","type":"Material"},{"name":"Fasteners","type":"Material"}]',null,'cladding'),
 ('strapping','Strapping & Subframing',7,'[{"name":"Girts / hat channels","type":"Material"},{"name":"Clips","type":"Material"},{"name":"Fasteners","type":"Material"}]',null,'cladding'),
 ('shop','Shop Drawings',8,'[{"name":"Shop drawings","type":"Labour"}]',null,'general'),
 ('pm','Project Management',9,'[{"name":"Project management","type":"Labour"},{"name":"Site visits","type":"Labour"}]',null,'general'),
 ('access','Access & Equipment',10,'[{"name":"Lift / boom rental","type":"Access"},{"name":"Scaffold","type":"Access"},{"name":"Delivery of equipment","type":"Delivery"}]',null,'general'),
 ('misc','Miscellaneous Materials & Expenses',11,'[{"name":"Consumables","type":"Material"},{"name":"Disposal bin","type":"Other"},{"name":"Parking / permits","type":"Other"}]',null,'general'),
 ('install','Installation',12,'[{"name":"Installation labour","type":"Labour"},{"name":"WSIB","type":"Overhead","role":"wsib"}]',null,'general'),
 ('subtrades','Subcontracted Trades',13,'[{"name":"Subcontractor","type":"Other"}]',null,'general')
on conflict (id) do nothing;
