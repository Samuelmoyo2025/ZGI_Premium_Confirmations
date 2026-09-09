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

-- One row per sign-in, upload, or bord removal — the access/audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('sign_in','upload','delete_upload')),
  user_email text,
  detail text,
  created_at timestamptz not null default now()
);

-- Search performance: case-insensitive substring search on client name/reg
create extension if not exists pg_trgm;
create index if not exists bord_entries_client_trgm on bord_entries using gin (client_raw gin_trgm_ops);

create index if not exists bord_entries_period_idx on bord_entries (period, currency);
create index if not exists bord_entries_category_idx on bord_entries (category);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- Row Level Security: only signed-in users (created under Authentication > Users)
-- can read or write anything. There is no anonymous/public access.
alter table bord_uploads enable row level security;
alter table bord_entries enable row level security;
alter table audit_log enable row level security;

create policy "authenticated full access uploads" on bord_uploads
  for all to authenticated using (true) with check (true);

create policy "authenticated full access entries" on bord_entries
  for all to authenticated using (true) with check (true);

create policy "authenticated read audit" on audit_log
  for select to authenticated using (true);

create policy "authenticated insert audit" on audit_log
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------
-- Adding people who can use the tool:
-- Supabase Dashboard → Authentication → Users → Add user.
-- Enter their email + a password, and tick "Auto Confirm User" so they
-- can sign in immediately without an email confirmation step.
-- That user list IS your access control — add or remove people there.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- MIGRATION: already ran an earlier version of this schema (no login,
-- or no category column)? Run this block instead of everything above.
-- ---------------------------------------------------------------
-- alter table bord_uploads add column if not exists category text;
-- alter table bord_entries add column if not exists category text;
--
-- create table if not exists audit_log (
--   id uuid primary key default gen_random_uuid(),
--   event_type text not null check (event_type in ('sign_in','upload','delete_upload')),
--   user_email text,
--   detail text,
--   created_at timestamptz not null default now()
-- );
-- create index if not exists audit_log_created_idx on audit_log (created_at desc);
-- alter table audit_log enable row level security;
-- create policy "authenticated read audit" on audit_log for select to authenticated using (true);
-- create policy "authenticated insert audit" on audit_log for insert to authenticated with check (true);
--
-- -- Replace the old open-to-anyone policies with authenticated-only ones —
-- -- this is the step that actually requires login from now on:
-- drop policy if exists "anon full access uploads" on bord_uploads;
-- drop policy if exists "anon full access entries" on bord_entries;
-- create policy "authenticated full access uploads" on bord_uploads for all to authenticated using (true) with check (true);
-- create policy "authenticated full access entries" on bord_entries for all to authenticated using (true) with check (true);
