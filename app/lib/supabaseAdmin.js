/**
 * Cliente Supabase con service_role key.
 * - Solo para uso en rutas de servidor (app/api/...)
 * - NUNCA importar desde componentes de cliente
 * - Bypassa RLS — úsalo solo cuando sea necesario
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  console.warn('[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY no definida; las rutas admin fallaran hasta configurarla')
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || 'missing-service-role-key',
  { auth: { persistSession: false } }
)
