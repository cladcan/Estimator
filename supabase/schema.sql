-- CladCan Estimator schema. Paste into Supabase SQL editor and run once.

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  markup_pct numeric not null default 23,
  contingency_pct numeric not null default 0,
  commission_pct numeric not null default 0,
  wsib_pct numeric not null default 4,
  hst_pct numeric not null default 13,
  cut_bend_offset numeric not null default 1,
  updated_at timestamptz default now()
);
insert into settings (id) values (1) on conflict do nothing;

create table if not exists section_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0
);
insert into section_types (name, sort) values
  ('ACM',1),('Siding',2),('Install',3),('Project Management',4),('Shop Drawings',5),('Subtrades',6),('Other',99)
on conflict do nothing;

create table if not exists rate_items (
  id uuid primary key default gen_random_uuid(),
  section_type_id uuid references section_types(id) on delete cascade,
  description text not null,
  unit text not null default 'ea',
  unit_cost numeric not null default 0,
  is_labour boolean not null default false
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  name text not null,
  client text,
  address text,
  status text not null default 'estimate' check (status in ('estimate','active','complete','lost')),
  area_sf numeric default 0,
  markup_pct numeric,
  contingency_pct numeric,
  commission_pct numeric,
  discount numeric not null default 0,
  budget_snapshot jsonb,
  started_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  section_type_id uuid references section_types(id),
  name text not null,
  sort int not null default 0,
  -- sheet / panel inputs (ACM & metal)
  fab_sf numeric default 0,
  cut_bend_sf numeric default 0,
  sheet_count numeric default 0,
  sheet_w_in numeric default 0,
  sheet_l_in numeric default 0,
  fab_rate numeric default 0
);

create table if not exists line_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  description text not null default '',
  qty numeric not null default 0,
  unit text not null default 'ea',
  unit_cost numeric not null default 0,
  is_labour boolean not null default false,
  sort int not null default 0
);

create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  start_date date, end_date date,
  pct_complete numeric not null default 0,
  sort int not null default 0
);

create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  number int,
  description text not null,
  cost numeric not null default 0,
  price numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

create table if not exists actual_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  section_type_id uuid references section_types(id),
  phase_id uuid references phases(id) on delete set null,
  date date default current_date,
  vendor text,
  description text,
  amount numeric not null default 0
);

-- Only signed-in staff can see or change anything.
do $$ declare t text; begin
  foreach t in array array['settings','section_types','rate_items','jobs','sections','line_items','phases','change_orders','actual_costs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
