-- Bucket privado para PDFs de tarifa de distribuidor.
-- Es la pareja operativa de scripts/importar-tarifa.js --pdf: cuando se ejecuta
-- en --apply, guarda el PDF original aquí y rellena tarifa.fichero_origen con la
-- ruta tarifas-pdf/<proveedor_id>/<tarifa_id>.pdf. El sha256 se guarda en
-- tarifa.fichero_hash para idempotencia (evitar reingesta del mismo fichero).
--
-- Ejecución: MANUAL. No lo aplica el worktree.
-- Expand-only (R2): sólo crea bucket, policies y una columna.

insert into storage.buckets (id, name, public)
  values ('tarifas-pdf', 'tarifas-pdf', false)
  on conflict (id) do nothing;

-- Sólo service_role puede leer/escribir. Nada de acceso anon ni authenticated.
create policy "tarifas-pdf admin read" on storage.objects
  for select using ( bucket_id = 'tarifas-pdf' and auth.role() = 'service_role' );

create policy "tarifas-pdf admin write" on storage.objects
  for insert with check ( bucket_id = 'tarifas-pdf' and auth.role() = 'service_role' );

-- Columna aditiva en tarifa para idempotencia por hash del fichero original.
alter table tarifa add column if not exists fichero_hash text;
