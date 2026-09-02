-- Minisure/Alertsure Premium Confirmation Tool — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- Already ran the previous version of this file? Skip to the migration note at the bottom instead.

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
  uploaded_by text,
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

-- Search performance: case-insensitive substring search on client name/reg
create extension if not exists pg_trgm;
create index if not exists bord_entries_client_trgm on bord_entries using gin (client_raw gin_trgm_ops);

create index if not exists bord_entries_period_idx on bord_entries (period, currency);
create index if not exists bord_entries_category_idx on bord_entries (category);

-- Row Level Security: open to anyone with the anon key (internal tool, no login).
-- Tighten this later if you add authentication.
alter table bord_uploads enable row level security;
alter table bord_entries enable row level security;

create policy "anon full access uploads" on bord_uploads
  for all using (true) with check (true);

create policy "anon full access entries" on bord_entries
  for all using (true) with check (true);

-- ---------------------------------------------------------------
-- MIGRATION: already ran the previous version of this schema?
-- Run just these two lines and skip everything above.
-- ---------------------------------------------------------------
-- alter table bord_uploads add column if not exists category text;
-- alter table bord_entries add column if not exists category text;
