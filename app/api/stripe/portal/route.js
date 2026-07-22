import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurantAccess } from '../../_lib/auth'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const SELECT_RESTAURANTE_PORTAL = 'stripe_customer_id, nombre, email'

async function leerBody(req) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

// Redirige al restaurante al portal de cliente de Stripe
// donde puede cambiar de plan, actualizar tarjeta o cancelar
export async function POST(req) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: 'Stripe no configurado.' }, { status: 503 })
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Supabase no configurado para facturacion.' }, { status: 503 })
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const { restaurante_id } = await leerBody(req)
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const auth = await requireRestaurantAccess(req, adminSupabase, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: rest } = await adminSupabase
      .from('restaurantes')
      .select(SELECT_RESTAURANTE_PORTAL)
      .eq('id', restaurante_id)
      .single()

    if (!rest?.stripe_customer_id) {
      return Response.json(
        { error: 'Este restaurante no tiene una suscripción activa de Stripe.' },
        { status: 404 }
      )
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   rest.stripe_customer_id,
      return_url: `${SITE_URL}/dashboard/ajustes`,
    })

    return Response.json({ url: portalSession.url })
  } catch (error) {
    console.error('Error creando portal session:', error)
    return Response.json({ error: 'No se pudo abrir el portal de facturación.' }, { status: 500 })
  }
}
