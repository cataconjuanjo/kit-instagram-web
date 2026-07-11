-- Fase 7.4 - Rutina y entrega del resumen semanal.
-- Ejecutar despues de `supabase/add_weekly_executive_summaries.sql`.

create table if not exists public.weekly_summary_preferences (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  enabled boolean not null default true,
  channel text not null default 'email' check (channel in ('email', 'manual')),
  recipient_email text,
  cc_email text,
  send_day integer not null default 1 check (send_day between 0 and 6),
  send_hour integer not null default 9 check (send_hour between 0 and 23),
  timezone text not null default 'Europe/Madrid',
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id)
);

create index if not exists weekly_summary_preferences_restaurante_idx
on public.weekly_summary_preferences (restaurante_id);

alter table public.weekly_summary_preferences enable row level security;

drop policy if exists "weekly_summary_preferences_select_owner" on public.weekly_summary_preferences;
create policy "weekly_summary_preferences_select_owner"
on public.weekly_summary_preferences for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = weekly_summary_preferences.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

insert into public.weekly_summary_preferences (restaurante_id, recipient_email)
select r.id, r.email
from public.restaurantes r
where r.email is not null
on conflict (restaurante_id) do nothing;

do $$
begin
  if to_regclass('public.weekly_executive_summaries') is not null then
    alter table public.weekly_executive_summaries
      add column if not exists delivery_status text not null default 'draft',
      add column if not exists delivery_channel text,
      add column if not exists recipient_email text,
      add column if not exists delivery_error text,
      add column if not exists last_send_attempt_at timestamptz,
      add column if not exists provider_message_id text;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'weekly_executive_summaries_delivery_status_check'
    ) then
      alter table public.weekly_executive_summaries
        add constraint weekly_executive_summaries_delivery_status_check
        check (delivery_status in ('draft', 'pending', 'sent', 'failed', 'disabled'));
    end if;

    execute 'create index if not exists weekly_executive_summaries_delivery_idx on public.weekly_executive_summaries (delivery_status, last_send_attempt_at desc)';
  end if;
end $$;

-- Las escrituras se hacen desde las API server-side con service_role tras validar acceso.
