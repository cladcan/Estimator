-- Team access: per-person access to Jobs, Catalogue and Library.
-- Paste into Supabase → SQL Editor → Run, after schema.sql. Safe to run more than once.
--
-- members.role 'owner' is an admin: full access, plus Settings and People.
-- Everyone else gets members.access, e.g. {"jobs":"edit","catalogue":"view","library":"none"}.
-- Each area is 'edit', 'view' or 'none'. A missing area falls back to the old role:
-- editor = edit, viewer = view. So existing people keep exactly what they had.

alter table members add column if not exists access jsonb not null default '{}'::jsonb;

-- 'edit' | 'view' | 'none' for the signed-in person in one area.
create or replace function my_access(area text) returns text language sql stable security definer set search_path = public as $$
  select case
    when m.role = 'owner' then 'edit'
    when m.access ->> area in ('edit','view','none') then m.access ->> area
    when m.role = 'editor' then 'edit'
    when m.role = 'viewer' then 'view'
    else 'none' end
  from members m where lower(m.email) = lower(auth.jwt() ->> 'email')
$$;
create or replace function can_read(area text) returns boolean language sql stable as $$ select coalesce(my_access(area), 'none') in ('view','edit') $$;
create or replace function can_write(area text) returns boolean language sql stable as $$ select coalesce(my_access(area), 'none') = 'edit' $$;
-- can_edit() is used by start_project / reopen_estimate and the invoice files: it now means "can edit jobs".
create or replace function can_edit() returns boolean language sql stable as $$ select can_write('jobs') $$;

-- Everything the signed-in person may do, in one call for the app.
create or replace function my_access_all() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('jobs', my_access('jobs'), 'catalogue', my_access('catalogue'), 'library', my_access('library'))
$$;
grant execute on function my_access(text), can_read(text), can_write(text), my_access_all() to authenticated;

-- Jobs and everything inside them: hidden entirely without Jobs access.
do $$ declare t text; begin
  foreach t in array array['leads','jobs','change_orders','sections','phases','lines','costs','attachments'] loop
    execute format('drop policy if exists read_members on %I', t);
    execute format('drop policy if exists write_editors on %I', t);
    execute format('create policy read_members on %I for select to authenticated using (can_read(''jobs''))', t);
    execute format('create policy write_editors on %I for all to authenticated using (can_write(''jobs'')) with check (can_write(''jobs''))', t);
  end loop;
end $$;

-- Catalogue and Library: every member can read them (estimates pick products and sections from them),
-- only people with Edit can change them. "No access" hides the page.
do $$ declare t text; begin
  foreach t in array array['brands','suppliers','catalog','catalog_log'] loop
    execute format('drop policy if exists write_editors on %I', t);
    execute format('create policy write_editors on %I for all to authenticated using (can_write(''catalogue'')) with check (can_write(''catalogue''))', t);
  end loop;
end $$;
drop policy if exists write_editors on library;
create policy write_editors on library for all to authenticated using (can_write('library')) with check (can_write('library'));

-- Invoice files follow Jobs access.
drop policy if exists invoices_read on storage.objects;
create policy invoices_read on storage.objects for select to authenticated using (bucket_id = 'invoices' and public.can_read('jobs'));
