-- Schema drift repair detected during the Carta Viva post-audit hardening.
-- Safe to run more than once in Supabase SQL Editor after the base schema exists.

alter table public.restaurantes
  add column if not exists provincia text,
  add column if not exists region text,
  add column if not exists ticket_medio numeric,
  add column if not exists ticket_comida numeric,
  add column if not exists ticket_medio_comida numeric;

comment on column public.restaurantes.provincia is
  'Optional province or local area used by admin, public hub copy and regional heuristics.';

comment on column public.restaurantes.region is
  'Optional broader operating region used by regional heuristics.';

comment on column public.restaurantes.ticket_medio is
  'Legacy average ticket fallback kept for compatibility with pricing helpers.';

comment on column public.restaurantes.ticket_comida is
  'Legacy food ticket fallback kept for compatibility with pricing helpers.';

comment on column public.restaurantes.ticket_medio_comida is
  'Average food ticket used by consultant, waiter and pricing flows.';

do $$
begin
  if to_regclass('public.pos_import_batches') is not null then
    alter table public.pos_import_batches
      add column if not exists archivo_hash text,
      add column if not exists duplicate_of uuid references public.pos_import_batches(id) on delete set null,
      add column if not exists filas_duplicadas integer not null default 0;

    execute 'create unique index if not exists pos_import_batches_rest_hash_idx
      on public.pos_import_batches (restaurante_id, archivo_hash)
      where archivo_hash is not null';
  end if;

  if to_regclass('public.pos_sale_lines') is not null then
    alter table public.pos_sale_lines
      add column if not exists line_hash text,
      add column if not exists duplicada boolean not null default false,
      add column if not exists duplicate_of uuid references public.pos_sale_lines(id) on delete set null;

    execute 'create index if not exists pos_sale_lines_rest_hash_idx
      on public.pos_sale_lines (restaurante_id, line_hash)
      where line_hash is not null';
  end if;
end $$;
