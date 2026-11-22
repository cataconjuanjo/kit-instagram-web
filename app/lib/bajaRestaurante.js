/**
 * Baja de restaurante — módulo puro (sin supabase, sin DOM).
 *
 * Qué resuelve:
 *   `DELETE FROM restaurantes WHERE id=…` falla con 23503 cuando
 *   hay filas hijas de `vinos` apuntadas por FK SIN
 *   `ON DELETE CASCADE`. Antes de ese DELETE hay que vaciar esas
 *   filas (una por una por tabla) con el cliente service_role.
 *
 * Esta lista es la FUENTE DE VERDAD. El handler de
 * `app/api/admin/restaurantes/route.js` la importa y la recorre.
 * El test de guarda (`scripts/bajaRestaurante.test.mjs`) lee los
 * `.sql` del repo y comprueba que esta lista cubre TODAS las FKs
 * a `vinos(id)` sin cascade/set null que existen hoy — si alguien
 * añade una nueva FK sin cascade, el test falla.
 *
 * Auditado con:
 *   grep -rEn "REFERENCES\s+(public\.)?vinos\s*\(" --include='*.sql' .
 *   (fuera de .claude/worktrees, .worktrees, .codex*, .deploy*,
 *    .vercel-clean-deploy, ..kit-hotfix-2)
 *
 * FKs IGNORADAS deliberadamente:
 *   - `carta_simulacion.vino_id`          CASCADE → no bloquea.
 *   - `stock_mensual_bodega.vino_id`      CASCADE → no bloquea.
 *   - `b8a_schema.sql:90`                 CASCADE → no bloquea.
 *   - `b8a_schema.sql:193`                SET NULL → no bloquea.
 *   - FKs hacia `vinos_tienda(id)`        (tabla distinta) → no aplica.
 */

/**
 * Tablas con FK a `vinos.id` SIN `ON DELETE CASCADE` ni
 * `SET NULL`. Para cada una: nombre de tabla y lista de columnas
 * que apuntan a `vinos(id)` (varias en `duelo_carta`).
 */
export const TABLAS_HIJAS_VINOS_SIN_CASCADE = Object.freeze([
  { tabla: 'partes_servicio_lineas',    columnas: ['vino_id'],   evidencia: 'supabase/b7a_partes_servicio.sql:40' },
  { tabla: 'conteos_inventario_lineas', columnas: ['vino_id'],   evidencia: 'supabase/b3_conteos_inventario.sql:39' },
  { tabla: 'lineas_compra',             columnas: ['vino_id'],   evidencia: 'supabase/b2_compras_pmp.sql:62' },
  { tabla: 'copas_botella_abierta',     columnas: ['vino_id'],   evidencia: 'supabase/b4_copas_botella_abierta.sql:51' },
  { tabla: 'duelo_carta',               columnas: ['vino_a_id', 'vino_b_id', 'elegido_id'],
                                         evidencia: 'supabase/add_duelo_carta.sql:13-15' },
])

/**
 * Trocea una lista de ids en chunks de `tam` elementos para evitar
 * URLs demasiado largas con `.in()` (PostgREST limita ~100-200
 * parámetros por .in() antes de truncar la URL).
 */
export function trocear(ids, tam = 200) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const out = []
  for (let i = 0; i < ids.length; i += tam) out.push(ids.slice(i, i + tam))
  return out
}
