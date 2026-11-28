// Implementación pura del guard de catálogo privado. No importa nada del
// árbol de Next/Supabase; recibe las dependencias por parámetro para que
// el test unitario pueda ejecutarse con Node directamente.
//
// Devuelve:
//   { ok: true, auth, restaurante }  si pasa
//   { error, status }                si falla (401/403/404)
export async function requireCatalogoConsultorImpl(req, restauranteId, deps) {
  const { requireRestaurantAccessFn, supabaseAdminClient, puedeUsarFn } = deps
  const auth = await requireRestaurantAccessFn(req, supabaseAdminClient, restauranteId)
  if (auth.error) return { error: auth.error, status: auth.status }

  const { data: restaurante, error: restError } = await supabaseAdminClient
    .from('restaurantes')
    .select('plan, subscription_status')
    .eq('id', restauranteId)
    .single()

  if (restError || !restaurante) {
    return { error: 'Restaurante no encontrado', status: 404 }
  }

  if (!puedeUsarFn(restaurante, 'catalogo_consultor')) {
    return { error: 'Plan no incluye el catálogo del consultor', status: 403 }
  }

  return { ok: true, auth, restaurante }
}
