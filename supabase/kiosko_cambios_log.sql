-- P1-2: log persistente de cambios en lote hechos desde el admin
-- Objetivo: tener un historial de 'quién cambió qué y a qué valor', con
-- posibilidad de deshacer también entre sesiones (no solo durante la sesión
-- del navegador, como hace hoy el toast).
-- Aditivo. CREATE TABLE IF NOT EXISTS. La UI del admin (fase 2) funciona
-- sin esta tabla: el 'Deshacer' del toast guarda el snapshot solo en memoria
-- hasta que se cierra el toast o el usuario navega.
-- Aplica con: supabase db push  o  ejecutar en SQL editor

CREATE TABLE IF NOT EXISTS kiosko_cambios_log (
  id             BIGSERIAL    PRIMARY KEY,
  tienda_id      UUID         NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  usuario_email  TEXT,                        -- auth.users.email de quien hizo la accion
  accion         TEXT         NOT NULL,       -- 'activo' | 'destacado' | 'stock_minimo' | 'ubicacion' | 'eliminar'
  valor_nuevo    JSONB,                       -- valor aplicado (serializable)
  cambios        JSONB        NOT NULL,       -- [{id, antes: {<campo>: <valor>}}] snapshot para deshacer
  deshecho_at    TIMESTAMPTZ,                 -- cuando se deshizo (null = activo)
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kiosko_cambios_tienda_created
  ON kiosko_cambios_log(tienda_id, created_at DESC);

-- RLS: coherente con el resto del admin. service_role bypassa.
-- Si en el futuro se expone el log al usuario autenticado dueño de la tienda,
-- se añade policy SELECT con tienda_id perteneciente al usuario.
ALTER TABLE kiosko_cambios_log ENABLE ROW LEVEL SECURITY;
