-- Modo Escaparate: timeout configurable de inactividad antes de entrar en carrusel
-- 0 = desactivado (nunca entra en carrusel automáticamente)
-- >0 = segundos de inactividad hasta entrar en modo carrusel
-- DEFAULT 60 para tiendas existentes
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS escaparate_timeout_segundos integer DEFAULT 60;
