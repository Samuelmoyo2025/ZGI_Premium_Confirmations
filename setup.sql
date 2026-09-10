-- Minisure/Alertsure Premium Confirmation Tool — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- Already ran a previous version of this file? Skip to the MIGRATION block at the bottom instead.

create extension if not exists pgcrypto;

-- One row per upload batch (one bord file/sheet for one month+currency)
create table if not exists bord_uploads (
  id uuid primary key default gen_random_uuid(),
  period text not null,          -- e.g. 'June 2026'
  month text not null,           -- e.g. 'June'
  year int not null,             -- e.g. 2026
  currency text not null default 'USD',
  category text,                 -- 'Comprehensive' or 'Third Party'
  source_file text,
  row_count int not null default 0,
  uploaded_by text,              -- email of whoever uploaded it
  uploaded_at timestamptz not null default now()
);

-- One row per policy/premium line from a bord
create table if not exists bord_entries (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references bord_uploads(id) on delete cascade,
  period text not null,
  month text not null,
  year int not null,
  currency text not null default 'USD',
  client_raw text not null,      -- e.g. 'T. Machiridza AEM9817' (name + reg, as in the bord)
  office text,
  class text,
  category text,                 -- 'Comprehensive' or 'Third Party'
  amount numeric,
  date_paid date,
  payment_method text,
  basic_premium numeric,
  reinsurance_status text not null default '100% Retained',
  uploaded_at timestamptz not null default now()
);

-- One row per sign-in, upload, bord removal, or a search that came up empty
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_email text,
  detail text,
  created_at timestamptz not null default now(),
  constraint audit_log_event_type_check check (event_type in ('sign_in','upload','delete_upload','not_found'))
);

-- Search performance: case-insensitive substring search on client name/reg
create extension if not exists pg_trgm;
create index if not exists bord_entries_client_trgm on bord_entries using gin (client_raw gin_trgm_ops);

create index if not exists bord_entries_period_idx on bord_entries (period, currency);
create index if not exists bord_entries_category_idx on bord_entries (category);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- Row Level Security:
-- - Only signed-in users (created under Authentication > Users) can read anything.
-- - Only moyos@zimnat.co.zw can upload, edit, or remove bords, or view the audit trail.
--   Everyone else (Claims) can search/read, and can sign in / log a "not found" event,
--   but cannot touch the data itself or see who else has been doing what.
-- Change the email below if the Finance admin account ever changes.
alter table bord_uploads enable row level security;
alter table bord_entries enable row level security;
alter table audit_log enable row level security;

create policy "authenticated read uploads" on bord_uploads
  for select to authenticated using (true);
create policy "admin insert uploads" on bord_uploads
  for insert to authenticated with check (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
create policy "admin update uploads" on bord_uploads
  for update to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
create policy "admin delete uploads" on bord_uploads
  for delete to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');

create policy "authenticated read entries" on bord_entries
  for select to authenticated using (true);
create policy "admin insert entries" on bord_entries
  for insert to authenticated with check (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
create policy "admin update entries" on bord_entries
  for update to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
create policy "admin delete entries" on bord_entries
  for delete to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');

create policy "admin read audit" on audit_log
  for select to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
create policy "authenticated insert audit" on audit_log
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------
-- Adding people who can use the tool:
-- Supabase Dashboard → Authentication → Users → Add user.
-- Enter their email + a password, and tick "Auto Confirm User" so they
-- can sign in immediately without an email confirmation step.
-- That user list IS your access control — add or remove people there.
-- Everyone gets search access; only moyos@zimnat.co.zw gets Finance/Admin access.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- MIGRATION: already had this tool set up before today's admin-restriction
-- update? Run this block instead of everything above.
-- ---------------------------------------------------------------
-- alter table bord_uploads add column if not exists category text;
-- alter table bord_entries add column if not exists category text;
--
-- create table if not exists audit_log (
--   id uuid primary key default gen_random_uuid(),
--   event_type text not null,
--   user_email text,
--   detail text,
--   created_at timestamptz not null default now(),
--   constraint audit_log_event_type_check check (event_type in ('sign_in','upload','delete_upload','not_found'))
-- );
-- create index if not exists audit_log_created_idx on audit_log (created_at desc);
-- alter table audit_log enable row level security;
--
-- -- If audit_log already existed without 'not_found' allowed as an event type:
-- alter table audit_log drop constraint if exists audit_log_event_type_check;
-- alter table audit_log add constraint audit_log_event_type_check check (event_type in ('sign_in','upload','delete_upload','not_found'));
--
-- -- Replace any older open (anyone-can-write) policies with the admin-restricted
-- -- ones below — safe to run even if some of these don't exist yet:
-- drop policy if exists "anon full access uploads" on bord_uploads;
-- drop policy if exists "anon full access entries" on bord_entries;
-- drop policy if exists "authenticated full access uploads" on bord_uploads;
-- drop policy if exists "authenticated full access entries" on bord_entries;
-- drop policy if exists "authenticated read audit" on audit_log;
--
-- create policy "authenticated read uploads" on bord_uploads for select to authenticated using (true);
-- create policy "admin insert uploads" on bord_uploads for insert to authenticated with check (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
-- create policy "admin update uploads" on bord_uploads for update to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
-- create policy "admin delete uploads" on bord_uploads for delete to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
--
-- create policy "authenticated read entries" on bord_entries for select to authenticated using (true);
-- create policy "admin insert entries" on bord_entries for insert to authenticated with check (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
-- create policy "admin update entries" on bord_entries for update to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
-- create policy "admin delete entries" on bord_entries for delete to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
--
-- create policy "admin read audit" on audit_log for select to authenticated using (auth.jwt() ->> 'email' = 'moyos@zimnat.co.zw');
