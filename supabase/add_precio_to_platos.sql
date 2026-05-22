alter table public.platos
add column if not exists precio numeric(10,2) default 0;

comment on column public.platos.precio is 'Precio del plato en euros. Se usa para ticket medio, upselling y análisis de carta.';
