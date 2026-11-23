-- Keep tax out of actual costs.
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- costs.amount stays the pre-tax amount, so every actual total, trigger and view keeps
-- working unchanged. Two new columns:
--   tax_in  true when the qty × rate typed was the receipt total with tax included
--   tax     the tax part taken out of that total (shown, never counted as actual cost)
--
-- Every existing cost gets tax_in = false and tax = 0, so nothing already entered changes.
-- That includes the 21 "[purchases]" entries, which were imported before HST and must
-- not be reduced again. New costs added in the app start with "incl. HST" ticked.

alter table costs add column if not exists tax_in boolean not null default false;
alter table costs add column if not exists tax numeric not null default 0;

-- ── Optional: existing costs that were typed WITH tax ──
-- Step 1, look first. Lists costs that are not "[purchases]" imports and still count at face value:
--
--   select c.id, j.name as project, c.name, c.qty, c.rate, c.amount, c.date
--   from costs c join jobs j on j.id = c.job_id
--   where not c.tax_in and c.name not ilike '%[purchases]%'
--   order by j.name, c.date;
--
-- Step 2, only if every row listed was a tax-included receipt, take 13% HST out of them:
--
--   update costs set
--     tax_in = true,
--     amount = round(coalesce(qty,0) * coalesce(rate,0) / 1.13, 2),
--     tax    = round(coalesce(qty,0) * coalesce(rate,0), 2) - round(coalesce(qty,0) * coalesce(rate,0) / 1.13, 2)
--   where not tax_in and name not ilike '%[purchases]%';
--
-- Or fix them one at a time by ticking "incl. HST" on each cost in the app.
