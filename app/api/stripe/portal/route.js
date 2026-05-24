import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

// Redirige al restaurante al portal de cliente de Stripe
// donde puede cambiar de plan, actualizar tarjeta o cancelar
export async function POST(req) {
  try {
    const { restaurante_id } = await req.json()
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: rest } = await adminSupabase
      .from('restaurantes')
      .select('stripe_customer_id, nombre, email')
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
