-- Adds invoice storage to an existing estimator database.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

-- ───────── Invoices and receipts (files live in the private "invoices" storage bucket) ─────────
create table if not exists attachments (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  cost_id text references costs(id) on delete set null,   -- the cost entry this invoice backs up, if any
  path text not null unique,                               -- object path in the "invoices" bucket: <job_id>/<id>-<file name>
  name text not null,
  mime text, size bigint,
  supplier text, invoice_no text, date date, amount numeric, note text,
  source text,                                             -- e.g. 'upload' or 'purchases:<purchase id>'
  created_at timestamptz default now(), created_by text default (auth.jwt() ->> 'email')
);
create index if not exists attachments_job on attachments(job_id);

alter table attachments enable row level security;
drop policy if exists read_members on attachments;
drop policy if exists write_editors on attachments;
create policy read_members on attachments for select to authenticated using (is_member());
create policy write_editors on attachments for all to authenticated using (can_edit()) with check (can_edit());
grant select, insert, update, delete on attachments to authenticated;

-- ───────── Invoice files (Supabase Storage) ─────────
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false) on conflict (id) do nothing;
drop policy if exists invoices_read on storage.objects;
drop policy if exists invoices_insert on storage.objects;
drop policy if exists invoices_update on storage.objects;
drop policy if exists invoices_delete on storage.objects;
create policy invoices_read on storage.objects for select to authenticated using (bucket_id = 'invoices' and public.is_member());
create policy invoices_insert on storage.objects for insert to authenticated with check (bucket_id = 'invoices' and public.can_edit());
create policy invoices_update on storage.objects for update to authenticated using (bucket_id = 'invoices' and public.can_edit());
create policy invoices_delete on storage.objects for delete to authenticated using (bucket_id = 'invoices' and public.can_edit());

