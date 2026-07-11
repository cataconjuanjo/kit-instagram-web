-- Fase 7.6 - Trazabilidad operativa de automatismos.

create table if not exists public.automation_run_logs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  job_type text not null default 'api' check (job_type in ('cron', 'api', 'event', 'manual')),
  trigger_source text,
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  idempotency_key text,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  processed_count integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  skipped_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists automation_run_logs_job_started_idx
on public.automation_run_logs (job_key, started_at desc);

create index if not exists automation_run_logs_status_started_idx
on public.automation_run_logs (status, started_at desc);

create index if not exists automation_run_logs_restaurante_started_idx
on public.automation_run_logs (restaurante_id, started_at desc);

create index if not exists automation_run_logs_idempotency_idx
on public.automation_run_logs (job_key, idempotency_key);

alter table public.automation_run_logs enable row level security;

drop policy if exists "automation_run_logs_select_owner" on public.automation_run_logs;
create policy "automation_run_logs_select_owner"
on public.automation_run_logs for select
using (
  restaurante_id is null
  or exists (
    select 1 from public.restaurantes r
    where r.id = automation_run_logs.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
