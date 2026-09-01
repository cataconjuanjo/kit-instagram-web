/**
 * Backup completo de proveedor_catalogo_vinos → JSON local.
 * SOLO LECTURA. No modifica nada en Supabase.
 *
 * Uso: node --env-file=.env.local scripts/backup-catalogo.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Faltan variables de entorno Supabase')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CHUNK = 1000
let filas = []
let desde = 0

process.stderr.write('Exportando proveedor_catalogo_vinos...\n')

while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('*')
    .order('id')
    .range(desde, desde + CHUNK - 1)

  if (error) { console.error('Error:', error.message); process.exit(1) }

  filas = filas.concat(data || [])
  process.stderr.write(`  ${filas.length} filas...\r`)
  if (!data || data.length < CHUNK) break
  desde += CHUNK
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const archivo = `backup-proveedor_catalogo_vinos-${timestamp}.json`

writeFileSync(archivo, JSON.stringify({ exportado: new Date().toISOString(), total: filas.length, filas }, null, 2), 'utf8')

process.stderr.write(`\nBackup guardado: ${archivo} (${filas.length} filas)\n`)
console.log(archivo)
