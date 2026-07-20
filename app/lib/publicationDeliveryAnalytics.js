export const PUBLICATION_DELIVERY_EVENTS = new Set([
  'preview_generated',
  'preview_link_copied',
  'preview_message_copied',
  'preview_opened_from_dashboard',
  'preview_approved',
  'preview_approval_refreshed',
  'publication_published',
  'publication_paused',
  'qr_downloaded',
  'qr_print_opened',
  'public_link_copied',
  'team_message_copied',
  'public_destination_opened',
  'quick_view_opened',
])

export function normalizarDeliveryEvent(valor) {
  const event = String(valor || '').trim()
  return PUBLICATION_DELIVERY_EVENTS.has(event) ? event : ''
}

export function normalizarDeliveryDestino(valor) {
  return valor === 'hub' ? 'hub' : 'carta'
}

export function deliveryAnalyticsPendiente(error) {
  const texto = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase()
  return texto.includes('publication_delivery_events') ||
    texto.includes('schema cache') ||
    ['42P01', 'PGRST204', 'PGRST205'].includes(String(error?.code || ''))
}

function metadataSegura(metadata = {}) {
  try {
    const serializada = JSON.stringify(metadata || {})
    if (serializada.length <= 4000) return JSON.parse(serializada)
    return {
      truncated: true,
      value: serializada.slice(0, 3900),
    }
  } catch {
    return {}
  }
}

export async function guardarDeliveryEvent(supabase, {
  restauranteId,
  event,
  destino = 'carta',
  metadata = {},
  auth = null,
  userAgent = '',
} = {}) {
  const evento = normalizarDeliveryEvent(event)
  if (!restauranteId || !evento) return { ignored: true }

  const { data, error } = await supabase
    .from('publication_delivery_events')
    .insert({
      restaurante_id: restauranteId,
      event: evento,
      destino: normalizarDeliveryDestino(destino),
      metadata: metadataSegura(metadata),
      actor_id: auth?.user?.id || null,
      actor_email: (auth?.user?.email || '').toLowerCase() || null,
      user_agent: String(userAgent || '').slice(0, 300),
    })
    .select('id, restaurante_id, event, destino, metadata, actor_email, created_at')
    .single()

  if (deliveryAnalyticsPendiente(error)) {
    return {
      pendiente: true,
      sql: 'supabase/add_publication_delivery_events.sql',
    }
  }
  if (error) return { error }
  return { evento: data }
}
