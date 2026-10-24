import { createClient } from '@supabase/supabase-js'

// Los fallbacks no vacíos evitan que createClient() lance durante la generación
// estática de páginas 'use client'. En runtime (browser), los NEXT_PUBLIC_ vars
// están siempre disponibles y los fallbacks no se usan.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'build-placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)