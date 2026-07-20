alter table public.restaurantes
  add column if not exists carta_publica_activa boolean;

update public.restaurantes
set carta_publica_activa = true
where carta_publica_activa is null;

alter table public.restaurantes
  alter column carta_publica_activa set default false;

alter table public.restaurantes
  alter column carta_publica_activa set not null;

comment on column public.restaurantes.carta_publica_activa is
  'Controla si la carta/hub publica responde sin token de prueba. Las cuentas nuevas quedan en borrador hasta publicar desde QR.';
