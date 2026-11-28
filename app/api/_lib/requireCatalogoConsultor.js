import { requireRestaurantAccess } from './auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { puedeUsar } from '../../lib/plans'
import { requireCatalogoConsultorImpl } from './requireCatalogoConsultorImpl.js'

// Guard único para los endpoints que leen o escriben datos del catálogo
// privado de proveedores (proveedor_catalogo_vinos / proveedores_vino).
//
// REGLA: la feature `catalogo_consultor` se evalúa sobre el PLAN DEL
// RESTAURANTE. El admin NO salta este control: si viene con una sesión
// admin pero el restaurante tiene plan pro/bodega/sumiller, devuelve 403
// igual que a un dueño con ese plan. Esto evita que el consultor vea por
// error datos del catálogo privado al probar la vista de un cliente.
//
// Las rutas /api/admin/* mantienen su propio bypass de admin (ahí sí es
// deliberado: son herramientas internas del consultor).
//
// Dependencias reales — las usan todos los endpoints productivos.
// La lógica pura vive en requireCatalogoConsultorImpl.js para que el test
// unitario pueda inyectar mocks sin arrastrar supabaseAdmin.
export async function requireCatalogoConsultor(req, restauranteId) {
  return requireCatalogoConsultorImpl(req, restauranteId, {
    requireRestaurantAccessFn: requireRestaurantAccess,
    supabaseAdminClient: supabaseAdmin,
    puedeUsarFn: puedeUsar,
  })
}

export { requireCatalogoConsultorImpl }
