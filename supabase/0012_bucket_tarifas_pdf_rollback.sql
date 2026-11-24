-- Rollback de 0012_bucket_tarifas_pdf.sql
--
-- AVISO: el delete del bucket falla si contiene objetos. Si hay objetos,
-- hay que borrarlos primero con:
--   delete from storage.objects where bucket_id = 'tarifas-pdf';
-- (esto es destructivo — pide confirmación antes de ejecutar)
-- Por eso el rollback NO lo ejecuta automáticamente.

drop policy if exists "tarifas-pdf admin read" on storage.objects;
drop policy if exists "tarifas-pdf admin write" on storage.objects;

alter table tarifa drop column if exists fichero_hash;

-- Borra el bucket si ya está vacío. Si no, falla y hay que vaciarlo manualmente.
delete from storage.buckets where id = 'tarifas-pdf';
