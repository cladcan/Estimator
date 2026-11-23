-- One-off fix for "function crypt(text, text) does not exist" when starting or reopening a project.
-- Supabase installs pgcrypto in the "extensions" schema, but these functions only looked in "public".
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
create extension if not exists pgcrypto with schema extensions;
alter function start_project(text, text, numeric) set search_path = public, extensions;
alter function reopen_estimate(text, text) set search_path = public, extensions;
alter function import_pin(text, text) set search_path = public, extensions;
