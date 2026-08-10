create extension if not exists pgcrypto;

create table if not exists public.demo_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  timezone text not null default 'Europe/Madrid',
  duration_minutes integer not null default 30,
  name text not null,
  email text not null,
  phone text,
  company text,
  product_interest text,
  message text,
  calendar_event_id text,
  calendar_event_link text,
  meet_link text,
  calendar_sync_status text not null default 'not_configured' check (calendar_sync_status in ('not_configured', 'synced', 'failed')),
  calendar_sync_error text,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  source text not null default 'web-demo-booking',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists demo_bookings_active_slot_unique
  on public.demo_bookings (slot_start)
  where status in ('pending', 'confirmed');

create index if not exists demo_bookings_slot_start_idx
  on public.demo_bookings (slot_start);

alter table public.demo_bookings
  add column if not exists calendar_event_id text,
  add column if not exists calendar_event_link text,
  add column if not exists meet_link text,
  add column if not exists calendar_sync_status text not null default 'not_configured',
  add column if not exists calendar_sync_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'demo_bookings_calendar_sync_status_check'
  ) then
    alter table public.demo_bookings
      add constraint demo_bookings_calendar_sync_status_check
      check (calendar_sync_status in ('not_configured', 'synced', 'failed'));
  end if;
end $$;

alter table public.demo_bookings enable row level security;

drop policy if exists "No public read access to demo bookings" on public.demo_bookings;
drop policy if exists "No public write access to demo bookings" on public.demo_bookings;

create policy "No public read access to demo bookings"
  on public.demo_bookings
  for select
  using (false);

create policy "No public write access to demo bookings"
  on public.demo_bookings
  for all
  using (false)
  with check (false);
